import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const thoughtmlBinary = resolve(import.meta.dirname, '..', '..', '..', 'target', 'debug', 'thoughtml.exe')

export function temporaryDirectory(t, prefix = 'thoughtml-dsh-') {
  const path = mkdtempSync(join(tmpdir(), prefix))
  t.after(() => rmSync(path, { recursive: true, force: true }))
  return path
}

export function fakeAgent(id, cwd) {
  return {
    id,
    session: {
      id,
      header: { cwd },
    },
  }
}
