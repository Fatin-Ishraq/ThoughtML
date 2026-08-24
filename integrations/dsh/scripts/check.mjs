import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const packageRoot = resolve(import.meta.dirname, '..')
const directories = ['src', 'scripts', 'test']
const files = directories.flatMap((directory) =>
  readdirSync(resolve(packageRoot, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')))
    .map((entry) => resolve(entry.parentPath, entry.name)),
)

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `Syntax check failed for ${file}.\n`)
    process.exit(result.status ?? 1)
  }
}

process.stdout.write(`Syntax checked ${files.length} JavaScript files.\n`)
