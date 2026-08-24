import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const offlineRoot = dirname(fileURLToPath(import.meta.url))
const dshRoot = resolve(offlineRoot, '..')
const repoRoot = resolve(dshRoot, '..', '..')
const runsRoot = resolve(offlineRoot, 'runs')
const resultsRoot = resolve(offlineRoot, 'results')
const dshBin = resolve(dshRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const thoughtmlBinary = resolve(repoRoot, 'target', 'debug', 'thoughtml.exe')
const plugins = {
  mock: pathToFileURL(resolve(dshRoot, 'plugins', 'mock-llm.js')).href,
  operation: pathToFileURL(resolve(dshRoot, 'plugins', 'mock-operation.js')).href,
  state: pathToFileURL(resolve(repoRoot, 'integrations', 'dsh', 'src', 'index.js')).href,
  metrics: pathToFileURL(resolve(repoRoot, 'integrations', 'dsh', 'src', 'metrics.js')).href,
  logger: pathToFileURL(resolve(dshRoot, 'plugins', 'event-logger.js')).href,
}

function quoteYaml(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function assertWithin(parent, child) {
  const rel = relative(parent, child)
  if (rel === '' || rel.startsWith('..') || rel.includes(':')) {
    throw new Error(`unsafe generated path outside ${parent}: ${child}`)
  }
}

async function resetRunDirectory(runDir) {
  assertWithin(runsRoot, runDir)
  await rm(runDir, { recursive: true, force: true })
  await mkdir(runDir, { recursive: true })
}

function patchFor(condition, stateRoot, logDir, metricsDir) {
  const entries = [
    '- id: agent-default-model',
    '  config:',
    `    provider: ${quoteYaml('thoughtml-study-mock')}`,
    `    model: ${quoteYaml('deterministic-v1')}`,
    '- id: session-title-llm',
    '  disabled: true',
    '- id: llm-deepseek',
    '  disabled: true',
    '- id: llm-pi-ai',
    '  disabled: true',
    '- id: session-telemetry-otel',
    '  disabled: true',
    '- id: web-search-deepseek',
    '  disabled: true',
    '- insert:',
    '    - id: study-mock-llm',
    `      name: ${quoteYaml(plugins.mock)}`,
    '      config:',
    `        condition: ${quoteYaml(condition)}`,
    '    - id: study-mock-operation',
    `      name: ${quoteYaml(plugins.operation)}`,
    '    - id: study-event-logger',
    `      name: ${quoteYaml(plugins.logger)}`,
    '      config:',
    `        condition: ${quoteYaml(condition)}`,
    `        outputDir: ${quoteYaml(logDir.replaceAll('\\', '/'))}`,
    '    - id: study-metrics',
    `      name: ${quoteYaml(plugins.metrics)}`,
    '      config:',
    `        condition: ${quoteYaml(condition)}`,
    `        format: ${quoteYaml(condition === 'M' ? 'markdown' : condition === 'T' ? 'thoughtml' : 'none')}`,
    `        outputDir: ${quoteYaml(metricsDir.replaceAll('\\', '/'))}`,
  ]
  if (condition !== 'D') {
    entries.push(
      '    - id: study-reasoning-state',
      `      name: ${quoteYaml(plugins.state)}`,
      '      config:',
      `        format: ${quoteYaml(condition === 'M' ? 'markdown' : 'thoughtml')}`,
      `        stateRoot: ${quoteYaml(stateRoot.replaceAll('\\', '/'))}`,
      `        thoughtmlBinary: ${quoteYaml(thoughtmlBinary.replaceAll('\\', '/'))}`,
      '        strict: true',
      '        maxStateBytes: 65536',
      '        maxContextChars: 12000',
      '        historyLimit: 50',
      '        recoveryGuidance: true',
    )
  }
  return `${entries.join('\n')}\n`
}

async function findSingleFile(root, filename) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  const matches = entries
    .filter((entry) => entry.isFile() && entry.name === filename)
    .map((entry) => resolve(entry.parentPath, entry.name))
    .filter((path) => relative(root, path).split(sep).length === 2)
  if (matches.length !== 1) {
    throw new Error(`expected one ${filename} below ${root}, found ${matches.length}`)
  }
  return matches[0]
}

async function spawnChecked(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      ...options,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const timer = setTimeout(() => child.kill(), 30000)
    child.on('error', reject)
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolvePromise({ code, signal, stdout, stderr })
    })
  })
}

function parseJsonLines(content) {
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function counts(values) {
  const result = {}
  for (const value of values) result[value] = (result[value] ?? 0) + 1
  return result
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

async function runCondition(condition) {
  const runDir = resolve(runsRoot, condition)
  await resetRunDirectory(runDir)
  const workspace = resolve(runDir, 'workspace')
  const logDir = resolve(runDir, 'logs')
  const metricsDir = resolve(runDir, 'metrics')
  const stateRoot = resolve(runDir, 'state')
  const dshHome = resolve(runDir, 'dsh-home')
  await mkdir(workspace, { recursive: true })
  await mkdir(logDir, { recursive: true })
  await mkdir(metricsDir, { recursive: true })
  await mkdir(stateRoot, { recursive: true })
  await mkdir(dshHome, { recursive: true })
  const patchPath = resolve(runDir, 'offline.patch.yml')
  await writeFile(patchPath, patchFor(condition, stateRoot, logDir, metricsDir), 'utf8')

  const env = { ...process.env }
  for (const key of [
    'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_BASE_URL',
    'GOOGLE_API_KEY',
    'OPENAI_API_KEY',
  ]) delete env[key]
  env.DSH_HOME = dshHome
  env.DSH_TELEMETRY_MODE = 'DISABLED'

  const task = `Offline deterministic integration check for condition ${condition}.`
  const child = await spawnChecked(
    process.execPath,
    [dshBin, '--profile', 'headless', '--patch', patchPath, task],
    { cwd: workspace, env },
  )
  await writeFile(resolve(runDir, 'stdout.txt'), child.stdout, 'utf8')
  await writeFile(resolve(runDir, 'stderr.txt'), child.stderr, 'utf8')

  const expectedText = `offline mock complete (${condition})`
  if (child.code !== 0) {
    throw new Error(`condition ${condition} exited ${child.code}: ${child.stderr || child.stdout}`)
  }
  if (!child.stdout.includes(expectedText)) {
    throw new Error(`condition ${condition} did not print ${JSON.stringify(expectedText)}`)
  }

  const eventContent = await readFile(resolve(logDir, 'events.jsonl'), 'utf8')
  const toolContent = await readFile(resolve(logDir, 'tools.jsonl'), 'utf8')
  const observer = JSON.parse(await readFile(resolve(logDir, 'observer.json'), 'utf8'))
  const events = parseJsonLines(eventContent)
  const tools = parseJsonLines(toolContent)
  if (observer.deepseekCredentialPresent) throw new Error('mock observer saw a DeepSeek credential')
  if (observer.telemetryMode !== 'DISABLED') throw new Error('telemetry was not explicitly disabled')

  const eventTypes = counts(events.map((event) => event.type))
  for (const required of ['turn/start', 'user/message', 'assistant/message', 'turn/end']) {
    if (!eventTypes[required]) throw new Error(`condition ${condition} lacks ${required}`)
  }

  const expectedTools = condition === 'D'
    ? ['offline_operation', 'offline_operation']
    : ['offline_operation', 'reasoning_state_commit', 'reasoning_state_read', 'reasoning_state_inspect', 'offline_operation']
  const observedTools = tools.map((tool) => tool.name)
  if (JSON.stringify(observedTools) !== JSON.stringify(expectedTools)) {
    throw new Error(`condition ${condition} tool sequence mismatch: ${JSON.stringify(observedTools)}`)
  }
  if (tools[0]?.name !== 'offline_operation' || tools[0]?.ok !== false) {
    throw new Error(`condition ${condition} did not expose the expected first-attempt failure`)
  }
  if (tools.slice(1).some((tool) => tool.ok !== true)) {
    throw new Error(`condition ${condition} contains an unexpected failure after the first attempt`)
  }

  const requestHeaders = events
    .filter((event) => event.type === 'request/header')
    .map((event) => event.data?.header?.config)
    .filter(Boolean)
  const requestProviders = [...new Set(requestHeaders.map((config) => config.provider))]
  const requestModels = [...new Set(requestHeaders.map((config) => config.model))]
  if (JSON.stringify(requestProviders) !== JSON.stringify(['thoughtml-study-mock'])) {
    throw new Error(`condition ${condition} used unexpected request providers: ${JSON.stringify(requestProviders)}`)
  }
  if (JSON.stringify(requestModels) !== JSON.stringify(['deterministic-v1'])) {
    throw new Error(`condition ${condition} used unexpected request models: ${JSON.stringify(requestModels)}`)
  }

  let state = null
  let stateValidation = null
  if (condition !== 'D') {
    const stateName = condition === 'M' ? 'state.md' : 'state.thml'
    const statePath = await findSingleFile(stateRoot, stateName)
    const stateContent = await readFile(statePath, 'utf8')
    state = {
      filename: stateName,
      bytes: Buffer.byteLength(stateContent, 'utf8'),
      sha256: sha256(stateContent),
    }

    const inspectionTool = tools.find((tool) => tool.name === 'reasoning_state_inspect')
    const validationText = inspectionTool?.content?.find((block) => block.type === 'text')?.text
    if (!validationText) throw new Error(`condition ${condition} inspection returned no text result`)
    try {
      stateValidation = JSON.parse(validationText)
    } catch (error) {
      throw new Error(`condition ${condition} validation was not JSON: ${error.message}`)
    }
    if (stateValidation.validation?.valid !== true || stateValidation.revision !== 1) {
      throw new Error(`condition ${condition} state inspection failed: ${validationText}`)
    }
    if (JSON.stringify(stateValidation.history?.map((entry) => entry.revision)) !== JSON.stringify([1, 0])) {
      throw new Error(`condition ${condition} did not preserve revision history 1 -> 0`)
    }
    stateValidation = {
      revision: stateValidation.revision,
      format: stateValidation.format,
      sha256: stateValidation.sha256,
      bytes: stateValidation.bytes,
      validation: stateValidation.validation,
      analysis: stateValidation.analysis,
      history: stateValidation.history.map(({ committedAt, ...entry }) => entry),
      historyTruncated: stateValidation.historyTruncated,
    }
  }

  const metricsSummary = JSON.parse(await readFile(resolve(metricsDir, 'metrics-summary.json'), 'utf8'))
  if (metricsSummary.credentialPresent) throw new Error(`condition ${condition} metrics saw a DeepSeek credential`)
  if (metricsSummary.telemetryMode !== 'DISABLED') throw new Error(`condition ${condition} metrics saw telemetry enabled`)
  const metrics = metricsSummary.sessions[0]
  if (!metrics || metrics.failedToolCalls !== 1 || metrics.recoveryEpisodesStarted !== 1 || metrics.recoveryEpisodesCompleted !== 1) {
    throw new Error(`condition ${condition} recovery metrics are incomplete`)
  }
  if (condition !== 'D' && (metrics.stateCommits !== 1 || metrics.stateCheckpointsAfterFailure !== 1 || metrics.latestStateRevision !== 1)) {
    throw new Error(`condition ${condition} state metrics are incomplete`)
  }

  const sessionRootExists = await stat(resolve(dshHome, 'sessions')).then(() => true, () => false)
  if (!sessionRootExists) throw new Error(`condition ${condition} did not persist a DSH session`)

  const { sessionId: _sessionId, ...stableMetrics } = metrics
  return {
    condition,
    exitCode: child.code,
    finalText: expectedText,
    eventCount: events.length,
    eventTypes,
    toolNames: observedTools,
    requestProviders,
    requestModels,
    state,
    stateValidation,
    metrics: stableMetrics,
    telemetryMode: observer.telemetryMode,
    deepseekCredentialPresent: observer.deepseekCredentialPresent,
    persistedSession: sessionRootExists,
  }
}

async function main() {
  await mkdir(runsRoot, { recursive: true })
  await mkdir(resultsRoot, { recursive: true })
  const dshVersion = JSON.parse(await readFile(resolve(dshRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8')).version
  const thoughtmlVersion = (await spawnChecked(thoughtmlBinary, ['--version'], { cwd: repoRoot, env: process.env })).stdout.trim()
  const conditions = []
  for (const condition of ['D', 'M', 'T']) conditions.push(await runCondition(condition))
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: 'offline-deterministic-mock',
    networkModelCalls: 0,
    dshVersion,
    thoughtmlVersion,
    conditions,
  }
  await writeFile(resolve(resultsRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
