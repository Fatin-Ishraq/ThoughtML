import './styles.css'
import { initParser, parseProject } from './parse'
import { parseTime, type ParseResult, type Diagnostic, type Conflict } from './model'
import { createEditor } from './editor'
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
  addImport,
  diagnosticFile,
  findSourceOrigin,
  importsOf,
  projectSources,
  validFileName,
  type WorkspaceState,
} from './workspace'

const LS = { src: 'thoughtml:src', project: 'thoughtml:project:v1', theme: 'thoughtml:theme', view: 'thoughtml:view' }

function el<T extends HTMLElement = HTMLElement>(sel: string): T {
  const node = document.querySelector(sel)
  if (!node) throw new Error(`missing element: ${sel}`)
  return node as T
}

function workspaceFromSeed(seed: WorkspaceSeed): WorkspaceState {
  return { entry: seed.entry, active: seed.entry, files: { ...seed.files } }
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
  return { entry, active: entry, files }
}

function loadWorkspace(): WorkspaceState {
  const stored = localStorage.getItem(LS.project)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as WorkspaceState
      const files = Object.fromEntries(
        Object.entries(parsed.files ?? {}).filter(([name, source]) => validFileName(name) && typeof source === 'string'),
      )
      if (Object.keys(files).length && parsed.entry in files) {
        return { entry: parsed.entry, active: parsed.active in files ? parsed.active : parsed.entry, files }
      }
    } catch { /* migrate the older single-source storage below */ }
  }
  const legacy = localStorage.getItem(LS.src)
  if (legacy) return { entry: 'untitled.thml', active: 'untitled.thml', files: { 'untitled.thml': legacy } }
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

  await initParser()

  const graph = createGraph(el('#graph'), theme)
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

  const editor = createEditor(el('#editor'), initialSrc, scheduleRun, theme)

  // ---- project workspace ----
  const workspaceEntry = el('#workspace-entry')
  const projectFilesEl = el('#project-files')
  const fileTabsEl = el('#file-tabs')
  const projectFileCount = el('#project-file-count')

  function fileDiagnostics(file: string): Diagnostic[] {
    return last?.diagnostics.items.filter((diag) => diagnosticFile(diag, workspace) === file) ?? []
  }

  function renderWorkspace(): void {
    const files = Object.keys(workspace.files).sort((a, b) => {
      if (a === workspace.entry) return -1
      if (b === workspace.entry) return 1
      return a.localeCompare(b)
    })
    workspaceEntry.textContent = workspace.entry
    workspaceEntry.title = `Entry file: ${workspace.entry}`
    projectFileCount.textContent = String(files.length)
    projectFilesEl.replaceChildren(...files.map((file) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'project-file'
      button.classList.toggle('active', file === workspace.active)
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
    fileTabsEl.replaceChildren(...files.map((file) => {
      const tab = document.createElement('button')
      tab.type = 'button'
      tab.className = 'file-tab'
      tab.classList.toggle('active', file === workspace.active)
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-selected', String(file === workspace.active))
      tab.textContent = file
      tab.title = file
      tab.addEventListener('click', () => switchFile(file))
      return tab
    }))
  }

  function syncActiveDiagnostics(): void {
    editor.setDiagnostics(fileDiagnostics(workspace.active))
  }

  function switchFile(file: string, line?: number): void {
    if (!(file in workspace.files)) return
    workspace.active = file
    persistWorkspace(workspace)
    editor.setValue(workspace.files[file])
    renderWorkspace()
    syncActiveDiagnostics()
    if (line) window.setTimeout(() => editor.gotoLine(line), 0)
  }

  function loadProject(next: WorkspaceState, message: string): void {
    workspace = next
    persistWorkspace(workspace)
    editor.setValue(workspace.files[workspace.active])
    pills.forEach((pill) => pill.classList.remove('active'))
    renderWorkspace()
    runProject()
    toast(message)
  }

  el('#snake-project').addEventListener('click', () => loadProject(workspaceFromSeed(SNAKE_PROJECT), 'Loaded the six-file Snake project'))
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
    if (!validFileName(file)) { toast('Use a lowercase kebab-case .thml filename'); return }
    if (file in workspace.files) { switchFile(file); toast(`${file} already exists`); return }
    workspace.files[file] = `# ${file.slice(0, -5)}\n\n`
    if (file !== workspace.entry) workspace.files[workspace.entry] = addImport(workspace.files[workspace.entry], file)
    workspace.active = file
    persistWorkspace(workspace)
    editor.setValue(workspace.files[file])
    renderWorkspace()
    runProject()
    toast(`Created and imported ${file}`)
  })

  const fileInput = el<HTMLInputElement>('#project-file-input')
  el('#open-project').addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', async () => {
    const selected = [...(fileInput.files ?? [])]
    const entries = await Promise.all(selected.map(async (file) => [file.name.toLowerCase(), await file.text()] as const))
    const files = Object.fromEntries(entries.filter(([name]) => validFileName(name)))
    const names = Object.keys(files).sort()
    if (!names.length) { toast('Choose one or more .thml files'); return }
    const entry = names.includes('project.thml') ? 'project.thml' : names[0]
    loadProject({ entry, active: entry, files }, `Opened ${names.length} ThoughtML file${names.length === 1 ? '' : 's'}`)
    fileInput.value = ''
  })

  el('#download-file').addEventListener('click', () => {
    const file = workspace.active
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([workspace.files[file]], { type: 'text/plain;charset=utf-8' }))
    link.download = file
    link.click()
    URL.revokeObjectURL(link.href)
    toast(`Downloaded ${file}`)
  })

  // ---- examples ----
  const examplesEl = el('#examples')
  const pills: HTMLButtonElement[] = []
  for (const name of Object.keys(EXAMPLES)) {
    if (ADVANCED_EXAMPLES.has(name)) continue // parked from the tray (still imported/loadable)
    const b = document.createElement('button')
    b.className = 'pill'
    b.textContent = name
    b.addEventListener('click', () => {
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
    const origin = findSourceOrigin(id, workspace)
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
  // Always compile the entry document against every sibling file in the current
  // workspace. Editing an imported tab therefore updates one unified graph.
  function runProject(): void {
    let res: ParseResult
    try {
      res = parseProject(workspace.files[workspace.entry], projectSources(workspace))
    } catch (err) {
      toast(`Parser error: ${String(err)}`)
      return
    }
    baseline = res
    persistWorkspace(workspace)
    applyView()
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
        const origin = findSourceOrigin(selectedId, workspace)
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
  function scheduleRun(src: string): void {
    workspace.files[workspace.active] = src
    persistWorkspace(workspace)
    if (timer) clearTimeout(timer)
    timer = window.setTimeout(runProject, 200)
  }

  // ---- keyboard ----
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (drawer.classList.contains('open')) drawer.classList.remove('open')
      else if (!detailPane.classList.contains('collapsed')) closeDetail()
    }
  })

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
