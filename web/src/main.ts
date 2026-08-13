import './styles.css'
import { parseTime, type ParseResult, type Diagnostic, type Conflict } from './model'
import { createEditor } from './editor'
import { ProjectCompiler } from './compiler'
import { createGraph, type ViewMode, type Theme } from './graph'
import { createTimeView } from './timeview'
import { buildLegend, buildLensKey } from './legend'
import { renderDiagnostics } from './diagnostics'
import { renderDetail, kindOf, labelOf } from './detail'
import { EXAMPLES, DEFAULT_EXAMPLE, ADVANCED_EXAMPLES } from './examples'
import { setIcon, glyph } from './icons'
import { downloadStandalone, documentTitle } from './download'
import { SNAKE_PROJECT, type WorkspaceSeed } from './project-examples'
import {
  addFile,
  analyzeProject,
  closeTab,
  classifyDiskChanges,
  createWorkspace,
  deleteFile,
  diagnosticFile,
  dirtyFiles,
  isDirty,
  importsOf,
  markAllSaved,
  markSaved,
  normalizeWorkspace,
  openTab,
  projectSources,
  renameFile,
  searchWorkspace,
  sourceOrigin,
  validFileName,
  type WorkspaceState,
} from './workspace'
import {
  chooseDirectory,
  chooseFiles,
  readDirectory,
  readDiskChanges,
  restoreDirectory,
  saveDirectoryFiles,
  savePickedFiles,
  removeDirectoryFiles,
  supportsDirectoryAccess,
  supportsFilePicker,
  type DirectoryProject,
  type FileHandleLike,
} from './filesystem'
import { downloadProject, downloadText } from './project-export'

const LS = { src: 'thoughtml:src', project: 'thoughtml:project:v2', oldProject: 'thoughtml:project:v1', theme: 'thoughtml:theme', view: 'thoughtml:view' }

function el<T extends HTMLElement = HTMLElement>(sel: string): T {
  const node = document.querySelector(sel)
  if (!node) throw new Error(`missing element: ${sel}`)
  return node as T
}

function workspaceFromSeed(seed: WorkspaceSeed): WorkspaceState {
  return createWorkspace({ ...seed.files }, seed.entry, { projectName: 'Snake reasoning', backing: 'memory' })
}

function exampleWorkspace(name: string): WorkspaceState {
  const entry = `${name}.thml`
  const files: Record<string, string> = { [entry]: EXAMPLES[name] }
  const queue = [...importsOf(EXAMPLES[name]).values()]
  const seen = new Set<string>()
  while (queue.length) {
    const file = queue.shift()!
    if (seen.has(file)) continue
    seen.add(file)
    const source = EXAMPLES[file.slice(0, -5)]
    if (!source) continue
    files[file] = source
    queue.push(...importsOf(source).values())
  }
  return createWorkspace(files, entry, { projectName: name, backing: 'memory' })
}

function loadWorkspace(): WorkspaceState {
  const stored = localStorage.getItem(LS.project) ?? localStorage.getItem(LS.oldProject)
  if (stored) {
    try {
      const restored = normalizeWorkspace(JSON.parse(stored))
      if (restored) return restored
    } catch { /* migrate the older single-source storage below */ }
  }
  const legacy = localStorage.getItem(LS.src)
  if (legacy) return createWorkspace({ 'untitled.thml': legacy }, 'untitled.thml')
  return exampleWorkspace(DEFAULT_EXAMPLE)
}

function persistWorkspace(workspace: WorkspaceState): void {
  localStorage.setItem(LS.project, JSON.stringify(workspace))
  localStorage.setItem(LS.src, workspace.files[workspace.entry] ?? '')
}

async function boot(): Promise<void> {
  let theme: Theme = localStorage.getItem(LS.theme) === 'light' ? 'light' : 'dark'
  let mode: ViewMode = localStorage.getItem(LS.view) === 'structural' ? 'structural' : 'readable'
  let workspace = loadWorkspace()
  let directoryProject: DirectoryProject | null = null
  let pickedHandles = new Map<string, FileHandleLike>()
  try {
    const remembered = workspace.backing === 'directory' ? await restoreDirectory() : null
    if (remembered) {
      const disk = await readDirectory(remembered)
      directoryProject = disk.project
      if (!dirtyFiles(workspace).length && !workspace.deleted.length && Object.keys(disk.files).length) {
        const restoredActive = workspace.active
        const restoredTabs = [...workspace.tabs]
        workspace = createWorkspace(disk.files, workspace.entry, {
          projectName: remembered.name,
          backing: 'directory',
        })
        if (restoredActive in workspace.files) workspace.active = restoredActive
        workspace.tabs = restoredTabs.filter((file) => file in workspace.files)
        if (!workspace.tabs.includes(workspace.active)) workspace.tabs.push(workspace.active)
      }
    }
  } catch { /* recovery remains available even if a remembered handle expired */ }
  const initialSrc = workspace.files[workspace.active]
  document.body.dataset.theme = theme

  // icons
  setIcon(el('#theme'), theme === 'dark' ? 'moon' : 'sun')
  setIcon(el('#fit'), 'fit')
  setIcon(el('#relayout'), 'relayout')
  setIcon(el('#legend-toggle'), 'legend')
  setIcon(el('#data-toggle'), 'braces')
  setIcon(el('#download-html'), 'download')
  setIcon(el('#copy-data'), 'copy')
  setIcon(el('#drawer-close'), 'close')
  setIcon(el('#detail-close'), 'close')
  setIcon(el('#zoom-in'), 'plus')
  setIcon(el('#zoom-out'), 'minus')

  const graph = createGraph(el('#graph'), theme)
  const compiler = new ProjectCompiler()
  // The primary "Viewer" is the lane-less, time-driven renderer (timeview),
  // overlaid on the graph pane; "Structural" stays the Cytoscape compound view.
  // Exactly one is active at a time; the toggle swaps them.
  const view = createTimeView(el('#graph').parentElement!, theme, { embedded: true })
  const isView = () => mode === 'readable'
  const rSelect = (id: string | null) => { if (isView()) view.select(id); else if (id) graph.select(id); else graph.cy.elements().unselect() }
  const rFit = () => (isView() ? view.fit() : graph.fit())
  const rZoomIn = () => (isView() ? view.zoomIn() : graph.zoomIn())
  const rZoomOut = () => (isView() ? view.zoomOut() : graph.zoomOut())
  const rZoomReset = () => (isView() ? view.zoomReset() : graph.zoomReset())
  const rCenter = (id: string) => (isView() ? view.centerOn(id) : graph.centerOn(id))
  // `baseline` is the parsed document; `last` is what the UI currently shows.
  let baseline: ParseResult | null = null
  let last: ParseResult | null = null
  let selectedId: string | null = null

  const editor = createEditor(el('#editor'), workspace.active, initialSrc, scheduleRun, theme)

  // ---- project workspace ----
  const workspaceEntry = el('#workspace-entry')
  const workspaceName = el('#workspace-name')
  const workspaceStatus = el('#workspace-status')
  const projectFilesEl = el('#project-files')
  const fileTabsEl = el('#file-tabs')
  const projectFileCount = el('#project-file-count')
  const projectImportsEl = el('#project-imports')
  const projectProblemsEl = el('#project-problems')
  const projectProblemSection = el('#project-problem-section')
  const activeFileStatus = el('#active-file-status')
  const compileStatus = el('#compile-status')
  const saveButton = el<HTMLButtonElement>('#save-file')
  const saveAllButton = el<HTMLButtonElement>('#save-all')
  const refreshButton = el<HTMLButtonElement>('#refresh-project')
  const openFolderButton = el<HTMLButtonElement>('#open-folder')
  openFolderButton.disabled = !supportsDirectoryAccess()

  function fileDiagnostics(file: string): Diagnostic[] {
    return last?.diagnostics.items.filter((diag) => diagnosticFile(diag, workspace) === file) ?? []
  }

  function renderWorkspace(): void {
    const analysis = analyzeProject(workspace)
    const files = Object.keys(workspace.files).sort((a, b) => {
      if (a === workspace.entry) return -1
      if (b === workspace.entry) return 1
      return a.localeCompare(b)
    })
    const dirty = dirtyFiles(workspace)
    const pending = dirty.length + workspace.deleted.length
    workspaceName.textContent = workspace.projectName
    workspaceName.title = workspace.projectName
    workspaceEntry.textContent = workspace.entry
    workspaceEntry.title = `Entry file: ${workspace.entry}`
    workspaceStatus.textContent = workspace.backing === 'directory'
      ? `${pending ? `${pending} unsaved` : 'saved'} · folder`
      : workspace.backing === 'files'
        ? `${pending ? `${pending} unsaved` : 'saved'} · files`
        : `${pending ? `${pending} unsaved` : 'local draft'}`
    workspaceStatus.className = 'workspace-status'
    workspaceStatus.classList.toggle('dirty', pending > 0)
    workspaceStatus.classList.toggle('directory', workspace.backing === 'directory' && pending === 0)
    projectFileCount.textContent = String(files.length)
    activeFileStatus.textContent = isDirty(workspace, workspace.active) ? 'modified' : 'saved'
    saveButton.disabled = !isDirty(workspace, workspace.active)
    saveAllButton.disabled = dirty.length === 0 && workspace.deleted.length === 0
    refreshButton.disabled = !directoryProject
    projectFilesEl.replaceChildren(...files.map((file) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'project-file'
      button.classList.toggle('active', file === workspace.active)
      button.classList.toggle('dirty', isDirty(workspace, file))
      button.classList.toggle('orphan', analysis.orphaned.has(file))
      const diagnostics = fileDiagnostics(file)
      button.classList.toggle('has-error', diagnostics.some((diag) => diag.severity === 'error'))
      button.classList.toggle('has-warning', diagnostics.length > 0 && !diagnostics.some((diag) => diag.severity === 'error'))
      const name = document.createElement('span'); name.textContent = file
      button.appendChild(name)
      if (file === workspace.entry) {
        const badge = document.createElement('small'); badge.textContent = 'entry'; button.appendChild(badge)
      }
      button.addEventListener('click', () => switchFile(file))
      return button
    }))
    fileTabsEl.replaceChildren(...workspace.tabs.filter((file) => file in workspace.files).map((file) => {
      const tab = document.createElement('button')
      tab.type = 'button'
      tab.className = 'file-tab'
      tab.classList.toggle('active', file === workspace.active)
      tab.classList.toggle('dirty', isDirty(workspace, file))
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-selected', String(file === workspace.active))
      tab.title = file
      const label = document.createElement('span')
      label.className = 'file-tab-label'
      label.textContent = file
      const close = document.createElement('span')
      close.className = 'file-tab-close'
      close.setAttribute('role', 'button')
      close.setAttribute('aria-label', `Close ${file}`)
      close.textContent = '×'
      close.addEventListener('click', (event) => {
        event.stopPropagation()
        closeTab(workspace, file)
        editor.openFile(workspace.active, workspace.files[workspace.active])
        persistWorkspace(workspace)
        renderWorkspace()
        syncActiveDiagnostics()
      })
      tab.append(label, close)
      tab.addEventListener('click', () => switchFile(file))
      return tab
    }))

    const activeImports = analysis.imports.get(workspace.active) ?? []
    projectImportsEl.replaceChildren(...activeImports.map((item) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'project-import'
      button.textContent = `${item.alias} → ${item.file}`
      button.title = `${workspace.active}:${item.line}`
      button.disabled = !(item.file in workspace.files)
      button.addEventListener('click', () => switchFile(item.file))
      return button
    }))
    if (!activeImports.length) {
      const empty = document.createElement('span')
      empty.className = 'project-import'
      empty.textContent = 'none'
      projectImportsEl.replaceChildren(empty)
    }

    const problems: Array<{ message: string; file?: string; line?: number; error?: boolean }> = []
    for (const missing of analysis.missing) problems.push({
      message: `${missing.source}:${missing.line} missing ${missing.file}`,
      file: missing.source,
      line: missing.line,
      error: true,
    })
    for (const cycle of analysis.cycles) problems.push({ message: `cycle: ${cycle.join(' → ')}`, error: true })
    if (analysis.orphaned.size) problems.push({ message: `${analysis.orphaned.size} file${analysis.orphaned.size === 1 ? '' : 's'} outside the entry closure` })
    projectProblemSection.hidden = problems.length === 0
    projectProblemsEl.replaceChildren(...problems.map((problem) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `project-problem${problem.error ? ' error' : ''}`
      button.textContent = problem.message
      if (problem.file) button.addEventListener('click', () => switchFile(problem.file!, problem.line))
      return button
    }))
  }

  function syncActiveDiagnostics(): void {
    editor.setDiagnostics(fileDiagnostics(workspace.active))
  }

  function switchFile(file: string, line?: number): void {
    if (!(file in workspace.files)) return
    openTab(workspace, file)
    persistWorkspace(workspace)
    editor.openFile(file, workspace.files[file])
    renderWorkspace()
    syncActiveDiagnostics()
    if (line) window.setTimeout(() => editor.gotoLine(line), 0)
  }

  function canReplaceProject(): boolean {
    const count = dirtyFiles(workspace).length + workspace.deleted.length
    return count === 0 || window.confirm(`Replace this project and discard ${count} unsaved change${count === 1 ? '' : 's'}?`)
  }

  function loadProject(next: WorkspaceState, message: string): void {
    workspace = next
    persistWorkspace(workspace)
    editor.reset(workspace.active, workspace.files[workspace.active])
    pills.forEach((pill) => pill.classList.remove('active'))
    renderWorkspace()
    runProject()
    toast(message)
  }

  el('#snake-project').addEventListener('click', () => {
    if (!canReplaceProject()) return
    directoryProject = null
    pickedHandles.clear()
    loadProject(workspaceFromSeed(SNAKE_PROJECT), 'Loaded the six-file Snake project')
  })
  el('#set-entry').addEventListener('click', () => {
    workspace.entry = workspace.active
    persistWorkspace(workspace)
    renderWorkspace()
    runProject()
    toast(`${workspace.entry} is now the project entry`)
  })
  el('#new-file').addEventListener('click', () => {
    const requested = window.prompt('New sibling ThoughtML file', 'evidence.thml')?.trim().toLowerCase()
    if (!requested) return
    const file = requested.endsWith('.thml') ? requested : `${requested}.thml`
    try {
      addFile(workspace, file)
    } catch (error) {
      toast(String(error instanceof Error ? error.message : error))
      return
    }
    editor.replaceFile(workspace.entry, workspace.files[workspace.entry])
    editor.openFile(file, workspace.files[file])
    persistWorkspace(workspace)
    renderWorkspace()
    runProject()
    toast(`Created and imported ${file}`)
  })

  el('#rename-file').addEventListener('click', () => {
    const from = workspace.active
    const requested = window.prompt(`Rename ${from}`, from)?.trim().toLowerCase()
    if (!requested || requested === from) return
    const to = requested.endsWith('.thml') ? requested : `${requested}.thml`
    try {
      const changed = renameFile(workspace, from, to)
      editor.renameFile(from, to)
      for (const file of changed) editor.replaceFile(file, workspace.files[file])
      editor.openFile(workspace.active, workspace.files[workspace.active])
      persistWorkspace(workspace)
      renderWorkspace()
      runProject()
      toast(`Renamed ${from} to ${to}; import aliases were preserved`)
    } catch (error) {
      toast(String(error instanceof Error ? error.message : error))
    }
  })

  el('#delete-file').addEventListener('click', () => {
    const file = workspace.active
    const users = [...(analyzeProject(workspace).dependents.get(file) ?? [])]
    const impact = users.length ? ` It is imported by ${users.join(', ')}.` : ''
    if (!window.confirm(`Delete ${file}?${impact}`)) return
    try {
      deleteFile(workspace, file)
      editor.openFile(workspace.active, workspace.files[workspace.active])
      editor.removeFile(file)
      persistWorkspace(workspace)
      renderWorkspace()
      runProject()
      toast(`${file} will be removed when the project is saved`)
    } catch (error) {
      toast(String(error instanceof Error ? error.message : error))
    }
  })

  const fileInput = el<HTMLInputElement>('#project-file-input')
  openFolderButton.addEventListener('click', async () => {
    if (!canReplaceProject()) return
    try {
      const opened = await chooseDirectory()
      if (!Object.keys(opened.files).length) { toast('That folder contains no lowercase .thml files'); return }
      directoryProject = opened.project
      pickedHandles.clear()
      const next = createWorkspace(opened.files, undefined, {
        projectName: opened.project.directory.name,
        backing: 'directory',
      })
      loadProject(next, `Opened ${opened.project.directory.name}`)
      if (opened.rejected.length) toast(`Opened project; skipped invalid names: ${opened.rejected.join(', ')}`)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) toast(`Could not open folder: ${String(error)}`)
    }
  })

  el('#open-project').addEventListener('click', async () => {
    if (!canReplaceProject()) return
    if (!supportsFilePicker()) { fileInput.click(); return }
    try {
      const opened = await chooseFiles()
      if (!Object.keys(opened.files).length) { toast('Choose one or more lowercase .thml files'); return }
      directoryProject = null
      pickedHandles = opened.handles
      loadProject(createWorkspace(opened.files, undefined, { projectName: 'Selected files', backing: 'files' }), `Opened ${opened.handles.size} ThoughtML files`)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) toast(`Could not open files: ${String(error)}`)
    }
  })
  fileInput.addEventListener('change', async () => {
    const selected = [...(fileInput.files ?? [])]
    const entries = await Promise.all(selected.map(async (file) => [file.name.toLowerCase(), await file.text()] as const))
    const files = Object.fromEntries(entries.filter(([name]) => validFileName(name)))
    const names = Object.keys(files).sort()
    if (!names.length) { toast('Choose one or more .thml files'); return }
    directoryProject = null
    pickedHandles.clear()
    loadProject(createWorkspace(files, undefined, { projectName: 'Imported project', backing: 'memory' }), `Opened ${names.length} ThoughtML file${names.length === 1 ? '' : 's'}`)
    fileInput.value = ''
  })

  async function saveFiles(names: string[], all: boolean): Promise<void> {
    try {
      if (directoryProject) {
        await saveDirectoryFiles(directoryProject, workspace.files, names)
        if (all && workspace.deleted.length) await removeDirectoryFiles(directoryProject, workspace.deleted)
        if (all) markAllSaved(workspace); else markSaved(workspace, names)
      } else if (pickedHandles.size) {
        const saved = await savePickedFiles(pickedHandles, workspace.files, names)
        markSaved(workspace, saved)
        if (saved.length !== names.length || workspace.deleted.length) {
          downloadProject(workspace.projectName, workspace.files)
          markAllSaved(workspace)
          toast('Some new or renamed files had no writable handle; exported the complete project')
        }
      } else if (all) {
        downloadProject(workspace.projectName, workspace.files)
        markAllSaved(workspace)
      } else {
        const file = names[0]
        downloadText(file, workspace.files[file])
        markSaved(workspace, [file])
      }
      persistWorkspace(workspace)
      renderWorkspace()
      toast(all ? 'Saved the complete ThoughtML project' : `Saved ${names[0]}`)
    } catch (error) {
      toast(`Save failed: ${String(error)}`)
    }
  }

  saveButton.addEventListener('click', () => void saveFiles([workspace.active], false))
  saveAllButton.addEventListener('click', () => void saveFiles(dirtyFiles(workspace), true))
  el('#download-project').addEventListener('click', () => {
    downloadProject(workspace.projectName, workspace.files)
    toast('Exported the complete project as ZIP')
  })

  const conflictDialog = el<HTMLDialogElement>('#conflict-dialog')
  const conflictTitle = el('#conflict-title')
  const conflictMessage = el('#conflict-message')
  function askConflict(file: string, deletedOnDisk = false): Promise<'disk' | 'editor' | 'both' | 'cancel'> {
    conflictTitle.textContent = deletedOnDisk ? `${file} was deleted on disk` : `${file} changed in two places`
    conflictMessage.textContent = deletedOnDisk
      ? 'An external process removed this file while the browser has its own version. Choose which state should win.'
      : 'An external process—possibly an AI agent—edited this file while it also has unsaved browser changes.'
    conflictDialog.showModal()
    return new Promise((resolve) => {
      conflictDialog.addEventListener('close', () => {
        const value = conflictDialog.returnValue
        resolve(value === 'disk' || value === 'editor' || value === 'both' ? value : 'cancel')
      }, { once: true })
    })
  }

  function acceptExternalDeletion(file: string): boolean {
    if (Object.keys(workspace.files).length === 1) return false
    if (workspace.entry === file) {
      const replacement = Object.keys(workspace.files).find((name) => name !== file)
      if (!replacement) return false
      workspace.entry = replacement
    }
    delete workspace.files[file]
    delete workspace.saved[file]
    workspace.tabs = workspace.tabs.filter((tab) => tab !== file)
    if (!workspace.tabs.length) workspace.tabs.push(workspace.entry)
    if (workspace.active === file) {
      workspace.active = workspace.tabs[workspace.tabs.length - 1]
      editor.openFile(workspace.active, workspace.files[workspace.active])
    }
    editor.removeFile(file)
    return true
  }

  let refreshing = false
  let lastRefresh = 0
  async function refreshFromDisk(manual: boolean): Promise<void> {
    if (!directoryProject || refreshing) return
    refreshing = true
    compileStatus.textContent = 'checking disk…'
    compileStatus.className = 'compiling'
    let changed = false
    try {
      const fresh = await readDiskChanges(directoryProject)
      const diskChanges = classifyDiskChanges(workspace, fresh.files)
      for (const file of diskChanges.added) {
        workspace.files[file] = fresh.files[file]
        workspace.saved[file] = fresh.files[file]
        editor.replaceFile(file, fresh.files[file])
        changed = true
      }
      for (const file of diskChanges.changed) {
        workspace.files[file] = fresh.files[file]
        workspace.saved[file] = fresh.files[file]
        editor.replaceFile(file, fresh.files[file])
        changed = true
      }
      for (const file of diskChanges.conflicts) {
        const deletedOnDisk = !(file in fresh.files)
        const choice = await askConflict(file, deletedOnDisk)
        if (deletedOnDisk) {
          if (choice === 'disk') changed = acceptExternalDeletion(file) || changed
          else if (choice === 'editor' || choice === 'both') {
            if (choice === 'both') downloadText(`${file.slice(0, -5)}-editor.thml`, workspace.files[file])
            delete workspace.saved[file]
            changed = true
          }
        } else {
          const diskText = fresh.files[file]
          if (choice === 'disk') {
            workspace.files[file] = diskText
            workspace.saved[file] = diskText
            editor.replaceFile(file, diskText)
            changed = true
          } else if (choice === 'editor' || choice === 'both') {
            if (choice === 'both') {
              downloadText(`${file.slice(0, -5)}-editor.thml`, workspace.files[file])
              downloadText(`${file.slice(0, -5)}-disk.thml`, diskText)
            }
            workspace.saved[file] = diskText
            changed = true
          }
        }
      }
      for (const file of diskChanges.deleted) changed = acceptExternalDeletion(file) || changed
      directoryProject = fresh.project
      lastRefresh = Date.now()
      if (changed) {
        persistWorkspace(workspace)
        renderWorkspace()
        syncActiveDiagnostics()
        runProject()
        toast('Synchronized external ThoughtML changes')
      } else if (manual) toast('Project already matches the folder on disk')
    } catch (error) {
      if (manual) toast(`Refresh failed: ${String(error)}`)
    } finally {
      refreshing = false
      if (!changed) {
        compileStatus.textContent = 'ready'
        compileStatus.className = ''
      }
    }
  }

  refreshButton.addEventListener('click', () => void refreshFromDisk(true))
  window.addEventListener('focus', () => {
    if (directoryProject && Date.now() - lastRefresh > 1000 && !conflictDialog.open) {
      void refreshFromDisk(false)
    }
  })

  const palette = el<HTMLDialogElement>('#project-palette')
  const paletteQuery = el<HTMLInputElement>('#palette-query')
  const paletteResults = el('#palette-results')
  let paletteMode: 'files' | 'search' = 'search'

  function renderPalette(): void {
    const query = paletteQuery.value
    const results = paletteMode === 'files' || !query.trim()
      ? Object.keys(workspace.files).sort().map((file) => ({ file, line: 1, column: 1, preview: file === workspace.entry ? 'project entry' : 'ThoughtML file' }))
      : searchWorkspace(workspace, query)
    paletteResults.replaceChildren(...results.map((result) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'palette-result'
      const file = document.createElement('span'); file.className = 'palette-result-file'; file.textContent = result.file
      const line = document.createElement('span'); line.className = 'palette-result-line'; line.textContent = `:${result.line}`
      const preview = document.createElement('span'); preview.className = 'palette-result-preview'; preview.textContent = result.preview || 'blank line'
      button.append(file, line, preview)
      button.addEventListener('click', () => {
        palette.close()
        switchFile(result.file, result.line)
      })
      return button
    }))
  }

  function openPalette(mode: 'files' | 'search'): void {
    paletteMode = mode
    paletteQuery.value = ''
    paletteQuery.placeholder = mode === 'files' ? 'Type a filename…' : 'Search every ThoughtML file…'
    renderPalette()
    palette.showModal()
    window.setTimeout(() => paletteQuery.focus(), 0)
  }
  paletteQuery.addEventListener('input', () => {
    if (paletteMode === 'files') {
      const query = paletteQuery.value.toLocaleLowerCase()
      const buttons = [...paletteResults.querySelectorAll<HTMLButtonElement>('.palette-result')]
      for (const button of buttons) button.hidden = !button.textContent?.toLocaleLowerCase().includes(query)
    } else renderPalette()
  })
  el('#search-project').addEventListener('click', () => openPalette('search'))

  // ---- examples ----
  const examplesEl = el('#examples')
  const pills: HTMLButtonElement[] = []
  for (const name of Object.keys(EXAMPLES)) {
    if (ADVANCED_EXAMPLES.has(name)) continue // parked from the tray (still imported/loadable)
    const b = document.createElement('button')
    b.className = 'pill'
    b.textContent = name
    b.addEventListener('click', () => {
      if (!canReplaceProject()) return
      directoryProject = null
      pickedHandles.clear()
      loadProject(exampleWorkspace(name), `Loaded ${name}`)
      pills.forEach((p) => p.classList.toggle('active', p === b))
    })
    pills.push(b)
    examplesEl.appendChild(b)
    if (workspace.entry === `${name}.thml`) b.classList.add('active')
  }
  el('#examples-toggle').addEventListener('click', () => el('#examples-tray').classList.toggle('collapsed'))

  // ---- legend (visual key: node types + relation vocabulary) ----
  buildLegend(el('#legend'), theme)
  el('#legend-toggle').addEventListener('click', () => { el('#legend').hidden = !el('#legend').hidden })

  // ---- lens: colour the whole graph by Type / Evidence / Argument ----
  const lensKey = el('#lens-key')
  const lensBtns = Array.from(el('#lens').querySelectorAll<HTMLButtonElement>('button[data-lens]'))
  for (const btn of lensBtns) {
    btn.addEventListener('click', () => {
      const lens = btn.dataset.lens ?? 'type'
      lensBtns.forEach((b) => b.classList.toggle('active', b === btn))
      graph.setHeat(lens === 'evidence')
      graph.setStatus(lens === 'argument')
      graph.setSensitivity(lens === 'sensitivity')
      graph.setDecision(lens === 'decision')
      buildLensKey(lensKey, lens)
    })
  }

  // ---- detail panel (third column) ----
  const detailPane = el('#detail')
  const detailBody = el('#detail-body')
  const detailBadge = el('#detail-badge')
  const detailId = el('#detail-id')
  const detailSource = el<HTMLButtonElement>('#detail-source')

  function showDetail(id: string) {
    if (!last) return
    selectedId = id
    detailPane.classList.remove('collapsed')
    const kind = kindOf(last.canonical, id)
    const obj = last.canonical.objects.find((o) => o.id === id)
    const gname = obj?.type === 'focus' ? obj.kind : obj?.type === 'stance' ? obj.posture : ''
    detailBadge.className = `detail-badge k-${kind}`
    detailBadge.innerHTML = `${gname ? glyph(gname) : ''}<span>${kind}</span>`
    detailId.textContent = labelOf(id)
    const origin = sourceOrigin(id, last, workspace)
    detailSource.hidden = !origin
    detailSource.textContent = origin ? `${origin.file}:${origin.line}` : ''
    detailSource.onclick = origin ? () => switchFile(origin.file, origin.line) : null
    renderDetail(detailBody, last.canonical, id, navigateTo)
    rSelect(id)
    window.setTimeout(() => { if (!isView()) graph.resize(); rCenter(id) }, 230)
  }
  function closeDetail() {
    selectedId = null
    detailPane.classList.add('collapsed')
    rSelect(null)
    if (!isView()) window.setTimeout(() => graph.resize(), 230)
  }
  function navigateTo(id: string) { showDetail(id) }

  graph.onSelect((info) => { if (info) showDetail(info.id); else closeDetail() })
  view.onSelect((info) => { if (info) showDetail(info.id); else closeDetail() })
  el('#detail-close').addEventListener('click', closeDetail)

  // ---- data drawer ----
  const drawer = el('#drawer')
  el('#data-toggle').addEventListener('click', () => drawer.classList.toggle('open'))
  el('#drawer-close').addEventListener('click', () => drawer.classList.remove('open'))
  const dataTabs = Array.from(el('#data-tabs').querySelectorAll<HTMLButtonElement>('button'))
  for (const tab of dataTabs) {
    tab.addEventListener('click', () => {
      const which = tab.dataset.data
      dataTabs.forEach((t) => t.classList.toggle('active', t === tab))
      el('#json').classList.toggle('active', which === 'json')
      el('#ast').classList.toggle('active', which === 'ast')
    })
  }
  el('#copy-data').addEventListener('click', () => {
    const active = drawer.querySelector('.data-pane.active') as HTMLElement
    navigator.clipboard?.writeText(active?.textContent ?? '').then(() => toast('Copied to clipboard'))
  })

  // ---- diagnostics ----
  const diagBar = el('#diag-bar')
  el('#diag-toggle').addEventListener('click', () => diagBar.classList.toggle('open'))

  // Copy the current diagnostics + conflicts as plain text, so a warning can be
  // pasted into an issue or shared without retyping. Hidden when the doc is clean.
  setIcon(el('#diag-copy'), 'copy')
  let diagText = ''
  el('#diag-copy').addEventListener('click', (e) => {
    e.stopPropagation()
    if (diagText) navigator.clipboard?.writeText(diagText).then(() => toast('Diagnostics copied'))
  })

  // ---- view toggle ----
  // Swaps which renderer is live: the timeview (Viewer) overlays the pane and the
  // Cytoscape canvas hides, or vice-versa for Structural.
  function syncRenderers(animate: boolean): void {
    view.setActive(isView())
    el('#graph').style.display = isView() ? 'none' : ''
    if (isView() && timelineEl) timelineEl.hidden = true
    if (!last) return
    if (isView()) { view.render(last.canonical) } else { graph.render(last.canonical, mode, animate) }
    if (!isView()) syncTimeline(last)
    if (selectedId) rSelect(selectedId)
  }
  const viewBtns = Array.from(el('#view').querySelectorAll<HTMLButtonElement>('button'))
  viewBtns.forEach((b) => b.classList.toggle('active', b.dataset.view === mode))
  for (const btn of viewBtns) {
    btn.addEventListener('click', () => {
      mode = btn.dataset.view as ViewMode
      localStorage.setItem(LS.view, mode)
      viewBtns.forEach((b) => b.classList.toggle('active', b === btn))
      syncRenderers(true)
    })
  }

  // ---- graph controls + zoom ----
  el('#download-html').addEventListener('click', () => {
    if (last) void downloadStandalone(last.canonical, documentTitle(last.canonical))
  })
  el('#fit').addEventListener('click', () => rFit())
  el('#relayout').addEventListener('click', () => (isView() ? view.fit() : graph.relayout()))
  el('#zoom-in').addEventListener('click', () => rZoomIn())
  el('#zoom-out').addEventListener('click', () => rZoomOut())
  el('#zoom-pct').addEventListener('click', () => rZoomReset())
  graph.onZoom((pct) => { el('#zoom-pct').textContent = `${pct}%` })
  view.onZoom((pct) => { el('#zoom-pct').textContent = `${pct}%` })

  // ---- as-of timeline (Phase 3) ----
  const timelineEl = el('#timeline')
  const slider = el<HTMLInputElement>('#time-slider')
  const timeDate = el('#time-date')
  const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

  // The current as-of position, tracked here rather than read back from the DOM
  // (the range input clamps its value to min/max as soon as those are set).
  let asOfValue: number | null = null
  function applyTime(ms: number): void {
    asOfValue = ms
    graph.applyAsOf(ms)
    timeDate.textContent = fmtDate(ms)
  }
  slider.addEventListener('input', () => applyTime(Number(slider.value)))

  // Re-fit the slider to a freshly parsed document's timeline. Hidden unless the
  // document spans more than a single instant. Defaults to the latest moment
  // (full final state); preserves the user's position across edits if still in
  // range.
  function syncTimeline(res: ParseResult): void {
    // In Viewer mode the timeview owns its own play/scrub bar, so the host
    // as-of slider stays hidden.
    if (isView()) { timelineEl.hidden = true; return }
    const tl = res.canonical.timeline
    const start = parseTime(tl?.start)
    const end = parseTime(tl?.end)
    if (start === undefined || end === undefined || end <= start) {
      timelineEl.hidden = true
      asOfValue = null
      graph.applyAsOf(null)
      return
    }
    timelineEl.hidden = false
    slider.min = String(start)
    slider.max = String(end)
    slider.step = String(Math.max(1, Math.floor((end - start) / 240)))
    const keep = asOfValue !== null && asOfValue >= start && asOfValue <= end
    const v = keep ? asOfValue! : end
    slider.value = String(v)
    applyTime(v)
  }

  // ---- theme ----
  el('#theme').addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(LS.theme, theme)
    document.body.dataset.theme = theme
    setIcon(el('#theme'), theme === 'dark' ? 'moon' : 'sun')
    graph.setTheme(theme)
    view.setTheme(theme)
    editor.setTheme(theme)
    buildLegend(el('#legend'), theme)
  })

  // ---- pipeline ----
  // Full project compilation runs in a worker. The previous valid graph remains
  // visible while the newest entry/import closure is being compiled.
  function runProject(): void {
    persistWorkspace(workspace)
    compileStatus.textContent = 'compiling…'
    compileStatus.className = 'compiling'
    const request = compiler.compile(workspace.files[workspace.entry], projectSources(workspace))
    void request.promise.then((result) => {
      if (!compiler.isLatest(request.version)) return
      baseline = result
      compileStatus.textContent = 'ready'
      compileStatus.className = ''
      applyView()
    }).catch((error: unknown) => {
      if (!compiler.isLatest(request.version)) return
      compileStatus.textContent = last ? 'graph is stale' : 'compile failed'
      compileStatus.className = last ? 'stale' : 'error'
      toast(`Parser error: ${String(error)}`)
    })
  }

  function applyView(): void {
    if (!baseline) return
    last = baseline
    const canon = last.canonical
    el('#empty-state').hidden = canon.objects.length > 0
    el('#graph').style.display = isView() ? 'none' : ''
    view.setActive(isView())
    if (isView()) view.render(canon)
    else graph.render(canon, mode)
    syncTimeline(last)
    const conflicts = canon.audit?.conflicts ?? []
    setDiagStatus(last.diagnostics.items, conflicts)
    const displayDiagnostics = last.diagnostics.items.map((diag) => ({ ...diag, source: diagnosticFile(diag, workspace) }))
    renderDiagnostics(el('#diagnostics'), displayDiagnostics, conflicts, (diag) => {
      switchFile(diagnosticFile(diag, workspace), diag.line)
    })
    syncActiveDiagnostics()
    diagText = formatDiagnostics(last.diagnostics.items, conflicts)
    el('#diag-copy').hidden = diagText === ''
    el('#json').textContent = JSON.stringify(canon, null, 2)
    el('#ast').textContent = JSON.stringify(last.surface, null, 2)

    // keep detail panel in sync with the latest view
    if (selectedId) {
      const stillThere = selectedId.startsWith('agent:')
        ? canon.objects.some((o) => o.type === 'stance' && o.agent === selectedId!.slice(6))
        : canon.objects.some((o) => o.id === selectedId)
      if (stillThere) {
        const origin = sourceOrigin(selectedId, last, workspace)
        detailSource.hidden = !origin
        detailSource.textContent = origin ? `${origin.file}:${origin.line}` : ''
        detailSource.onclick = origin ? () => switchFile(origin.file, origin.line) : null
        renderDetail(detailBody, canon, selectedId, navigateTo)
        rSelect(selectedId)
      } else {
        closeDetail()
      }
    }
    renderWorkspace()
    if (!isView()) el('#zoom-pct').textContent = `${Math.round(graph.cy.zoom() * 100)}%`
  }

  // Plain-text rendering of the diagnostics panel, for the clipboard. Conflicts
  // (the mirror's second reading) come first, then source diagnostics by line —
  // the same order the panel shows them in.
  function formatDiagnostics(items: Diagnostic[], conflicts: Conflict[]): string {
    const lines: string[] = []
    for (const c of conflicts) lines.push(`conflict [${c.severity}]: ${c.message}`)
    for (const d of [...items].sort((a, b) => diagnosticFile(a, workspace).localeCompare(diagnosticFile(b, workspace)) || a.line - b.line)) {
      const file = diagnosticFile(d, workspace)
      lines.push(`${file}${d.line > 0 ? `:${d.line}` : ''} [${d.severity}]: ${d.message}`)
    }
    return lines.join('\n')
  }

  function setDiagStatus(items: Diagnostic[], conflicts: Conflict[]): void {
    const errors = items.filter((d) => d.severity === 'error').length
    const warnings = items.length - errors
    const status = el('#diag-status')
    status.classList.remove('ok', 'has-error', 'has-warn')
    let cls = 'ok'
    let text = 'No diagnostics'
    if (errors > 0) {
      cls = 'has-error'
      text = `${errors} error${errors !== 1 ? 's' : ''}` + (warnings ? `, ${warnings} warning${warnings !== 1 ? 's' : ''}` : '')
    } else if (warnings > 0) {
      cls = 'has-warn'
      text = `${warnings} warning${warnings !== 1 ? 's' : ''}`
    }
    // Mirror conflicts ride a separate channel — surface them even when the
    // document is diagnostically clean (that is precisely the interesting case).
    if (conflicts.length) {
      const n = conflicts.length
      text = (text === 'No diagnostics' ? '' : text + ' · ') + `${n} conflict${n !== 1 ? 's' : ''}`
      if (cls === 'ok') cls = 'has-warn'
    }
    status.classList.add(cls)
    status.innerHTML = `<span class="dot"></span>${text}`
  }

  let timer: number | undefined
  function scheduleRun(file: string, src: string): void {
    if (!(file in workspace.files)) return
    workspace.files[file] = src
    persistWorkspace(workspace)
    renderWorkspace()
    if (timer) clearTimeout(timer)
    timer = window.setTimeout(runProject, 180)
  }

  // ---- keyboard ----
  window.addEventListener('keydown', (e) => {
    const command = e.ctrlKey || e.metaKey
    if (command && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void saveFiles(e.shiftKey ? dirtyFiles(workspace) : [workspace.active], e.shiftKey)
      return
    }
    if (command && !e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault()
      openPalette('files')
      return
    }
    if (command && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      openPalette('search')
      return
    }
    if (e.key === 'Escape') {
      if (drawer.classList.contains('open')) drawer.classList.remove('open')
      else if (!detailPane.classList.contains('collapsed')) closeDetail()
    }
  })
  window.addEventListener('beforeunload', (event) => {
    if (dirtyFiles(workspace).length || workspace.deleted.length) event.preventDefault()
  })
  window.addEventListener('pagehide', () => compiler.dispose())

  // ---- divider + resize ----
  setupDivider(el('#divider'), el('.editor-pane'), () => { graph.resize(); if (isView()) view.fit() })
  window.addEventListener('resize', () => { graph.resize(); if (isView()) view.fit() })

  renderWorkspace()
  runProject()

  const loading = el('#loading')
  loading.classList.add('done')
  setTimeout(() => (loading.hidden = true), 350)
}

let toastTimer: number | undefined
function toast(message: string): void {
  const t = document.querySelector('#toast') as HTMLElement
  t.textContent = message
  t.hidden = false
  requestAnimationFrame(() => t.classList.add('show'))
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    t.classList.remove('show')
    setTimeout(() => (t.hidden = true), 220)
  }, 1600)
}

function setupDivider(divider: HTMLElement, leftPane: HTMLElement, onResize: () => void): void {
  let dragging = false
  divider.addEventListener('mousedown', (e) => {
    e.preventDefault()
    dragging = true
    document.body.style.userSelect = 'none'
  })
  window.addEventListener('mouseup', () => {
    if (!dragging) return
    dragging = false
    document.body.style.userSelect = ''
    onResize()
  })
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return
    const pct = Math.min(0.6, Math.max(0.2, e.clientX / window.innerWidth))
    leftPane.style.flex = `0 0 ${pct * 100}%`
  })
}

boot().catch((err) => {
  document.body.innerHTML = `<pre style="padding:16px;color:#f06576">Failed to start: ${String(err)}</pre>`
})
