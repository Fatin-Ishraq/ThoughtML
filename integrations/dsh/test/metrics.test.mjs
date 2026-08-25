import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { StudyMetricsCollector } from '../src/metrics.js'
import { temporaryDirectory } from './helpers.mjs'

function exec(name, args = {}, callId = name) {
  return {
    name,
    arguments: args,
    callId,
    agent: { session: { id: 'session-1' } },
  }
}

test('metrics record route, usage, repetition, recovery, and state behavior without raw arguments', (t) => {
  const outputDir = temporaryDirectory(t, 'thoughtml-metrics-')
  const collector = new StudyMetricsCollector({ outputDir, condition: 'T', format: 'thoughtml' })
  const session = { id: 'session-1' }
  collector.observeSessionEvent(session, {
    seq: 1,
    type: 'request/header',
    data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-flash', maxTokens: 4096 } } },
  })
  collector.observeSessionEvent(session, {
    seq: 2,
    type: 'assistant/message',
    data: { usage: { inputTokens: 123, cacheReadTokens: 67, outputTokens: 45, reasoningTokens: 23 } },
  })
  collector.observeSessionEvent(session, { seq: 3, type: 'step/end', data: { step: 1 } })
  collector.observeSessionEvent(session, { seq: 4, type: 'turn/end', data: { turn: 1 } })

  const failed = exec('shell', { command: 'contains-secret-value' }, 'failure-1')
  collector.observeToolResult(failed, { isError: true, error: { message: 'failed' } })
  collector.observeToolResult({ ...failed, callId: 'failure-2' }, { isError: true, error: { message: 'failed again' } })
  collector.observeToolResult(exec('reasoning_state_commit', {}, 'state-1'), {
    isError: false,
    value: {
      committed: true,
      changed: true,
      revision: 1,
      bytes: 220,
      validation: { valid: true },
    },
  })
  collector.observeToolResult(exec('reasoning_state_diff', { fromRevision: 0, toRevision: 1 }, 'state-2'), {
    isError: false,
    value: { fromRevision: 0, toRevision: 1 },
  })
  collector.observeToolResult(exec('reasoning_state_explain', { target: 'current-goal' }, 'state-3'), {
    isError: false,
    value: { revision: 1 },
  })
  collector.observeToolResult(exec('reasoning_state_analyze', {}, 'state-4'), {
    isError: false,
    value: { revision: 1 },
  })
  collector.observeToolResult(exec('shell', { command: 'recovered-action' }, 'recovery-1'), {
    isError: false,
    value: { ok: true },
  })

  const metrics = collector.summary().sessions[0]
  assert.equal(metrics.turns, 1)
  assert.equal(metrics.steps, 1)
  assert.equal(metrics.requestCount, 1)
  assert.equal(metrics.requestHeaderCount, 1)
  assert.equal(metrics.modelCalls, 1)
  assert.deepEqual(metrics.providers, ['deepseek-official'])
  assert.deepEqual(metrics.models, ['deepseek-v4-flash'])
  assert.equal(metrics.inputTokens, 123)
  assert.equal(metrics.cacheReadTokens, 67)
  assert.equal(metrics.outputTokens, 45)
  assert.equal(metrics.reasoningTokens, 23)
  assert.equal(metrics.toolCalls, 7)
  assert.equal(metrics.failedToolCalls, 2)
  assert.equal(metrics.repeatedActions, 1)
  assert.equal(metrics.repeatedFailedActions, 1)
  assert.equal(metrics.recoveryEpisodesStarted, 1)
  assert.equal(metrics.recoveryEpisodesCompleted, 1)
  assert.deepEqual(metrics.recoveryToolDistances, [6])
  assert.equal(metrics.stateCommits, 1)
  assert.equal(metrics.stateDiffs, 1)
  assert.equal(metrics.stateExplanations, 1)
  assert.equal(metrics.stateAnalyses, 1)
  assert.equal(metrics.stateCheckpointsAfterFailure, 1)
  assert.equal(metrics.latestStateRevision, 1)
  assert.equal(metrics.unresolvedRecoveryEpisode, false)

  const eventLog = readFileSync(collector.eventsPath, 'utf8')
  assert.doesNotMatch(eventLog, /contains-secret-value/)
  assert.match(eventLog, /argumentsSha256/)
})
