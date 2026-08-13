import type { Diagnostic, ParseResult, SourceLocation } from './model'

export type WorkspaceBacking = 'memory' | 'files' | 'directory'

export interface WorkspaceState {
  entry: string
  active: string
  files: Record<string, string>
  /** Last known disk/download baseline. Dirty state is derived against this. */
  saved: Record<string, string>
  /** Ordered editor tabs; the active file is always present. */
  tabs: string[]
  /** Files removed or renamed locally and awaiting a directory save. */
  deleted: string[]
  projectName: string
  backing: WorkspaceBacking
}

export interface SourceOrigin {
  file: string
  line: number
}

export interface ImportRecord {
  module: string
  alias: string
  file: string
  line: number
}

export interface MissingImport extends ImportRecord {
  source: string
}

export interface ProjectAnalysis {
  closure: Set<string>
  orphaned: Set<string>
  missing: MissingImport[]
  cycles: string[][]
  imports: Map<string, ImportRecord[]>
  dependents: Map<string, Set<string>>
}

export interface SearchResult {
  file: string
  line: number
  column: number
  preview: string
}

export interface DiskChanges {
  added: string[]
  changed: string[]
  deleted: string[]
  conflicts: string[]
}

const FILE_NAME = /^[a-z][a-z0-9-]*\.thml$/
const IMPORT = /^import\s+([a-z][a-z0-9-]*)\s+as\s+([a-z][a-z0-9-]*)\s*$/

export function validFileName(name: string): boolean {
  return FILE_NAME.test(name)
}

export function moduleName(file: string): string {
  return file.endsWith('.thml') ? file.slice(0, -5) : file
}

export function createWorkspace(
  files: Record<string, string>,
  entry?: string,
  options: Partial<Pick<WorkspaceState, 'projectName' | 'backing'>> = {},
): WorkspaceState {
  const names = Object.keys(files).filter(validFileName).sort()
  if (!names.length) throw new Error('a ThoughtML workspace needs at least one .thml file')
  const root = entry && entry in files ? entry : names.includes('project.thml') ? 'project.thml' : names[0]
  const cleanFiles = Object.fromEntries(names.map((name) => [name, files[name]]))
  return {
    entry: root,
    active: root,
    files: cleanFiles,
    saved: { ...cleanFiles },
    tabs: [root],
    deleted: [],
    projectName: options.projectName ?? moduleName(root),
    backing: options.backing ?? 'memory',
  }
}

/** Restore current and legacy browser snapshots without trusting their shape. */
export function normalizeWorkspace(value: unknown): WorkspaceState | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<WorkspaceState>
  const files = Object.fromEntries(
    Object.entries(raw.files ?? {}).filter(([name, source]) => validFileName(name) && typeof source === 'string'),
  )
  const names = Object.keys(files).sort()
  if (!names.length) return null
  const entry = typeof raw.entry === 'string' && raw.entry in files
    ? raw.entry
    : names.includes('project.thml') ? 'project.thml' : names[0]
  const active = typeof raw.active === 'string' && raw.active in files ? raw.active : entry
  const saved = Object.fromEntries(
    Object.entries(raw.saved ?? files).filter(([name, source]) => name in files && typeof source === 'string'),
  )
  const tabs = [...new Set((raw.tabs ?? [active]).filter((name): name is string => typeof name === 'string' && name in files))]
  if (!tabs.includes(active)) tabs.push(active)
  return {
    entry,
    active,
    files,
    saved,
    tabs,
    deleted: [...new Set((raw.deleted ?? []).filter((name) => typeof name === 'string' && validFileName(name)))],
    projectName: typeof raw.projectName === 'string' && raw.projectName.trim() ? raw.projectName : moduleName(entry),
    backing: raw.backing === 'directory' || raw.backing === 'files' ? raw.backing : 'memory',
  }
}

export function projectSources(workspace: WorkspaceState): Record<string, string> {
  return Object.fromEntries(
    Object.entries(workspace.files).map(([file, source]) => [moduleName(file), source]),
  )
}

export function importRecords(source: string): ImportRecord[] {
  const records: ImportRecord[] = []
  source.split(/\r?\n/).forEach((line, index) => {
    const match = IMPORT.exec(line)
    if (match) records.push({ module: match[1], alias: match[2], file: `${match[1]}.thml`, line: index + 1 })
  })
  return records
}

export function importsOf(source: string): Map<string, string> {
  return new Map(importRecords(source).map((item) => [item.alias, item.file]))
}

export function analyzeProject(workspace: WorkspaceState): ProjectAnalysis {
  const imports = new Map<string, ImportRecord[]>()
  const dependents = new Map<string, Set<string>>()
  for (const [file, source] of Object.entries(workspace.files)) {
    const records = importRecords(source)
    imports.set(file, records)
    for (const imported of records) {
      const users = dependents.get(imported.file) ?? new Set<string>()
      users.add(file)
      dependents.set(imported.file, users)
    }
  }

  const closure = new Set<string>()
  const missing: MissingImport[] = []
  const cycles: string[][] = []
  const visiting: string[] = []
  const visited = new Set<string>()
  const walk = (file: string) => {
    const cycleAt = visiting.indexOf(file)
    if (cycleAt >= 0) {
      cycles.push([...visiting.slice(cycleAt), file])
      return
    }
    if (visited.has(file)) return
    visited.add(file)
    closure.add(file)
    visiting.push(file)
    for (const imported of imports.get(file) ?? []) {
      if (!(imported.file in workspace.files)) missing.push({ ...imported, source: file })
      else walk(imported.file)
    }
    visiting.pop()
  }
  walk(workspace.entry)

  return {
    closure,
    orphaned: new Set(Object.keys(workspace.files).filter((file) => !closure.has(file))),
    missing,
    cycles,
    imports,
    dependents,
  }
}

export function isDirty(workspace: WorkspaceState, file: string): boolean {
  return !(file in workspace.saved) || workspace.files[file] !== workspace.saved[file]
}

export function dirtyFiles(workspace: WorkspaceState): string[] {
  return Object.keys(workspace.files).filter((file) => isDirty(workspace, file))
}

/** Classify an external directory snapshot without mutating either side. */
export function classifyDiskChanges(workspace: WorkspaceState, disk: Record<string, string>): DiskChanges {
  const added: string[] = []
  const changed: string[] = []
  const deleted: string[] = []
  const conflicts: string[] = []
  for (const [file, diskText] of Object.entries(disk)) {
    if (!(file in workspace.files)) {
      if (!workspace.deleted.includes(file)) added.push(file)
      continue
    }
    if (diskText === workspace.saved[file]) continue
    if (isDirty(workspace, file)) conflicts.push(file)
    else changed.push(file)
  }
  for (const file of Object.keys(workspace.files)) {
    if (file in disk || !(file in workspace.saved)) continue
    if (isDirty(workspace, file) || file === workspace.entry) conflicts.push(file)
    else deleted.push(file)
  }
  return { added, changed, deleted, conflicts: [...new Set(conflicts)] }
}

export function openTab(workspace: WorkspaceState, file: string): void {
  if (!(file in workspace.files)) return
  if (!workspace.tabs.includes(file)) workspace.tabs.push(file)
  workspace.active = file
}

export function closeTab(workspace: WorkspaceState, file: string): void {
  if (workspace.tabs.length <= 1) return
  const index = workspace.tabs.indexOf(file)
  if (index < 0) return
  workspace.tabs.splice(index, 1)
  if (workspace.active === file) workspace.active = workspace.tabs[Math.max(0, index - 1)]
}

export function addFile(workspace: WorkspaceState, file: string, source = '', addToEntry = true): void {
  if (!validFileName(file)) throw new Error('Use a lowercase kebab-case .thml filename')
  if (file in workspace.files) throw new Error(`${file} already exists`)
  workspace.deleted = workspace.deleted.filter((deleted) => deleted !== file)
  workspace.files[file] = source || `# ${moduleName(file)}\n\n`
  if (addToEntry && file !== workspace.entry) {
    workspace.files[workspace.entry] = addImport(workspace.files[workspace.entry], file)
  }
  openTab(workspace, file)
}

export function renameFile(workspace: WorkspaceState, from: string, to: string): string[] {
  if (!(from in workspace.files)) throw new Error(`${from} does not exist`)
  if (!validFileName(to)) throw new Error('Use a lowercase kebab-case .thml filename')
  if (to in workspace.files) throw new Error(`${to} already exists`)
  workspace.deleted = workspace.deleted.filter((deleted) => deleted !== to)
  const changed = new Set<string>([to])
  workspace.files[to] = workspace.files[from]
  delete workspace.files[from]
  if (from in workspace.saved) workspace.deleted.push(from)
  delete workspace.saved[from]
  for (const [file, source] of Object.entries(workspace.files)) {
    const updated = renameImportModule(source, moduleName(from), moduleName(to))
    if (updated !== source) {
      workspace.files[file] = updated
      changed.add(file)
    }
  }
  workspace.tabs = workspace.tabs.map((file) => file === from ? to : file)
  workspace.active = workspace.active === from ? to : workspace.active
  workspace.entry = workspace.entry === from ? to : workspace.entry
  workspace.deleted = [...new Set(workspace.deleted)]
  return [...changed]
}

export function deleteFile(workspace: WorkspaceState, file: string): void {
  if (!(file in workspace.files)) return
  if (Object.keys(workspace.files).length === 1) throw new Error('A project must keep at least one .thml file')
  if (file === workspace.entry) throw new Error('Choose another entry file before deleting this one')
  if (file in workspace.saved) workspace.deleted.push(file)
  delete workspace.files[file]
  delete workspace.saved[file]
  workspace.tabs = workspace.tabs.filter((tab) => tab !== file)
  if (!workspace.tabs.length) workspace.tabs.push(workspace.entry)
  if (workspace.active === file) workspace.active = workspace.tabs[workspace.tabs.length - 1]
  workspace.deleted = [...new Set(workspace.deleted)]
}

export function markSaved(workspace: WorkspaceState, files: string[]): void {
  for (const file of files) {
    if (file in workspace.files) workspace.saved[file] = workspace.files[file]
  }
}

export function markAllSaved(workspace: WorkspaceState): void {
  workspace.saved = { ...workspace.files }
  workspace.deleted = []
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

function renameImportModule(source: string, from: string, to: string): string {
  return source.split(/\r?\n/).map((line) => {
    const match = IMPORT.exec(line)
    return match?.[1] === from ? `import ${to} as ${match[2]}` : line
  }).join('\n')
}

export function sourceFile(source: string | undefined, workspace: WorkspaceState): string {
  if (!source || source === 'entry') return workspace.entry
  if (source in workspace.files) return source
  const direct = `${source}.thml`
  return direct in workspace.files ? direct : workspace.entry
}

export function diagnosticFile(diag: Diagnostic, workspace: WorkspaceState): string {
  return sourceFile(diag.source, workspace)
}

export function sourceOrigin(
  id: string,
  result: ParseResult | null,
  workspace: WorkspaceState,
): SourceOrigin | null {
  const location: SourceLocation | undefined = result?.source_map.objects[id]
  if (!location) return null
  return { file: sourceFile(location.source, workspace), line: location.line }
}

export function searchWorkspace(workspace: WorkspaceState, query: string, limit = 200): SearchResult[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  const results: SearchResult[] = []
  for (const file of Object.keys(workspace.files).sort()) {
    const lines = workspace.files[file].split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const column = lines[index].toLocaleLowerCase().indexOf(needle)
      if (column >= 0) results.push({ file, line: index + 1, column: column + 1, preview: lines[index].trim() })
      if (results.length >= limit) return results
    }
  }
  return results
}
