import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, reasoningStateGuidance, STATE_TOOL_NAMES } from '../src/index.js'
import { fakeAgent, temporaryDirectory } from './helpers.mjs'

function fakeContext() {
  const registered = { sections: [], contexts: [], tools: [], listeners: new Map() }
  return {
    registered,
    context: {
      systemPrompt: {
        section(value) { registered.sections.push(value) },
        context(value) { registered.contexts.push(value) },
      },
      tools: { register(value) { registered.tools.push(value) } },
      on(event, handler) { registered.listeners.set(event, handler) },
    },
  }
}

test('plugin registers matched structured tools, persistent context, and guidance without changing the agent loop', async (t) => {
  const root = temporaryDirectory(t)
  const { context, registered } = fakeContext()
  apply(context, { format: 'markdown', stateRoot: root })
  assert.equal(registered.sections.length, 1)
  assert.equal(registered.sections[0].text, reasoningStateGuidance('markdown'))
  assert.equal(registered.contexts.length, 1)
  assert.deepEqual(registered.tools.map((tool) => tool.name), STATE_TOOL_NAMES)
  assert.equal(registered.listeners.has('agent/session-start'), true)
  assert.equal(registered.listeners.has('tools/result'), true)

  const agent = fakeAgent('plugin-session', root)
  registered.listeners.get('agent/session-start')({ agent })
  const supplied = registered.contexts[0].text({ agent })
  assert.match(supplied, /Persistent reasoning state \(markdown, revision 0/)

  const readTool = registered.tools.find((tool) => tool.name === 'reasoning_state_read')
  const commitTool = registered.tools.find((tool) => tool.name === 'reasoning_state_commit')
  const inspectTool = registered.tools.find((tool) => tool.name === 'reasoning_state_inspect')
  const diffTool = registered.tools.find((tool) => tool.name === 'reasoning_state_diff')
  const explainTool = registered.tools.find((tool) => tool.name === 'reasoning_state_explain')
  const analyzeTool = registered.tools.find((tool) => tool.name === 'reasoning_state_analyze')
  const execution = { agent }
  const before = await readTool.execute({}, execution)
  const afterCommit = await commitTool.execute({
    expectedRevision: before.revision,
    content: before.content.replace('Initial state; confidence is low', 'Request read; confidence is moderate'),
    reason: 'Record that the request was read.',
  }, execution)
  assert.equal(afterCommit.committed, true)
  const inspection = await inspectTool.execute({}, execution)
  assert.equal(inspection.revision, 1)
  assert.deepEqual(inspection.history.map((entry) => entry.revision), [1, 0])
  assert.equal(JSON.parse(inspectTool.output.render({}, inspection)[0].text).revision, 1)
  const difference = await diffTool.execute({ fromRevision: 0, toRevision: 1 }, execution)
  assert.match(difference.output, /Markdown section diff/)
  const explanation = await explainTool.execute({ target: 'Uncertainty' }, execution)
  assert.match(explanation.output, /## Uncertainty/)
  const analysis = await analyzeTool.execute({}, execution)
  assert.equal(analysis.analysis.mode, 'matched-markdown-structure')
  assert.equal(commitTool.isConcurrencySafe({}), false)
  assert.equal(readTool.isConcurrencySafe({}), true)
  assert.equal(diffTool.isConcurrencySafe({ fromRevision: 0, toRevision: 1 }), true)
  assert.equal(explainTool.isConcurrencySafe({ target: 'Uncertainty' }), true)
  assert.equal(analyzeTool.isConcurrencySafe({}), true)
})

test('failed non-state tools inject recovery guidance but state-tool failures do not', (t) => {
  const root = temporaryDirectory(t)
  const { context, registered } = fakeContext()
  apply(context, { format: 'markdown', stateRoot: root })
  const notices = []
  const agent = { ...fakeAgent('recovery-session', root), inject(message) { notices.push(message) } }
  const handler = registered.listeners.get('tools/result')
  handler({ name: 'shell', agent }, { isError: true })
  assert.equal(notices.length, 1)
  assert.match(JSON.stringify(notices[0]), /Before repeating the same action/)
  handler({ name: 'reasoning_state_commit', agent }, { isError: true })
  assert.equal(notices.length, 1)
  handler({ name: 'reasoning_state_analyze', agent }, { isError: true })
  assert.equal(notices.length, 1)
  handler({ name: 'shell', agent }, { isError: false })
  assert.equal(notices.length, 1)
})

test('guidance names the ledger format, so an agent is not left inferring what to write', async (t) => {
  const root = temporaryDirectory(t)
  for (const [format, label, other] of [
    ['thoughtml', 'ThoughtML', 'Markdown'],
    ['markdown', 'Markdown', 'ThoughtML'],
  ]) {
    const text = reasoningStateGuidance(format)
    assert.ok(text.includes(label), `${format} guidance should name ${label}`)
    assert.ok(!text.includes(other), `${format} guidance must not name ${other}`)
    assert.ok(!text.includes('{FORMAT}'), 'placeholder must be substituted')

    const { context, registered } = fakeContext()
    apply(context, { format, stateRoot: `${root}/${format}` })
    assert.equal(registered.sections[0].text, text)
  }

  // M and T must remain matched: identical apart from the format name.
  const t1 = reasoningStateGuidance('thoughtml').replaceAll('ThoughtML', 'X')
  const m1 = reasoningStateGuidance('markdown').replaceAll('Markdown', 'X')
  assert.equal(t1, m1, 'conditions must differ only in the format name')
})

test('checker diagnostics missing a code do not make the tool fail its own output schema', async () => {
  const { diagnosticsFromProcessForTest } = await import('../src/formats.js')
  const shaped = diagnosticsFromProcessForTest({
    status: 1,
    stdout: JSON.stringify([
      { severity: 'error', message: 'no code supplied' },
      { code: 'REAL_CODE', severity: 'warning', message: 'has a code' },
      { message: 'only a message' },
      'a bare string',
    ]),
  })
  assert.equal(shaped.length, 4)
  for (const d of shaped) {
    assert.equal(typeof d.code, 'string')
    assert.ok(d.code.length > 0)
    assert.equal(typeof d.severity, 'string')
    assert.equal(typeof d.message, 'string')
    assert.ok(d.message.length > 0)
  }
  assert.equal(shaped[1].code, 'REAL_CODE', 'a supplied code is preserved')
  assert.equal(shaped[1].severity, 'warning', 'a supplied severity is preserved')
  assert.equal(shaped[0].code, 'THOUGHTML_DIAGNOSTIC')
})
