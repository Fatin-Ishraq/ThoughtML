// Standalone, read-only ThoughtML viewer — the document's *view*, detached from
// the playground. It renders a canonical model baked into the page (no wasm, no
// editor, no parsing): pan/zoom, hover spotlight, click-for-detail, the lenses,
// and the as-of timeline all operate on already-derived data. The model is read
// from a `<script type="application/json" id="thoughtml-model">` tag, which
// `thml <doc>.thml --compute --html` fills; in dev it falls back to a fetch.

import './styles.css'
import { createGraph, type ViewMode, type Theme } from './graph'
import { buildLegend, buildLensKey } from './legend'
import { renderDetail, kindOf, labelOf } from './detail'
import { setIcon, glyph } from './icons'
import type { Canonical } from './model'

const LS = { theme: 'thoughtml:theme', view: 'thoughtml:view' }

function el<T extends HTMLElement = HTMLElement>(sel: string): T {
  const node = document.querySelector(sel)
  if (!node) throw new Error(`missing element: ${sel}`)
  return node as T
}

/** Read the baked canonical model from the page, accepting either a bare
 *  `Canonical` ({objects,…}) or a full parse result ({canonical,…}). */
function parseModel(raw: string): Canonical | null {
  try {
    const data = JSON.parse(raw)
    const canon = data && typeof data === 'object' && 'canonical' in data ? data.canonical : data
    return canon && Array.isArray(canon.objects) ? (canon as Canonical) : null
  } catch {
    return null
  }
}

/** Load the model: the inline script tag if filled, else (dev only) a fetch of
 *  the dev fixture so the viewer can be developed without a bake step. */
async function loadModel(): Promise<Canonical | null> {
  const inline = document.getElementById('thoughtml-model')?.textContent?.trim()
  if (inline) return parseModel(inline)
  if (import.meta.env.DEV) {
    const which = new URLSearchParams(location.search).get('dev')
    const file = which === 'grand' ? '/dev-model-grand.json' : '/dev-model.json'
    try {
      const res = await fetch(file)
      return parseModel(await res.text())
    } catch {
      return null
    }
  }
  return null
}

/** The document's display title: its first scope's id, falling back to "viewer". */
function docTitle(canon: Canonical): string {
  const scope = canon.objects.find((o) => o.type === 'scope')
  return scope ? scope.id : 'viewer'
}

async function boot(): Promise<void> {
  let theme: Theme = localStorage.getItem(LS.theme) === 'light' ? 'light' : 'dark'
  let mode: ViewMode = localStorage.getItem(LS.view) === 'structural' ? 'structural' : 'readable'
  document.body.dataset.theme = theme

  setIcon(el('#theme'), theme === 'dark' ? 'moon' : 'sun')
  setIcon(el('#fit'), 'fit')
  setIcon(el('#relayout'), 'relayout')
  setIcon(el('#legend-toggle'), 'legend')
  setIcon(el('#detail-close'), 'close')
  setIcon(el('#zoom-in'), 'plus')
  setIcon(el('#zoom-out'), 'minus')

  const graph = createGraph(el('#graph'), theme)
  const canon = await loadModel()

  if (!canon || canon.objects.length === 0) {
    el('#empty-state').hidden = false
    return
  }

  el('#doc-title').textContent = docTitle(canon)
  document.title = `${docTitle(canon)} — ThoughtML`

  // ---- legend ----
  buildLegend(el('#legend'), theme)
  el('#legend-toggle').addEventListener('click', () => { el('#legend').hidden = !el('#legend').hidden })

  // ---- lens ----
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

  // ---- detail panel ----
  const detailPane = el('#detail')
  const detailBody = el('#detail-body')
  const detailBadge = el('#detail-badge')
  const detailId = el('#detail-id')
  let selectedId: string | null = null

  function showDetail(id: string) {
    selectedId = id
    detailPane.classList.remove('collapsed')
    const kind = kindOf(canon!, id)
    const obj = canon!.objects.find((o) => o.id === id)
    const gname = obj?.type === 'focus' ? obj.kind : obj?.type === 'stance' ? obj.posture : ''
    detailBadge.className = `detail-badge k-${kind}`
    detailBadge.innerHTML = `${gname ? glyph(gname) : ''}<span>${kind}</span>`
    detailId.textContent = labelOf(id)
    renderDetail(detailBody, canon!, id, navigateTo)
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

  // ---- view toggle ----
  const viewBtns = Array.from(el('#view').querySelectorAll<HTMLButtonElement>('button'))
  viewBtns.forEach((b) => b.classList.toggle('active', b.dataset.view === mode))
  for (const btn of viewBtns) {
    btn.addEventListener('click', () => {
      mode = btn.dataset.view as ViewMode
      localStorage.setItem(LS.view, mode)
      viewBtns.forEach((b) => b.classList.toggle('active', b === btn))
      graph.render(canon!, mode, true)
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

  // ---- as-of timeline ----
  const timelineEl = el('#timeline')
  const slider = el<HTMLInputElement>('#time-slider')
  const timeDate = el('#time-date')
  const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  function applyTime(ms: number): void {
    graph.applyAsOf(ms)
    timeDate.textContent = fmtDate(ms)
  }
  slider.addEventListener('input', () => applyTime(Number(slider.value)))

  function syncTimeline(c: Canonical): void {
    const parse = (s: string | undefined) => (s ? Date.parse(s) : NaN)
    const start = parse(c.timeline?.start)
    const end = parse(c.timeline?.end)
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      timelineEl.hidden = true
      graph.applyAsOf(null)
      return
    }
    timelineEl.hidden = false
    slider.min = String(start)
    slider.max = String(end)
    slider.step = String(Math.max(1, Math.floor((end - start) / 240)))
    slider.value = String(end)
    applyTime(end)
  }

  // ---- theme ----
  el('#theme').addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(LS.theme, theme)
    document.body.dataset.theme = theme
    setIcon(el('#theme'), theme === 'dark' ? 'moon' : 'sun')
    graph.setTheme(theme)
    buildLegend(el('#legend'), theme)
  })

  // ---- keyboard ----
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !detailPane.classList.contains('collapsed')) closeDetail()
  })
  window.addEventListener('resize', () => graph.resize())

  // ---- render ----
  graph.render(canon, mode)
  syncTimeline(canon)
  el('#zoom-pct').textContent = `${Math.round(graph.cy.zoom() * 100)}%`
}

boot().catch((err) => {
  document.body.innerHTML = `<pre style="padding:16px;color:#f06576">Failed to start: ${String(err)}</pre>`
})
