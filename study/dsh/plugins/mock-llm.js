import { LlmAdapter } from '@deepseek-ai/dsh-llm'

export const name = 'thoughtml-study-mock-llm'
export const inject = ['llm']

const PROVIDER = 'thoughtml-study-mock'
const MODEL = 'deterministic-v1'

const markdownState = `# Current Goal

Verify that DSH records a deterministic failure, state checkpoint, and recovery without network access.

## Evidence

- The first deterministic offline operation failed.

## Current Hypothesis

- The failure should be checkpointed before a revised second attempt.

## Superseded

- None.

## Actions and Results

- Attempt 1 failed; checkpoint, read, and inspect the persistent state.

## Unresolved

- Whether native coding tools behave correctly remains unresolved by this mock.

## Next Action

- Retry the deterministic operation with attempt 2.

## Uncertainty

- Low; the run is deterministic.
`

const thoughtmlState = `claim reasoning-state
  Persistent reasoning state for this deterministic recovery check.

observation first-attempt-failed
  The first deterministic offline operation failed.

claim current-goal
  Verify that DSH records a deterministic failure, state checkpoint, and recovery without network access.

claim recovery-hypothesis
  The failure should be checkpointed before a revised second attempt.

link first-attempt-failed supports recovery-hypothesis

claim superseded-none
  No belief has been superseded.

action attempt-one-result
  Attempt 1 failed; checkpoint, read, and inspect the persistent state.

question native-coding-tools
  Do native coding tools behave correctly outside this mock check?

action next-action
  Retry the deterministic operation with attempt 2.

claim uncertainty
  Uncertainty is low because the run is deterministic.

part-of reasoning-state
  first-attempt-failed
  current-goal
  recovery-hypothesis
  superseded-none
  attempt-one-result
  native-coding-tools
  next-action
  uncertainty

mock-agent holds recovery-hypothesis
  confidence 1.0 measured
`

function countToolResults(messages) {
  let count = 0
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === 'tool-result') count += 1
    }
  }
  return count
}

function assertRequestShape(condition, step, options) {
  const system = options.system ?? ''
  const toolNames = (options.tools ?? []).map((tool) => tool.name)
  const serializedMessages = JSON.stringify(options.messages)
  const stateTools = ['reasoning_state_read', 'reasoning_state_commit', 'reasoning_state_inspect']
  if (!toolNames.includes('offline_operation')) throw new Error('offline_operation was not supplied to the mock model')
  if (condition === 'D') {
    if (system.includes('Persistent reasoning state (')) throw new Error('baseline unexpectedly received reasoning state')
    if (stateTools.some((name) => toolNames.includes(name))) throw new Error('baseline unexpectedly received state tools')
    return
  }

  const format = condition === 'M' ? 'markdown' : 'thoughtml'
  const expectedRevision = step >= 2 ? 1 : 0
  if (!system.includes('Maintain a concise persistent reasoning-state ledger')) {
    throw new Error(`${condition} did not receive the state guidance section`)
  }
  if (!serializedMessages.includes(`Persistent reasoning state (${format}, revision ${expectedRevision}`)) {
    throw new Error(`${condition} step ${step} did not receive state revision ${expectedRevision}`)
  }
  if (stateTools.some((name) => !toolNames.includes(name))) {
    throw new Error(`${condition} did not receive all matched state tools`)
  }
  if (step === 1 && !serializedMessages.includes('Before repeating the same action')) {
    throw new Error(`${condition} did not receive recovery guidance after the deterministic failure`)
  }
}

function toolCallChunks(step, name, argumentsObject) {
  const id = `offline-call-${step + 1}`
  const rawArguments = JSON.stringify(argumentsObject)
  const block = {
    type: 'tool-call',
    id,
    name,
    arguments: rawArguments,
  }
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    {
      type: 'tool-call-delta',
      index: 0,
      id,
      name,
      argumentsDelta: rawArguments,
    },
    { type: 'block-end', index: 0, block },
    {
      type: 'usage',
      usage: { inputTokens: 100 + step, outputTokens: 10 },
    },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

function textChunks(condition, step) {
  const text = `offline mock complete (${condition})`
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    {
      type: 'usage',
      usage: { inputTokens: 100 + step, outputTokens: 8 },
    },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

class DeterministicMockAdapter extends LlmAdapter {
  constructor(condition) {
    super()
    this.condition = condition
  }

  providerInfo(provider) {
    return { id: provider, name: 'ThoughtML study offline mock' }
  }

  async listModels(provider) {
    return [{ provider, id: MODEL, name: 'Deterministic offline mock' }]
  }

  async resolveModel(provider, model) {
    if (provider !== PROVIDER || model !== MODEL) {
      throw new Error(`unsupported offline mock route: ${provider}/${model}`)
    }
    return {
      provider,
      id: model,
      name: 'Deterministic offline mock',
      inputModalities: ['text'],
      context: { contextWindow: 32768 },
      defaultMaxTokens: 256,
    }
  }

  async *stream(options) {
    if (options.provider !== PROVIDER || options.model !== MODEL) {
      throw new Error(`offline mock received unexpected route: ${options.provider}/${options.model}`)
    }
    if (options.signal?.aborted) {
      yield {
        type: 'finish',
        reason: {
          kind: 'aborted',
          failure: { message: 'offline mock aborted', code: 'ABORTED' },
        },
      }
      return
    }

    const step = countToolResults(options.messages)
    assertRequestShape(this.condition, step, options)
    let chunks
    if (step === 0) {
      chunks = toolCallChunks(step, 'offline_operation', { attempt: 1 })
    } else if (this.condition === 'D' && step === 1) {
      chunks = toolCallChunks(step, 'offline_operation', { attempt: 2 })
    } else if (this.condition === 'D') {
      chunks = textChunks(this.condition, step)
    } else if (step === 1) {
      chunks = toolCallChunks(
        step,
        'reasoning_state_commit',
        {
          expectedRevision: 0,
          content: this.condition === 'M' ? markdownState : thoughtmlState,
          reason: 'Checkpoint the first-attempt failure and revised recovery action.',
        },
      )
    } else if (step === 2) {
      chunks = toolCallChunks(step, 'reasoning_state_read', {})
    } else if (step === 3) {
      chunks = toolCallChunks(step, 'reasoning_state_inspect', {})
    } else if (step === 4) {
      chunks = toolCallChunks(step, 'offline_operation', { attempt: 2 })
    } else {
      chunks = textChunks(this.condition, step)
    }

    for (const chunk of chunks) yield chunk
  }
}

export function apply(ctx, config = {}) {
  const condition = config.condition
  if (!['D', 'M', 'T'].includes(condition)) {
    throw new Error(`mock-llm requires condition D, M, or T; got ${JSON.stringify(condition)}`)
  }
  ctx.llm.registerAdapter([PROVIDER], new DeterministicMockAdapter(condition))
}
