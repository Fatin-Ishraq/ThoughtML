import test from 'node:test'
import assert from 'node:assert/strict'
import { ReasoningExpansion } from '../src/reasoning-expansion.ts'
import type { Canonical, SourceMap } from '../src/model.ts'

const canon: Canonical = { objects: [
  { type: 'focus', id: 'release', kind: 'decision', body: 'We should release.' },
  { type: 'focus', id: 'readiness.tests', kind: 'observation', body: 'Tests pass.' },
  { type: 'focus', id: 'readiness.docs', kind: 'observation', body: 'Docs are ready.' },
  { type: 'focus', id: 'readiness.ready', kind: 'claim', body: 'The project is ready.' },
  { type: 'link', id: 'readiness.tests-support-ready', from: 'readiness.tests', relation: 'supports', to: 'readiness.ready' },
  { type: 'link', id: 'readiness.docs-support-ready', from: 'readiness.docs', relation: 'supports', to: 'readiness.ready' },
  { type: 'link', id: 'ready-enables-release', from: 'readiness.ready', relation: 'enables', to: 'release' },
] }

const sourceMap: SourceMap = { objects: {
  release: { source: 'entry', line: 2 },
  'readiness.tests': { source: 'readiness', line: 1 },
  'readiness.docs': { source: 'readiness', line: 4 },
  'readiness.ready': { source: 'readiness', line: 7 },
  'readiness.tests-support-ready': { source: 'readiness', line: 10 },
  'readiness.docs-support-ready': { source: 'readiness', line: 11 },
  'ready-enables-release': { source: 'entry', line: 4 },
} }

test('an imported conclusion folds and unfolds its same-file reasoning ancestry', () => {
  const expansion = new ReasoningExpansion()
  expansion.update(canon, sourceMap)

  assert.deepEqual(expansion.info('readiness.ready'), {
    count: 4,
    expanded: false,
    source: 'readiness',
  })
  assert.deepEqual(expansion.markers(), { 'readiness.ready': false })
  assert.deepEqual(expansion.project(canon).objects.map((obj) => obj.id), [
    'release', 'readiness.ready', 'ready-enables-release',
  ])

  assert.equal(expansion.toggle('readiness.ready'), true)
  assert.equal(expansion.info('readiness.ready')?.expanded, true)
  assert.deepEqual(expansion.markers(), { 'readiness.ready': true })
  assert.deepEqual(expansion.project(canon).objects.map((obj) => obj.id), canon.objects.map((obj) => obj.id))

  assert.equal(expansion.toggle('readiness.ready'), false)
  assert.equal(expansion.info('readiness.ready')?.expanded, false)
  assert.equal(expansion.project(canon).objects.some((obj) => obj.id === 'readiness.tests'), false)
})

test('ordinary entry nodes do not get an expansion action', () => {
  const expansion = new ReasoningExpansion()
  expansion.update(canon, sourceMap)
  assert.equal(expansion.info('release'), undefined)
  assert.equal(expansion.toggle('release'), false)
})
