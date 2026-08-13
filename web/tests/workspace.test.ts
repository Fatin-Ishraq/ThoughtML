import test from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeProject,
  classifyDiskChanges,
  createWorkspace,
  deleteFile,
  dirtyFiles,
  normalizeWorkspace,
  renameFile,
  searchWorkspace,
  sourceOrigin,
} from '../src/workspace.ts'

test('entry closure identifies missing, cyclic, and orphaned files', () => {
  const workspace = createWorkspace({
    'project.thml': 'import quality as q\nimport missing as m\n',
    'quality.thml': 'import project as root\nclaim evidence\n  Evidence.\n',
    'notes.thml': 'claim orphan\n  Not imported.\n',
  }, 'project.thml')
  const analysis = analyzeProject(workspace)
  assert.deepEqual([...analysis.closure].sort(), ['project.thml', 'quality.thml'])
  assert.deepEqual([...analysis.orphaned], ['notes.thml'])
  assert.equal(analysis.missing[0].file, 'missing.thml')
  assert.deepEqual(analysis.cycles[0], ['project.thml', 'quality.thml', 'project.thml'])
})

test('rename keeps aliases stable and stages the old disk file for deletion', () => {
  const workspace = createWorkspace({
    'project.thml': 'import quality as q\nlink q.fact supports root\n',
    'quality.thml': 'claim fact\n  A fact.\n',
  }, 'project.thml', { backing: 'directory' })
  renameFile(workspace, 'quality.thml', 'evidence.thml')
  assert.match(workspace.files['project.thml'], /^import evidence as q/m)
  assert.match(workspace.files['project.thml'], /q\.fact/)
  assert.deepEqual(workspace.deleted, ['quality.thml'])
  assert.deepEqual(dirtyFiles(workspace).sort(), ['evidence.thml', 'project.thml'])
})

test('delete keeps a pending disk removal and protects the entry file', () => {
  const workspace = createWorkspace({
    'project.thml': 'import quality as quality\n',
    'quality.thml': 'claim fact\n  A fact.\n',
  }, 'project.thml')
  deleteFile(workspace, 'quality.thml')
  assert.deepEqual(workspace.deleted, ['quality.thml'])
  assert.throws(() => deleteFile(workspace, 'project.thml'), /at least one|entry file/)
})

test('legacy workspace snapshots migrate to saved files and one active tab', () => {
  const restored = normalizeWorkspace({
    entry: 'project.thml',
    active: 'quality.thml',
    files: { 'project.thml': '', 'quality.thml': 'claim q' },
  })
  assert.ok(restored)
  assert.deepEqual(restored.tabs, ['quality.thml'])
  assert.deepEqual(restored.saved, restored.files)
})

test('compiler source maps and project search navigate exact files and lines', () => {
  const workspace = createWorkspace({
    'project.thml': 'import quality as q\n',
    'quality.thml': 'claim mobile-bug\n  Fast swipes reverse direction.\n',
  }, 'project.thml')
  const result = {
    source_map: { objects: { 'q.mobile-bug': { source: 'quality', line: 1 } } },
  }
  assert.deepEqual(sourceOrigin('q.mobile-bug', result as never, workspace), { file: 'quality.thml', line: 1 })
  assert.deepEqual(searchWorkspace(workspace, 'reverse'), [{
    file: 'quality.thml',
    line: 2,
    column: 15,
    preview: 'Fast swipes reverse direction.',
  }])
})

test('external agent edits distinguish safe reloads from conflicts', () => {
  const workspace = createWorkspace({
    'project.thml': 'import quality as quality\n',
    'quality.thml': 'claim stable\n',
    'release.thml': 'claim ship\n',
  }, 'project.thml', { backing: 'directory' })
  workspace.files['quality.thml'] = 'claim locally-edited\n'
  workspace.deleted.push('old-module.thml')
  const changes = classifyDiskChanges(workspace, {
    'project.thml': 'import quality as quality\n# changed outside\n',
    'quality.thml': 'claim externally-edited\n',
    'new-evidence.thml': 'observation added\n',
    'old-module.thml': 'claim awaiting-removal\n',
  })
  assert.deepEqual(changes.added, ['new-evidence.thml'])
  assert.deepEqual(changes.changed, ['project.thml'])
  assert.deepEqual(changes.deleted, ['release.thml'])
  assert.deepEqual(changes.conflicts, ['quality.thml'])
})
