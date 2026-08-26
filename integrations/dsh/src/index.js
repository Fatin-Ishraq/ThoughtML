import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { SessionStateStore } from './store.js'

export const name = 'thoughtml-reasoning-state'
export const inject = ['agents', 'systemPrompt', 'tools']

export const STATE_TOOL_NAMES = Object.freeze([
  'reasoning_state_read',
  'reasoning_state_commit',
  'reasoning_state_inspect',
  'reasoning_state_diff',
  'reasoning_state_explain',
  'reasoning_state_analyze',
])

export const FORMAT_LABELS = Object.freeze({
  thoughtml: 'ThoughtML',
  markdown: 'Markdown',
})

/**
 * The state-management instruction, naming the ledger's format.
 *
 * The format name is the only thing that varies between conditions, matching
 * the amendment's rule that M and T receive the same instruction except for
 * format-specific syntax and validation guidance. Naming it is not decoration:
 * a model told only to "maintain a ledger" has to infer what to write, and the
 * tools accept exactly one format.
 */
export function reasoningStateGuidance(format) {
  const label = FORMAT_LABELS[format] ?? FORMAT_LABELS.thoughtml
  return REASONING_STATE_GUIDANCE.replaceAll('{FORMAT}', label)
}

export const REASONING_STATE_GUIDANCE = `You maintain a persistent reasoning-state ledger for this task, written in {FORMAT}. Write every commit as {FORMAT}; the state tools accept no other format and reject anything else. This is a required part of how you work, not an optional aid. It is the only task-state record you have: there is no todo list and no scratchpad besides this ledger.

REQUIRED checkpoints. At each of these moments, commit the ledger before continuing:
1. After you establish the goal and plan, and BEFORE your first modifying action (before the first edit, write, or command that changes the workspace).
2. After a failed command, edit, build, or test that changes your plan.
3. When evidence causes you to reject or revise a hypothesis, or changes the goal.
4. Before your final answer.

Read the ledger with reasoning_state_read before consequential decisions, and whenever you are unsure what you have already established or ruled out.

What to record. Treat it as an auditable task-state record, not hidden chain-of-thought: the goal and constraints, evidence and where it came from, current hypotheses, beliefs you have superseded and why, actions and their observed results, unresolved questions or contradictions, your next intended action, and your uncertainty where you have any.

How to commit. Pass the revision returned by reasoning_state_read or shown in the supplied context. A stale, invalid, oversized, or unchanged candidate is rejected and the last valid revision is kept, so read first if a commit is rejected. Keep the ledger bounded: prune clutter, but never erase a meaningful supersession or its provenance.

Other operations. Use reasoning_state_inspect when validation, history, structural counts, or the visible state-file path matter. Use reasoning_state_diff to see what changed between immutable revisions, reasoning_state_explain for one focused element, and reasoning_state_analyze only when structural conflicts, confidence, sensitivity, or decisions could change your next action. Computed analysis is a mechanical reading of what you authored, not a judgement about whether it is true.`

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

const diffSchema = {
  type: 'object',
  properties: {
    format: { type: 'string', enum: ['thoughtml', 'markdown'], required: true },
    fromRevision: { type: 'integer', required: true },
    toRevision: { type: 'integer', required: true },
    fromSha256: { type: 'string', required: true },
    toSha256: { type: 'string', required: true },
    output: { type: 'string', required: true },
    truncated: { type: 'boolean', required: true },
  },
  additionalProperties: false,
}

const explainSchema = {
  type: 'object',
  properties: {
    format: { type: 'string', enum: ['thoughtml', 'markdown'], required: true },
    revision: { type: 'integer', required: true },
    sha256: { type: 'string', required: true },
    target: { type: 'string', required: true },
    output: { type: 'string', required: true },
    truncated: { type: 'boolean', required: true },
  },
  additionalProperties: false,
}

const analyzeSchema = {
  type: 'object',
  properties: {
    format: { type: 'string', enum: ['thoughtml', 'markdown'], required: true },
    revision: { type: 'integer', required: true },
    sha256: { type: 'string', required: true },
    analysis: { type: 'object', required: true, additionalProperties: true },
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
    text: reasoningStateGuidance(store.format),
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

  ctx.tools.register(defineTool({
    name: 'reasoning_state_diff',
    description: 'Compare two immutable reasoning-state revisions. ThoughtML returns a semantic belief diff; the matched Markdown control reports changed fixed sections.',
    parameters: {
      fromRevision: {
        type: 'integer',
        required: true,
        description: 'Earlier revision number from reasoning_state_inspect.',
      },
      toRevision: {
        type: 'integer',
        required: true,
        description: 'Later revision number from reasoning_state_inspect.',
      },
    },
    output: { schema: diffSchema, render: asText },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return store.diff(requireAgent(exec), args)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'reasoning_state_explain',
    description: 'Explain one ThoughtML node using the computed graph, or read one fixed section in the matched Markdown control. Defaults to the current revision.',
    parameters: {
      target: {
        type: 'string',
        required: true,
        description: 'ThoughtML node ID, or Markdown section heading without hash marks.',
      },
      revision: {
        type: 'integer',
        description: 'Optional immutable revision number; defaults to the current revision.',
      },
    },
    output: { schema: explainSchema, render: asText },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return store.explain(requireAgent(exec), args)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'reasoning_state_analyze',
    description: 'Run bounded structural analysis on one reasoning-state revision. ThoughtML computes audit, confidence, argument status, sensitivity, formulas, and decisions; Markdown reports matched section structure.',
    parameters: {
      revision: {
        type: 'integer',
        description: 'Optional immutable revision number; defaults to the current revision.',
      },
    },
    output: { schema: analyzeSchema, render: asText },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return store.analyze(requireAgent(exec), args)
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
