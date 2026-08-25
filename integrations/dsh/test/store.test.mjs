import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { createFormatAdapter, MARKDOWN_HEADINGS } from '../src/formats.js'
import { SessionStateStore } from '../src/store.js'
import { fakeAgent, temporaryDirectory, thoughtmlBinary } from './helpers.mjs'

function storeOptions(root, format, overrides = {}) {
  return {
    stateRoot: root,
    format,
    thoughtmlBinary,
    ...overrides,
  }
}

function revisedContent(format) {
  const adapter = createFormatAdapter(format, { thoughtmlBinary })
  if (format === 'thoughtml') {
    return `${adapter.initialContent}\nobservation request-read\n  The concrete request was read before taking action.\n\nlink request-read supports current-goal\n`
  }
  return adapter.initialContent.replace(
    '- Persistent reasoning state was initialized for this agent session.',
    '- Persistent reasoning state was initialized for this agent session.\n- The concrete request was read before taking action.',
  )
}

for (const format of ['thoughtml', 'markdown']) {
  test(`${format}: state persists, resumes, journals revisions, and repairs the visible view`, (t) => {
    const root = temporaryDirectory(t)
    const agent = fakeAgent(`resume/${format}`, root)
    const firstStore = new SessionStateStore(storeOptions(root, format))
    const initial = firstStore.read(agent)
    assert.equal(initial.revision, 0)
    assert.equal(initial.validation.valid, true)
    assert.equal(existsSync(initial.path), true)

    const content = revisedContent(format)
    const committed = firstStore.commit(agent, {
      content,
      expectedRevision: 0,
      reason: 'Record the observed request.',
    })
    assert.equal(committed.committed, true)
    assert.equal(committed.revision, 1)
    assert.equal(committed.validation.valid, true)

    const resumedStore = new SessionStateStore(storeOptions(root, format))
    assert.equal(resumedStore.read(agent).content, content)
    writeFileSync(committed.path, 'externally changed view', 'utf8')
    assert.equal(resumedStore.read(agent).content, content)
    assert.equal(readFileSync(committed.path, 'utf8'), content)

    const inspection = resumedStore.inspect(agent)
    assert.deepEqual(inspection.history.map((entry) => entry.revision), [1, 0])
    assert.equal(inspection.historyTruncated, false)
    assert.ok(inspection.analysis.itemCount > 0)

    const difference = resumedStore.diff(agent, { fromRevision: 0, toRevision: 1 })
    assert.equal(difference.fromRevision, 0)
    assert.equal(difference.toRevision, 1)
    assert.equal(difference.truncated, false)
    assert.match(difference.output, format === 'thoughtml' ? /belief diff/ : /Markdown section diff/)

    const explanation = resumedStore.explain(agent, {
      target: format === 'thoughtml' ? 'current-goal' : 'Evidence',
      revision: 1,
    })
    assert.equal(explanation.revision, 1)
    assert.match(explanation.output, format === 'thoughtml' ? /current-goal/ : /## Evidence/)

    const computed = resumedStore.analyze(agent, { revision: 1 })
    assert.equal(computed.revision, 1)
    assert.equal(computed.analysis.mode, format === 'thoughtml' ? 'thoughtml-compute' : 'matched-markdown-structure')
    assert.ok(computed.analysis.itemCount > 0)
    if (format === 'thoughtml') {
      assert.ok(computed.analysis.derivedNodes.total > 0)
      assert.ok(computed.analysis.loadBearingRelations.total > 0)
    } else {
      assert.equal(computed.analysis.sections.length, MARKDOWN_HEADINGS.length)
    }

    assert.throws(
      () => resumedStore.diff(agent, { fromRevision: 99, toRevision: 1 }),
      /revision 99 does not exist/,
    )
  })
}

test('ThoughtML: invalid, stale, unchanged, and oversized candidates preserve the last valid revision', (t) => {
  const root = temporaryDirectory(t)
  const agent = fakeAgent('rejections', root)
  const store = new SessionStateStore(storeOptions(root, 'thoughtml', { maxStateBytes: 2048 }))
  const initial = store.read(agent)

  const invalid = store.commit(agent, {
    content: 'claim',
    expectedRevision: 0,
    reason: 'Deliberately invalid test candidate.',
  })
  assert.equal(invalid.committed, false)
  assert.equal(invalid.validation.valid, false)
  assert.equal(invalid.revision, initial.revision)
  assert.equal(invalid.sha256, initial.sha256)

  const stale = store.commit(agent, {
    content: revisedContent('thoughtml'),
    expectedRevision: 7,
    reason: 'Deliberately stale test candidate.',
  })
  assert.equal(stale.committed, false)
  assert.match(stale.reason, /stale revision/)
  assert.equal(stale.sha256, initial.sha256)

  const unchanged = store.commit(agent, {
    content: initial.content,
    expectedRevision: 0,
    reason: 'Deliberate no-op.',
  })
  assert.equal(unchanged.committed, false)
  assert.equal(unchanged.validation.valid, true)
  assert.equal(unchanged.reason, 'content unchanged')

  const oversized = store.commit(agent, {
    content: `observation too-large\n  ${'x'.repeat(2200)}\n`,
    expectedRevision: 0,
    reason: 'Deliberately oversized test candidate.',
  })
  assert.equal(oversized.committed, false)
  assert.match(oversized.reason, /exceeds 2048 bytes/)
  assert.equal(oversized.sha256, initial.sha256)

  const after = store.inspect(agent)
  assert.equal(after.revision, 0)
  assert.equal(after.history.length, 1)
  assert.equal(after.sha256, initial.sha256)
})

test('context injection is bounded and directs the agent to the read tool', (t) => {
  const root = temporaryDirectory(t)
  const agent = fakeAgent('bounded-context', root)
  const store = new SessionStateStore(storeOptions(root, 'markdown', { maxContextChars: 80 }))
  const context = store.context(agent)
  assert.match(context, /above the 80-character injection limit/)
  assert.match(context, /reasoning_state_read/)
  assert.ok(context.length < 300)
})

test('analysis and semantic text output are bounded', (t) => {
  const root = temporaryDirectory(t)
  const agent = fakeAgent('bounded-analysis', root)
  const store = new SessionStateStore(storeOptions(root, 'markdown', { maxAnalysisChars: 120 }))
  const initial = store.read(agent)
  const revised = revisedContent('markdown')
  store.commit(agent, { content: revised, expectedRevision: 0, reason: 'Create a changed revision.' })
  const difference = store.diff(agent, { fromRevision: 0, toRevision: 1 })
  assert.equal(difference.truncated, true)
  assert.ok(difference.output.length <= 120)
  const analysis = store.analyze(agent)
  assert.equal(analysis.analysis.outputReduced, true)
  assert.match(analysis.analysis.limitations.at(-1), /120-character tool-output limit/)
  assert.equal(initial.revision, 0)
})

test('Markdown control requires the same fixed state sections', (t) => {
  const root = temporaryDirectory(t)
  const agent = fakeAgent('markdown-shape', root)
  const store = new SessionStateStore(storeOptions(root, 'markdown'))
  const initial = store.read(agent)
  for (const heading of MARKDOWN_HEADINGS) assert.match(initial.content, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  const rejected = store.commit(agent, {
    content: '# Current Goal\n\nA goal without matched sections.\n',
    expectedRevision: 0,
    reason: 'Deliberately remove matched sections.',
  })
  assert.equal(rejected.validation.valid, false)
  assert.ok(rejected.validation.diagnostics.some((diagnostic) => diagnostic.code === 'MD_MISSING_SECTION'))
  assert.equal(store.read(agent).sha256, initial.sha256)

  const duplicated = store.commit(agent, {
    content: `${initial.content}\n# Current Goal\n\nDuplicate.\n`,
    expectedRevision: 0,
    reason: 'Deliberately duplicate a matched section.',
  })
  assert.equal(duplicated.validation.valid, false)
  assert.ok(duplicated.validation.diagnostics.some((diagnostic) => diagnostic.code === 'MD_DUPLICATE_SECTION'))
})

test('current pointer tampering is detected rather than silently accepted', (t) => {
  const root = temporaryDirectory(t)
  const agent = fakeAgent('tampered-pointer', root)
  const store = new SessionStateStore(storeOptions(root, 'markdown'))
  store.read(agent)
  const currentPath = store.paths(agent).current
  const current = JSON.parse(readFileSync(currentPath, 'utf8'))
  current.bytes += 1
  writeFileSync(currentPath, `${JSON.stringify(current)}\n`, 'utf8')
  assert.throws(() => store.read(agent), /current pointer does not match commit metadata: bytes/)
})
