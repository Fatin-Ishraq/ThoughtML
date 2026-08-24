import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, REASONING_STATE_GUIDANCE, STATE_TOOL_NAMES } from '../src/index.js'
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
  assert.equal(registered.sections[0].text, REASONING_STATE_GUIDANCE)
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
  assert.equal(commitTool.isConcurrencySafe({}), false)
  assert.equal(readTool.isConcurrencySafe({}), true)
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
  handler({ name: 'shell', agent }, { isError: false })
  assert.equal(notices.length, 1)
})
