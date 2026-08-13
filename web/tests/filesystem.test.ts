import test from 'node:test'
import assert from 'node:assert/strict'
import { removeDirectoryFiles, saveDirectoryFiles } from '../src/filesystem.ts'

test('directory saves create missing files and refresh their disk baseline', async () => {
  const writes: Array<[string, string]> = []
  const made = new Map<string, unknown>()
  const directory = {
    kind: 'directory',
    name: '.thoughtml',
    async *values() {},
    async getFileHandle(name: string) {
      const handle = {
        kind: 'file',
        name,
        async getFile() { return { lastModified: 42 } },
        async createWritable() {
          return {
            async write(text: string) { writes.push([name, text]) },
            async close() {},
          }
        },
      }
      made.set(name, handle)
      return handle
    },
    async removeEntry() {},
    async queryPermission() { return 'granted' },
  }
  const project = { directory, handles: new Map(), snapshots: new Map() }
  await saveDirectoryFiles(project as never, { 'quality.thml': 'claim stable\n' }, ['quality.thml'])
  assert.deepEqual(writes, [['quality.thml', 'claim stable\n']])
  assert.equal(project.handles.get('quality.thml'), made.get('quality.thml'))
  assert.deepEqual(project.snapshots.get('quality.thml'), { text: 'claim stable\n', lastModified: 42 })
})

test('directory removals forget handles only after the disk operation', async () => {
  const removed: string[] = []
  const directory = {
    kind: 'directory',
    name: '.thoughtml',
    async *values() {},
    async getFileHandle() { throw new Error('unused') },
    async removeEntry(name: string) { removed.push(name) },
    async queryPermission() { return 'granted' },
  }
  const project = {
    directory,
    handles: new Map([['old.thml', {}]]),
    snapshots: new Map([['old.thml', { text: 'old', lastModified: 1 }]]),
  }
  await removeDirectoryFiles(project as never, ['old.thml'])
  assert.deepEqual(removed, ['old.thml'])
  assert.equal(project.handles.has('old.thml'), false)
  assert.equal(project.snapshots.has('old.thml'), false)
})
