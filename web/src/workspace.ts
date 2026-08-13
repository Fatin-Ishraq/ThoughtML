import type { Diagnostic } from './model'

export interface WorkspaceState {
  entry: string
  active: string
  files: Record<string, string>
}

export interface SourceOrigin {
  file: string
  line: number
}

const FILE_NAME = /^[a-z][a-z0-9-]*\.thml$/
const IMPORT = /^import\s+([a-z][a-z0-9-]*)\s+as\s+([a-z][a-z0-9-]*)\s*$/
const DEFINITION_KINDS = [
  'scope', 'question', 'focus', 'profile', 'observation', 'claim', 'hypothesis',
  'assumption', 'option', 'decision', 'goal', 'action', 'outcome', 'memory',
]
const POSTURES = new Set([
  'noticed', 'considers', 'suspects', 'infers', 'asks', 'holds', 'chooses',
  'rejects', 'revises', 'remembers', 'doubts', 'accepts',
])

export function validFileName(name: string): boolean {
  return FILE_NAME.test(name)
}

export function moduleName(file: string): string {
  return file.endsWith('.thml') ? file.slice(0, -5) : file
}

export function projectSources(workspace: WorkspaceState): Record<string, string> {
  return Object.fromEntries(
    Object.entries(workspace.files).map(([file, source]) => [moduleName(file), source]),
  )
}

export function importsOf(source: string): Map<string, string> {
  const imports = new Map<string, string>()
  for (const line of source.split(/\r?\n/)) {
    const match = IMPORT.exec(line)
    if (match) imports.set(match[2], `${match[1]}.thml`)
  }
  return imports
}

/** Resolve a parser diagnostic's project source key into a workspace filename. */
export function diagnosticFile(diag: Diagnostic, workspace: WorkspaceState): string {
  if (!diag.source || diag.source === 'entry') return workspace.entry
  if (diag.source in workspace.files) return diag.source
  const direct = `${diag.source}.thml`
  return direct in workspace.files ? direct : workspace.entry
}

/**
 * Locate authored graph objects without changing the stable canonical schema.
 * Namespace segments are followed through the same explicit import declarations
 * the compiler sees, then the local record header is found in its source file.
 */
export function findSourceOrigin(id: string, workspace: WorkspaceState): SourceOrigin | null {
  if (id.startsWith('agent:')) return null
  const lineInEntry = definitionLine(workspace.files[workspace.entry] ?? '', id)
  if (lineInEntry) return { file: workspace.entry, line: lineInEntry }
  let file = workspace.entry
  let localId = id
  const visited = new Set<string>()
  while (localId.includes('.') && !visited.has(file)) {
    visited.add(file)
    const dot = localId.indexOf('.')
    const alias = localId.slice(0, dot)
    const imported = importsOf(workspace.files[file] ?? '').get(alias)
    if (!imported || !(imported in workspace.files)) break
    file = imported
    localId = localId.slice(dot + 1)
  }

  const line = definitionLine(workspace.files[file] ?? '', localId)
  return line ? { file, line } : null
}

function definitionLine(source: string, localId: string): number | null {
  const lines = source.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const tokens = lines[index].trim().split(/\s+/)
    let authoredId: string | undefined
    if (DEFINITION_KINDS.includes(tokens[0])) authoredId = tokens[1]
    else if (tokens[0] === 'link' && tokens.length >= 4) {
      authoredId = tokens[1].endsWith(':')
        ? tokens[1].slice(0, -1)
        : `${tokens[1]}-${tokens[2]}-${tokens[3]}`
    } else if (tokens.length >= 3 && POSTURES.has(tokens[1])) {
      const aliasAt = tokens.lastIndexOf('as')
      authoredId = aliasAt >= 0 && tokens[aliasAt + 1]
        ? tokens[aliasAt + 1]
        : `${tokens[0]}-${tokens[1]}-${tokens[2]}`
    }
    if (authoredId === localId) {
      return index + 1
    }
  }
  return null
}

export function addImport(entry: string, file: string): string {
  const name = moduleName(file)
  const declaration = `import ${name} as ${name}`
  if (entry.split(/\r?\n/).some((line) => line.trim() === declaration)) return entry
  const lines = entry.split(/\r?\n/)
  let insertAt = 0
  while (insertAt < lines.length && (lines[insertAt].trim() === '' || lines[insertAt].trimStart().startsWith('#'))) insertAt += 1
  while (insertAt < lines.length && lines[insertAt].startsWith('import ')) insertAt += 1
  lines.splice(insertAt, 0, declaration)
  return lines.join('\n')
}
