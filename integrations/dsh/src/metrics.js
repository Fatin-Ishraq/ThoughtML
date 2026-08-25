import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { STATE_TOOL_NAMES } from './index.js'

export const name = 'thoughtml-study-metrics'
export const inject = ['sessions', 'tools']

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function signature(exec) {
  return sha256(`${exec.name}\n${JSON.stringify(exec.arguments)}`)
}

function blankSession(sessionId) {
  return {
    sessionId,
    eventCount: 0,
    eventTypes: {},
    turns: 0,
    steps: 0,
    requestCount: 0,
    requestHeaderCount: 0,
    modelCalls: 0,
    providers: [],
    models: [],
    inputTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    toolCalls: 0,
    failedToolCalls: 0,
    repeatedActions: 0,
    repeatedFailedActions: 0,
    recoveryEpisodesStarted: 0,
    recoveryEpisodesCompleted: 0,
    recoveryToolDistances: [],
    stateReads: 0,
    stateCommitAttempts: 0,
    stateCommits: 0,
    stateCommitRejections: 0,
    stateNoopCommits: 0,
    stateInspections: 0,
    stateDiffs: 0,
    stateExplanations: 0,
    stateAnalyses: 0,
    stateCheckpointsAfterFailure: 0,
    latestStateRevision: 0,
    latestStateBytes: 0,
    latestStateValid: null,
    internal: {
      toolIndex: 0,
      lastSignature: null,
      openFailure: null,
    },
  }
}

function addUnique(values, value) {
  if (typeof value === 'string' && !values.includes(value)) values.push(value)
}

export class StudyMetricsCollector {
  constructor(config = {}) {
    if (!config.outputDir) throw new Error('thoughtml-study-metrics requires outputDir')
    this.outputDir = resolve(config.outputDir)
    this.condition = config.condition ?? null
    this.format = config.format ?? null
    this.sessions = new Map()
    mkdirSync(this.outputDir, { recursive: true })
    this.eventsPath = resolve(this.outputDir, 'metrics-events.jsonl')
    this.summaryPath = resolve(this.outputDir, 'metrics-summary.json')
    writeFileSync(this.eventsPath, '', 'utf8')
    this.flush()
  }

  session(sessionId) {
    const id = String(sessionId)
    if (!this.sessions.has(id)) this.sessions.set(id, blankSession(id))
    return this.sessions.get(id)
  }

  observeSessionEvent(session, event) {
    const metrics = this.session(session.id)
    metrics.eventCount += 1
    metrics.eventTypes[event.type] = (metrics.eventTypes[event.type] ?? 0) + 1
    if (event.type === 'turn/end') metrics.turns += 1
    if (event.type === 'step/end') metrics.steps += 1
    if (event.type === 'request/header') {
      metrics.requestHeaderCount += 1
      addUnique(metrics.providers, event.data?.header?.config?.provider)
      addUnique(metrics.models, event.data?.header?.config?.model)
    }
    if (event.type === 'assistant/message') {
      metrics.requestCount += 1
      metrics.modelCalls += 1
      metrics.inputTokens += Number(event.data?.usage?.inputTokens ?? 0)
      metrics.cacheReadTokens += Number(event.data?.usage?.cacheReadTokens ?? 0)
      metrics.outputTokens += Number(event.data?.usage?.outputTokens ?? 0)
      metrics.reasoningTokens += Number(event.data?.usage?.reasoningTokens ?? 0)
    }
    this.#append({
      observedAt: new Date().toISOString(),
      kind: 'session-event',
      sessionId: String(session.id),
      seq: event.seq,
      type: event.type,
      turn: event.data?.turn ?? null,
      step: event.data?.step ?? null,
      usage: event.type === 'assistant/message' ? event.data?.usage ?? null : null,
      requestRoute: event.type === 'request/header' ? {
        provider: event.data?.header?.config?.provider ?? null,
        model: event.data?.header?.config?.model ?? null,
        maxTokens: event.data?.header?.config?.maxTokens ?? null,
      } : null,
    })
    this.flush()
  }

  observeToolResult(exec, result) {
    const sessionId = exec.agent?.session?.id ?? 'agentless'
    const metrics = this.session(sessionId)
    const callSignature = signature(exec)
    metrics.internal.toolIndex += 1
    metrics.toolCalls += 1
    if (metrics.internal.lastSignature === callSignature) metrics.repeatedActions += 1
    metrics.internal.lastSignature = callSignature

    const isStateTool = STATE_TOOL_NAMES.includes(exec.name)
    if (result.isError) {
      metrics.failedToolCalls += 1
      if (!isStateTool) {
        if (metrics.internal.openFailure?.signature === callSignature) {
          metrics.repeatedFailedActions += 1
        }
        if (!metrics.internal.openFailure) {
          metrics.recoveryEpisodesStarted += 1
          metrics.internal.openFailure = {
            signature: callSignature,
            toolIndex: metrics.internal.toolIndex,
          }
        }
      }
    } else if (!isStateTool && metrics.internal.openFailure) {
      metrics.recoveryEpisodesCompleted += 1
      metrics.recoveryToolDistances.push(
        metrics.internal.toolIndex - metrics.internal.openFailure.toolIndex,
      )
      metrics.internal.openFailure = null
    }

    if (exec.name === 'reasoning_state_read') metrics.stateReads += 1
    if (exec.name === 'reasoning_state_inspect') metrics.stateInspections += 1
    if (exec.name === 'reasoning_state_diff') metrics.stateDiffs += 1
    if (exec.name === 'reasoning_state_explain') metrics.stateExplanations += 1
    if (exec.name === 'reasoning_state_analyze') metrics.stateAnalyses += 1
    if (exec.name === 'reasoning_state_commit') {
      metrics.stateCommitAttempts += 1
      const value = result.isError ? null : result.value
      if (value?.committed) {
        metrics.stateCommits += 1
        if (metrics.internal.openFailure) metrics.stateCheckpointsAfterFailure += 1
      } else if (value?.changed === false && value?.validation?.valid) {
        metrics.stateNoopCommits += 1
      } else {
        metrics.stateCommitRejections += 1
      }
    }
    if (!result.isError && result.value && isStateTool) {
      const value = result.value
      if (Number.isSafeInteger(value.revision)) metrics.latestStateRevision = value.revision
      if (Number.isSafeInteger(value.bytes)) metrics.latestStateBytes = value.bytes
      if (typeof value.validation?.valid === 'boolean') metrics.latestStateValid = value.validation.valid
    }

    this.#append({
      observedAt: new Date().toISOString(),
      kind: 'tool-result',
      sessionId: String(sessionId),
      callId: exec.callId,
      name: exec.name,
      argumentsSha256: callSignature,
      isError: result.isError,
      stateOutcome: exec.name === 'reasoning_state_commit' && !result.isError ? {
        committed: Boolean(result.value?.committed),
        changed: Boolean(result.value?.changed),
        revision: result.value?.revision ?? null,
        valid: result.value?.validation?.valid ?? null,
      } : null,
    })
    this.flush()
  }

  summary() {
    return {
      schemaVersion: 1,
      classification: 'experiment-metrics',
      condition: this.condition,
      format: this.format,
      generatedAt: new Date().toISOString(),
      telemetryMode: process.env.DSH_TELEMETRY_MODE ?? null,
      credentialPresent: Boolean(process.env.DEEPSEEK_API_KEY),
      sessions: [...this.sessions.values()].map(({ internal, ...metrics }) => ({
        ...metrics,
        unresolvedRecoveryEpisode: Boolean(internal.openFailure),
      })),
    }
  }

  flush() {
    writeFileSync(this.summaryPath, `${JSON.stringify(this.summary(), null, 2)}\n`, 'utf8')
  }

  #append(value) {
    appendFileSync(this.eventsPath, `${JSON.stringify(value)}\n`, 'utf8')
  }
}

export function apply(ctx, config = {}) {
  const collector = new StudyMetricsCollector(config)
  ctx.on('session/event', (session, event) => collector.observeSessionEvent(session, event))
  ctx.on('tools/result', (exec, result) => collector.observeToolResult(exec, result))
}
