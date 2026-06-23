import './styles.css'
import { initParser, parseProject, parseWhatIf } from './parse'
import { parseTime, type ParseResult, type Diagnostic, type Conflict, type Overrides } from './model'
import { createEditor } from './editor'
import { createGraph, type ViewMode, type Theme } from './graph'
import { buildLegend, buildLensKey } from './legend'
import { renderDiagnostics } from './diagnostics'
import { renderDetail, kindOf, labelOf, type WhatIfCtx } from './detail'
import { EXAMPLES, DEFAULT_EXAMPLE, ADVANCED_EXAMPLES } from './examples'
import { setIcon, glyph } from './icons'

const LS = { src: 'thoughtml:src', theme: 'thoughtml:theme', view: 'thoughtml:view' }

function el<T extends HTMLElement = HTMLElement>(sel: string): T {
  const node = document.querySelector(sel)
  if (!node) throw new Error(`missing element: ${sel}`)
  return node as T
}

async function boot(): Promise<void> {
  let theme: Theme = localStorage.getItem(LS.theme) === 'light' ? 'light' : 'dark'
  let mode: ViewMode = localStorage.getItem(LS.view) === 'structural' ? 'structural' : 'readable'
  const initialSrc = localStorage.getItem(LS.src) ?? EXAMPLES[DEFAULT_EXAMPLE]
  document.body.dataset.theme = theme

  // icons
  setIcon(el('#theme'), theme === 'dark' ? 'moon' : 'sun')
  setIcon(el('#fit'), 'fit')
  setIcon(el('#relayout'), 'relayout')
  setIcon(el('#legend-toggle'), 'legend')
  setIcon(el('#data-toggle'), 'braces')
  setIcon(el('#copy-data'), 'copy')
  setIcon(el('#drawer-close'), 'close')
  setIcon(el('#detail-close'), 'close')
  setIcon(el('#zoom-in'), 'plus')
  setIcon(el('#zoom-out'), 'minus')

  await initParser()

  const graph = createGraph(el('#graph'), theme)
  // `baseline` is the unperturbed parse; `last` is what the UI shows — equal to
  // baseline until the user mutes nodes/links for a what-if (Phase 6), at which
  // point `last` is the recomputed counterfactual and `muted` names what's off.
  let baseline: ParseResult | null = null
  let last: ParseResult | null = null
  let currentSrc = ''
  const muted = new Set<string>()
  let whatIfMode = false
  let selectedId: string | null = null

  const editor = createEditor(el('#editor'), initialSrc, scheduleRun, theme)

  // ---- examples ----
  const examplesEl = el('#examples')
  const pills: HTMLButtonElement[] = []
  for (const name of Object.keys(EXAMPLES)) {
    if (ADVANCED_EXAMPLES.has(name)) continue // parked from the tray (still imported/loadable)
    const b = document.createElement('button')
    b.className = 'pill'
    b.textContent = name
    b.addEventListener('click', () => {
      editor.setValue(EXAMPLES[name])
      pills.forEach((p) => p.classList.toggle('active', p === b))
    })
    pills.push(b)
    examplesEl.appendChild(b)
    if (EXAMPLES[name] === initialSrc) b.classList.add('active')
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
    renderDetail(detailBody, last.canonical, id, navigateTo, whatIfCtx())
    graph.select(id)
    window.setTimeout(() => { graph.resize(); graph.centerOn(id) }, 230)
  }
  function closeDetail() {
    selectedId = null
    detailPane.classList.add('collapsed')
    graph.cy.elements().unselect()
    window.setTimeout(() => graph.resize(), 230)
  }
  function navigateTo(id: string) { showDetail(id) }

  graph.onSelect((info) => { if (info) showDetail(info.id); else closeDetail() })
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

  // ---- view toggle ----
  const viewBtns = Array.from(el('#view').querySelectorAll<HTMLButtonElement>('button'))
  viewBtns.forEach((b) => b.classList.toggle('active', b.dataset.view === mode))
  for (const btn of viewBtns) {
    btn.addEventListener('click', () => {
      mode = btn.dataset.view as ViewMode
      localStorage.setItem(LS.view, mode)
      viewBtns.forEach((b) => b.classList.toggle('active', b === btn))
      if (last) graph.render(last.canonical, mode, true)
      if (selectedId) graph.select(selectedId)
    })
  }

  // ---- graph controls + zoom ----
  el('#fit').addEventListener('click', () => graph.fit())
  el('#relayout').addEventListener('click', () => graph.relayout())
  el('#zoom-in').addEventListener('click', () => graph.zoomIn())
  el('#zoom-out').addEventListener('click', () => graph.zoomOut())
  el('#zoom-pct').addEventListener('click', () => graph.zoomReset())
  graph.onZoom((pct) => { el('#zoom-pct').textContent = `${pct}%` })

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
    editor.setTheme(theme)
    buildLegend(el('#legend'), theme)
  })

  // ---- what-if (Phase 6) ----
  // Muting drops a node/link from the evidence + attack graphs and re-derives the
  // counterfactual via the same wasm engine; `last` becomes that recomputed view.
  function whatIfCtx(): WhatIfCtx {
    return { enabled: whatIfMode, muted, baseline: (baseline ?? last)!.canonical, active: muted.size > 0, onToggle: toggleMute }
  }
  function buildOverrides(): Overrides {
    const links: string[] = []
    const nodes: string[] = []
    const objs = baseline?.canonical.objects ?? []
    muted.forEach((id) => {
      const o = objs.find((x) => x.id === id)
      if (o?.type === 'link') links.push(id)
      else nodes.push(id)
    })
    return { disabled_links: links, disabled_nodes: nodes }
  }
  function toggleMute(id: string): void {
    if (muted.has(id)) muted.delete(id)
    else muted.add(id)
    applyView()
  }
  function resetWhatIf(): void {
    if (muted.size === 0) return
    muted.clear()
    applyView()
  }
  function updateWhatIfBanner(): void {
    el('#whatif-banner').hidden = !whatIfMode
    el('#whatif-count').textContent = muted.size > 0 ? `${muted.size} muted` : 'select a node, then Mute'
  }
  const whatifBtn = el<HTMLButtonElement>('#whatif')
  whatifBtn.addEventListener('click', () => {
    whatIfMode = !whatIfMode
    whatifBtn.classList.toggle('active', whatIfMode)
    if (!whatIfMode) muted.clear()
    applyView()
  })
  el('#whatif-reset').addEventListener('click', resetWhatIf)

  // ---- pipeline ----
  // `run` parses the source into the baseline; `applyView` renders either the
  // baseline or the what-if counterfactual, and is also called on every mute.
  function run(src: string): void {
    let res: ParseResult
    try {
      // Resolve any `import`s (§12.5) against the bundled examples, so a document
      // can pull in another by name. A doc with no imports parses unchanged.
      res = parseProject(src, EXAMPLES)
    } catch (err) {
      toast(`Parser error: ${String(err)}`)
      return
    }
    baseline = res
    currentSrc = src
    localStorage.setItem(LS.src, src)
    // Drop any muted ids the edit removed, so a stale id can't perturb the graph.
    for (const id of [...muted]) if (!res.canonical.objects.some((o) => o.id === id)) muted.delete(id)
    applyView()
  }

  function safeWhatIf(): ParseResult {
    try {
      return parseWhatIf(currentSrc, buildOverrides())
    } catch (err) {
      toast(`What-if error: ${String(err)}`)
      return baseline!
    }
  }

  function applyView(): void {
    if (!baseline) return
    last = muted.size === 0 ? baseline : safeWhatIf()
    const canon = last.canonical
    el('#empty-state').hidden = canon.objects.length > 0
    graph.render(canon, mode)
    graph.setMuted(muted)
    syncTimeline(last)
    setDiagStatus(last.diagnostics.items, canon.audit?.conflicts ?? [])
    renderDiagnostics(el('#diagnostics'), last.diagnostics.items, canon.audit?.conflicts ?? [], (line) => editor.gotoLine(line))
    editor.setDiagnostics(last.diagnostics.items)
    el('#json').textContent = JSON.stringify(canon, null, 2)
    el('#ast').textContent = JSON.stringify(last.surface, null, 2)
    updateWhatIfBanner()

    // keep detail panel in sync with the latest view
    if (selectedId) {
      const stillThere = selectedId.startsWith('agent:')
        ? canon.objects.some((o) => o.type === 'stance' && o.agent === selectedId!.slice(6))
        : canon.objects.some((o) => o.id === selectedId)
      if (stillThere) {
        renderDetail(detailBody, canon, selectedId, navigateTo, whatIfCtx())
        graph.select(selectedId)
      } else {
        closeDetail()
      }
    }
    el('#zoom-pct').textContent = `${Math.round(graph.cy.zoom() * 100)}%`
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
    if (timer) clearTimeout(timer)
    timer = window.setTimeout(() => run(src), 200)
  }

  // ---- keyboard ----
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (drawer.classList.contains('open')) drawer.classList.remove('open')
      else if (!detailPane.classList.contains('collapsed')) closeDetail()
    }
  })

  // ---- divider + resize ----
  setupDivider(el('#divider'), el('.editor-pane'), () => graph.resize())
  window.addEventListener('resize', () => graph.resize())

  run(editor.getValue())

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
