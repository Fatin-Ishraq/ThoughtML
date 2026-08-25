import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { createFormatAdapter } from './formats.js'

const CURRENT_SCHEMA_VERSION = 1

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

function safeSessionDirectoryName(sessionId) {
  const slug = String(sessionId)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'session'
  return `${slug}-${sha256(String(sessionId)).slice(0, 12)}`
}

function assertWithin(parent, child) {
  const rel = relative(resolve(parent), resolve(child))
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`reasoning-state path escaped its root: ${child}`)
  }
}

function atomicWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' })
  try {
    renameSync(temporary, path)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
}

function parseJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function stateRootForAgent(agent, configuredRoot) {
  if (configuredRoot) return resolve(configuredRoot)
  const cwd = agent?.session?.header?.cwd
  if (!cwd || !isAbsolute(cwd)) {
    throw new Error('reasoning-state requires an absolute session cwd or configured stateRoot')
  }
  return resolve(cwd, '.thoughtml', 'dsh', 'sessions')
}

export class SessionStateStore {
  constructor(options = {}) {
    this.format = options.format ?? 'thoughtml'
    this.adapter = createFormatAdapter(this.format, options)
    this.stateRoot = options.stateRoot ? resolve(options.stateRoot) : null
    this.maxStateBytes = options.maxStateBytes ?? 64 * 1024
    this.maxContextChars = options.maxContextChars ?? 12000
    this.maxAnalysisChars = options.maxAnalysisChars ?? 12000
    this.historyLimit = options.historyLimit ?? 50
    if (!Number.isSafeInteger(this.maxStateBytes) || this.maxStateBytes <= 0) {
      throw new Error('maxStateBytes must be a positive safe integer')
    }
    if (!Number.isSafeInteger(this.maxContextChars) || this.maxContextChars <= 0) {
      throw new Error('maxContextChars must be a positive safe integer')
    }
    if (!Number.isSafeInteger(this.maxAnalysisChars) || this.maxAnalysisChars <= 0) {
      throw new Error('maxAnalysisChars must be a positive safe integer')
    }
    if (!Number.isSafeInteger(this.historyLimit) || this.historyLimit <= 0) {
      throw new Error('historyLimit must be a positive safe integer')
    }
  }

  paths(agent) {
    if (!agent?.id) throw new Error('reasoning-state tool requires a DSH agent identity')
    const root = stateRootForAgent(agent, this.stateRoot)
    const sessionDir = resolve(root, safeSessionDirectoryName(agent.id))
    assertWithin(root, sessionDir)
    const historyDir = resolve(sessionDir, 'history')
    return {
      root,
      sessionDir,
      historyDir,
      current: resolve(sessionDir, 'current.json'),
      visible: resolve(sessionDir, `state.${this.adapter.extension}`),
    }
  }

  ensure(agent) {
    const paths = this.paths(agent)
    if (!existsSync(paths.current)) {
      this.#initialize(agent, paths)
    }
    const current = this.#readCurrent(paths)
    this.#materialize(paths, current)
    return this.#snapshot(paths, current)
  }

  read(agent) {
    const snapshot = this.ensure(agent)
    return {
      revision: snapshot.revision,
      format: snapshot.format,
      content: snapshot.content,
      sha256: snapshot.sha256,
      bytes: snapshot.bytes,
      path: snapshot.path,
      validation: snapshot.validation,
    }
  }

  commit(agent, { content, expectedRevision, reason }) {
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('content must be a non-empty string')
    }
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error('expectedRevision must be a non-negative safe integer')
    }
    if (typeof reason !== 'string' || reason.trim().length === 0 || reason.length > 500) {
      throw new Error('reason must be a non-empty string of at most 500 characters')
    }
    const paths = this.paths(agent)
    const before = this.ensure(agent)
    const bytes = Buffer.byteLength(content, 'utf8')
    if (bytes > this.maxStateBytes) {
      return this.#rejected(before, `state exceeds ${this.maxStateBytes} bytes`, [])
    }

    if (before.revision !== expectedRevision) {
      return this.#rejected(
        before,
        `stale revision: expected ${expectedRevision}, current is ${before.revision}`,
        [],
      )
    }
    const contentHash = sha256(content)
    if (contentHash === before.sha256) {
      return {
        committed: false,
        changed: false,
        revision: before.revision,
        sha256: before.sha256,
        bytes: before.bytes,
        path: before.path,
        validation: before.validation,
        reason: 'content unchanged',
      }
    }

    mkdirSync(paths.historyDir, { recursive: true })
    const candidate = resolve(paths.sessionDir, `.candidate.${randomUUID()}.${this.adapter.extension}`)
    assertWithin(paths.sessionDir, candidate)
    writeFileSync(candidate, content, { encoding: 'utf8', flag: 'wx' })
    let validation
    try {
      validation = this.adapter.validate(candidate)
      if (!existsSync(candidate)) throw new Error('reasoning-state validator unexpectedly removed its candidate file')
    } catch (error) {
      rmSync(candidate, { force: true })
      throw error
    }
    if (!validation.valid) {
      rmSync(candidate, { force: true })
      return this.#rejected(before, validation.summary, validation.diagnostics)
    }

    const revision = before.revision + 1
    const entryId = `${String(revision).padStart(6, '0')}-${contentHash.slice(0, 12)}-${randomUUID().slice(0, 8)}`
    const entryDir = resolve(paths.historyDir, entryId)
    assertWithin(paths.historyDir, entryDir)
    mkdirSync(entryDir, { recursive: false })
    const stateFile = resolve(entryDir, `state.${this.adapter.extension}`)
    const committedAt = new Date().toISOString()
    const metadata = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      sessionId: String(agent.id),
      format: this.format,
      revision,
      entryId,
      previousEntryId: before.entryId,
      sha256: contentHash,
      bytes,
      reason: reason.trim(),
      committedAt,
    }
    try {
      renameSync(candidate, stateFile)
      writeFileSync(resolve(entryDir, 'commit.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
      atomicWrite(paths.visible, content)
      atomicWrite(paths.current, `${JSON.stringify(metadata, null, 2)}\n`)
    } catch (error) {
      rmSync(candidate, { force: true })
      throw error
    }

    return {
      committed: true,
      changed: true,
      revision,
      sha256: contentHash,
      bytes,
      path: paths.visible,
      validation,
      reason: metadata.reason,
    }
  }

  inspect(agent) {
    const snapshot = this.ensure(agent)
    const paths = this.paths(agent)
    const analysis = this.adapter.inspect(paths.visible)
    const history = []
    let entryId = snapshot.entryId
    const seen = new Set()
    while (entryId && history.length < this.historyLimit && !seen.has(entryId)) {
      seen.add(entryId)
      const commitPath = resolve(paths.historyDir, entryId, 'commit.json')
      assertWithin(paths.historyDir, commitPath)
      if (!existsSync(commitPath)) break
      const commit = parseJson(commitPath)
      history.push({
        revision: commit.revision,
        sha256: commit.sha256,
        bytes: commit.bytes,
        reason: commit.reason,
        committedAt: commit.committedAt,
      })
      entryId = commit.previousEntryId
    }
    return {
      revision: snapshot.revision,
      format: this.format,
      sha256: snapshot.sha256,
      bytes: snapshot.bytes,
      path: snapshot.path,
      validation: snapshot.validation,
      analysis,
      history,
      historyTruncated: Boolean(entryId),
    }
  }

  diff(agent, { fromRevision, toRevision }) {
    this.#requireRevision(fromRevision, 'fromRevision')
    this.#requireRevision(toRevision, 'toRevision')
    const paths = this.paths(agent)
    const current = this.ensure(agent)
    const before = this.#readRevision(agent, paths, current, fromRevision)
    const after = this.#readRevision(agent, paths, current, toRevision)
    const bounded = this.#boundedText(this.adapter.diff(before.stateFile, after.stateFile))
    return {
      format: this.format,
      fromRevision,
      toRevision,
      fromSha256: before.sha256,
      toSha256: after.sha256,
      output: bounded.output,
      truncated: bounded.truncated,
    }
  }

  explain(agent, { target, revision }) {
    if (typeof target !== 'string' || target.trim().length === 0 || target.length > 200) {
      throw new Error('target must be a non-empty string of at most 200 characters')
    }
    const paths = this.paths(agent)
    const current = this.ensure(agent)
    const selectedRevision = revision ?? current.revision
    this.#requireRevision(selectedRevision, 'revision')
    const snapshot = this.#readRevision(agent, paths, current, selectedRevision)
    const bounded = this.#boundedText(this.adapter.explain(snapshot.stateFile, target.trim()))
    return {
      format: this.format,
      revision: selectedRevision,
      sha256: snapshot.sha256,
      target: target.trim(),
      output: bounded.output,
      truncated: bounded.truncated,
    }
  }

  analyze(agent, { revision } = {}) {
    const paths = this.paths(agent)
    const current = this.ensure(agent)
    const selectedRevision = revision ?? current.revision
    this.#requireRevision(selectedRevision, 'revision')
    const snapshot = this.#readRevision(agent, paths, current, selectedRevision)
    const analysis = this.adapter.analyze(snapshot.stateFile)
    const serialized = JSON.stringify(analysis)
    const boundedAnalysis = serialized.length <= this.maxAnalysisChars
      ? analysis
      : {
        mode: analysis.mode,
        objectCount: analysis.objectCount,
        itemCount: analysis.itemCount,
        relationCount: analysis.relationCount,
        stanceCount: analysis.stanceCount,
        conflictCount: analysis.conflictCount,
        outputReduced: true,
        limitations: [
          ...(Array.isArray(analysis.limitations) ? analysis.limitations : []),
          `Detailed analysis exceeded the ${this.maxAnalysisChars}-character tool-output limit and was reduced to counts.`,
        ],
      }
    return {
      format: this.format,
      revision: selectedRevision,
      sha256: snapshot.sha256,
      analysis: boundedAnalysis,
    }
  }

  context(agent) {
    const snapshot = this.ensure(agent)
    const header = `Persistent reasoning state (${this.format}, revision ${snapshot.revision}, sha256 ${snapshot.sha256.slice(0, 12)}):`
    if (snapshot.content.length > this.maxContextChars) {
      return `${header}\nState is ${snapshot.content.length} characters, above the ${this.maxContextChars}-character injection limit. Call reasoning_state_read before relying on it.`
    }
    return `${header}\n\n${snapshot.content}`
  }

  #initialize(agent, paths) {
    mkdirSync(paths.historyDir, { recursive: true })
    const content = this.adapter.initialContent
    const bytes = Buffer.byteLength(content, 'utf8')
    if (bytes > this.maxStateBytes) throw new Error('initial state exceeds maxStateBytes')
    const candidate = resolve(paths.sessionDir, `.initial.${randomUUID()}.${this.adapter.extension}`)
    writeFileSync(candidate, content, { encoding: 'utf8', flag: 'wx' })
    const validation = this.adapter.validate(candidate)
    if (!validation.valid) {
      rmSync(candidate, { force: true })
      throw new Error(`initial ${this.format} state is invalid: ${validation.summary}`)
    }
    const contentHash = sha256(content)
    const entryId = `000000-${contentHash.slice(0, 12)}`
    const entryDir = resolve(paths.historyDir, entryId)
    mkdirSync(entryDir, { recursive: true })
    const stateFile = resolve(entryDir, `state.${this.adapter.extension}`)
    if (!existsSync(stateFile)) renameSync(candidate, stateFile)
    else rmSync(candidate, { force: true })
    const committedAt = new Date().toISOString()
    const metadata = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      sessionId: String(agent.id),
      format: this.format,
      revision: 0,
      entryId,
      previousEntryId: null,
      sha256: contentHash,
      bytes,
      reason: 'session state initialized',
      committedAt,
    }
    if (!existsSync(resolve(entryDir, 'commit.json'))) {
      writeFileSync(resolve(entryDir, 'commit.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
    }
    atomicWrite(paths.visible, content)
    atomicWrite(paths.current, `${JSON.stringify(metadata, null, 2)}\n`)
  }

  #readCurrent(paths) {
    const current = parseJson(paths.current)
    if (current.schemaVersion !== CURRENT_SCHEMA_VERSION) throw new Error('unsupported reasoning-state metadata schema')
    if (current.format !== this.format) throw new Error(`state format mismatch: ${current.format} !== ${this.format}`)
    if (!Number.isSafeInteger(current.revision) || current.revision < 0) throw new Error('invalid current revision')
    if (typeof current.entryId !== 'string' || typeof current.sha256 !== 'string') throw new Error('invalid current metadata')
    const entryDir = resolve(paths.historyDir, current.entryId)
    assertWithin(paths.historyDir, entryDir)
    const commitPath = resolve(entryDir, 'commit.json')
    if (!existsSync(commitPath)) throw new Error(`current revision metadata is missing: ${current.entryId}`)
    const committed = parseJson(commitPath)
    for (const key of ['schemaVersion', 'sessionId', 'format', 'revision', 'entryId', 'sha256', 'bytes']) {
      if (committed[key] !== current[key]) throw new Error(`current pointer does not match commit metadata: ${key}`)
    }
    const stateFile = resolve(entryDir, `state.${this.adapter.extension}`)
    assertWithin(paths.historyDir, stateFile)
    if (!existsSync(stateFile)) throw new Error(`current state revision is missing: ${current.entryId}`)
    const content = readFileSync(stateFile, 'utf8')
    if (sha256(content) !== current.sha256) throw new Error('current state hash mismatch')
    if (Buffer.byteLength(content, 'utf8') !== current.bytes) throw new Error('current state byte count mismatch')
    return { ...current, content, stateFile }
  }

  #requireRevision(revision, name) {
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new Error(`${name} must be a non-negative safe integer`)
    }
  }

  #readRevision(agent, paths, current, revision) {
    if (revision > current.revision) {
      throw new Error(`reasoning-state revision ${revision} does not exist; current is ${current.revision}`)
    }
    let entryId = current.entryId
    const seen = new Set()
    while (entryId && !seen.has(entryId)) {
      seen.add(entryId)
      if (seen.size > 10000) throw new Error('reasoning-state revision history exceeds the safe traversal limit')
      const entryDir = resolve(paths.historyDir, entryId)
      assertWithin(paths.historyDir, entryDir)
      const commitPath = resolve(entryDir, 'commit.json')
      if (!existsSync(commitPath)) throw new Error(`reasoning-state revision metadata is missing: ${entryId}`)
      const commit = parseJson(commitPath)
      if (commit.schemaVersion !== CURRENT_SCHEMA_VERSION
        || commit.sessionId !== String(agent.id)
        || commit.format !== this.format
        || commit.entryId !== entryId
        || !Number.isSafeInteger(commit.revision)
        || commit.revision < 0
        || typeof commit.sha256 !== 'string'
        || !Number.isSafeInteger(commit.bytes)
        || commit.bytes < 0) {
        throw new Error(`invalid reasoning-state revision metadata: ${entryId}`)
      }
      if (commit.revision === revision) {
        const stateFile = resolve(entryDir, `state.${this.adapter.extension}`)
        assertWithin(paths.historyDir, stateFile)
        if (!existsSync(stateFile)) throw new Error(`reasoning-state revision ${revision} content is missing`)
        const content = readFileSync(stateFile, 'utf8')
        if (sha256(content) !== commit.sha256) throw new Error(`reasoning-state revision ${revision} hash mismatch`)
        if (Buffer.byteLength(content, 'utf8') !== commit.bytes) {
          throw new Error(`reasoning-state revision ${revision} byte count mismatch`)
        }
        return { ...commit, content, stateFile }
      }
      if (commit.revision < revision) break
      entryId = commit.previousEntryId
    }
    throw new Error(`reasoning-state revision ${revision} was not found`)
  }

  #boundedText(value) {
    const text = String(value)
    if (text.length <= this.maxAnalysisChars) return { output: text, truncated: false }
    const suffix = `\n\n[output truncated at ${this.maxAnalysisChars} characters]`
    return {
      output: `${text.slice(0, Math.max(0, this.maxAnalysisChars - suffix.length))}${suffix}`,
      truncated: true,
    }
  }

  #materialize(paths, current) {
    const visibleMatches = existsSync(paths.visible)
      && sha256(readFileSync(paths.visible, 'utf8')) === current.sha256
    if (!visibleMatches) atomicWrite(paths.visible, current.content)
  }

  #snapshot(paths, current) {
    const validation = this.adapter.validate(current.stateFile)
    if (!validation.valid) throw new Error(`committed reasoning state became invalid: ${validation.summary}`)
    return {
      revision: current.revision,
      entryId: current.entryId,
      format: this.format,
      content: current.content,
      sha256: current.sha256,
      bytes: current.bytes,
      path: paths.visible,
      validation,
    }
  }

  #rejected(snapshot, summary, diagnostics) {
    return {
      committed: false,
      changed: false,
      revision: snapshot.revision,
      sha256: snapshot.sha256,
      bytes: snapshot.bytes,
      path: snapshot.path,
      validation: { valid: false, diagnostics, summary },
      reason: summary,
    }
  }
}

export const storeInternals = Object.freeze({ safeSessionDirectoryName, sha256 })
