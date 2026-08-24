import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { SessionStateStore } from './store.js'

export const name = 'thoughtml-reasoning-state'
export const inject = ['agents', 'systemPrompt', 'tools']

export const STATE_TOOL_NAMES = Object.freeze([
  'reasoning_state_read',
  'reasoning_state_commit',
  'reasoning_state_inspect',
])

export const REASONING_STATE_GUIDANCE = `Maintain a concise persistent reasoning-state ledger for this task.

- Treat it as an auditable task-state record, not hidden chain-of-thought: record goals, evidence and provenance, current hypotheses, superseded beliefs, actions and observed results, unresolved issues, the next action, and stated uncertainty.
- Read the supplied state before consequential decisions. Commit after establishing the initial goal and plan and before the first modifying action; after a failure changes the plan; when evidence revises a hypothesis or the goal; and before the final answer.
- Use reasoning_state_commit with the revision returned by reasoning_state_read or the supplied context. A stale or invalid commit is rejected without replacing the last valid state.
- Use reasoning_state_inspect when validation, history, structural counts, or the visible state-file path matter. Keep the ledger bounded and remove clutter without erasing meaningful supersession or provenance.`

const diagnosticSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', required: true },
    severity: { type: 'string', required: true },
    message: { type: 'string', required: true },
  },
  additionalProperties: true,
}

const validationSchema = {
  type: 'object',
  properties: {
    valid: { type: 'boolean', required: true },
    diagnostics: { type: 'array', items: diagnosticSchema, required: true },
    summary: { type: 'string', required: true },
  },
  additionalProperties: false,
}

const readSchema = {
  type: 'object',
  properties: {
    revision: { type: 'integer', required: true },
    format: { type: 'string', enum: ['thoughtml', 'markdown'], required: true },
    content: { type: 'string', required: true },
    sha256: { type: 'string', required: true },
    bytes: { type: 'integer', required: true },
    path: { type: 'string', required: true },
    validation: { ...validationSchema, required: true },
  },
  additionalProperties: false,
}

const commitSchema = {
  type: 'object',
  properties: {
    committed: { type: 'boolean', required: true },
    changed: { type: 'boolean', required: true },
    revision: { type: 'integer', required: true },
    sha256: { type: 'string', required: true },
    bytes: { type: 'integer', required: true },
    path: { type: 'string', required: true },
    validation: { ...validationSchema, required: true },
    reason: { type: 'string', required: true },
  },
  additionalProperties: false,
}

const historyEntrySchema = {
  type: 'object',
  properties: {
    revision: { type: 'integer', required: true },
    sha256: { type: 'string', required: true },
    bytes: { type: 'integer', required: true },
    reason: { type: 'string', required: true },
    committedAt: { type: 'string', required: true },
  },
  additionalProperties: false,
}

const inspectSchema = {
  type: 'object',
  properties: {
    revision: { type: 'integer', required: true },
    format: { type: 'string', enum: ['thoughtml', 'markdown'], required: true },
    sha256: { type: 'string', required: true },
    bytes: { type: 'integer', required: true },
    path: { type: 'string', required: true },
    validation: { ...validationSchema, required: true },
    analysis: {
      type: 'object',
      properties: {
        itemCount: { type: 'integer', required: true },
        relationCount: { type: 'integer', required: true },
        conflictCount: { type: 'integer', required: true },
      },
      additionalProperties: false,
      required: true,
    },
    history: { type: 'array', items: historyEntrySchema, required: true },
    historyTruncated: { type: 'boolean', required: true },
  },
  additionalProperties: false,
}

function requireAgent(exec) {
  if (!exec.agent) throw new Error('reasoning-state tool requires an active DSH agent')
  return exec.agent
}

function asText(_args, value) {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

function readRender(_args, value) {
  return [{
    type: 'text',
    text: `Reasoning state revision ${value.revision} (${value.format}, ${value.bytes} bytes, valid=${value.validation.valid}).\nPath: ${value.path}\n\n${value.content}`,
  }]
}

function commitRender(_args, value) {
  const status = value.committed
    ? `Committed reasoning-state revision ${value.revision}`
    : `Reasoning-state commit not applied at revision ${value.revision}`
  return [{ type: 'text', text: `${status}: ${value.reason}\n${JSON.stringify(value)}` }]
}

export function apply(ctx, config = {}) {
  const store = new SessionStateStore(config)
  const recoveryGuidance = config.recoveryGuidance !== false

  ctx.systemPrompt.section({
    name: 'thoughtml:reasoning-state-guidance',
    order: 140,
    text: REASONING_STATE_GUIDANCE,
  })
  ctx.systemPrompt.context({
    name: 'thoughtml:reasoning-state',
    order: 140,
    text: (assembly) => assembly.agent ? store.context(assembly.agent) : '',
  })

  ctx.on('agent/session-start', ({ agent }) => {
    store.ensure(agent)
  })

  ctx.tools.register(defineTool({
    name: 'reasoning_state_read',
    description: "Read this session's complete persistent reasoning state and current revision.",
    parameters: {},
    output: { schema: readSchema, render: readRender },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      return store.read(requireAgent(exec))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'reasoning_state_commit',
    description: 'Atomically validate and commit a complete replacement reasoning-state revision. Invalid, oversized, unchanged, or stale candidates do not replace the current valid state.',
    parameters: {
      expectedRevision: {
        type: 'integer',
        required: true,
        description: 'Current revision from the supplied state or reasoning_state_read.',
      },
      content: {
        type: 'string',
        required: true,
        description: 'Complete replacement reasoning state in the assigned format.',
      },
      reason: {
        type: 'string',
        required: true,
        description: 'Concise reason this revision is needed.',
      },
    },
    output: { schema: commitSchema, render: commitRender },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      return store.commit(requireAgent(exec), args)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'reasoning_state_inspect',
    description: 'Inspect reasoning-state validation, structural counts, revision history, and visible file location.',
    parameters: {},
    output: { schema: inspectSchema, render: asText },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      return store.inspect(requireAgent(exec))
    },
  }))

  if (recoveryGuidance) {
    ctx.on('tools/result', (exec, result) => {
      if (!result.isError || STATE_TOOL_NAMES.includes(exec.name) || !exec.agent) return
      const text = 'A tool failed. Before repeating the same action, consult the persistent reasoning state and commit the failure evidence, revised hypothesis, or revised next action if it changed the plan.'
      try {
        exec.agent.inject(createUserMessage({
          content: [{ type: 'text', text }],
          source: {
            kind: 'plugin',
            plugin: name,
            form: 'notice',
            summary: 'Reasoning-state recovery checkpoint suggested after a tool failure.',
          },
        }))
      } catch {
        // Agent disposal wins over a best-effort recovery reminder.
      }
    })
  }

}

export { SessionStateStore } from './store.js'
export { createFormatAdapter, MARKDOWN_HEADINGS, SUPPORTED_FORMATS } from './formats.js'
