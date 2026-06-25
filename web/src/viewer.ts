// Standalone, read-only ThoughtML viewer — the document's *view*, detached from
// the playground. It renders a canonical model baked into the page (no wasm, no
// editor, no parsing) using the shared time-driven reasoning renderer: the same
// view the playground shows under "Viewer". The model is read from a
// `<script type="application/json" id="thoughtml-model">` tag, which
// `thml <doc>.thml --compute --html` fills; in dev it falls back to a fetch.

import './styles.css'
import { createTimeView } from './timeview'
import { buildLegend } from './legend'
import { renderDetail, kindOf, labelOf } from './detail'
import { setIcon, glyph } from './icons'
import type { Canonical } from './model'
import type { Theme } from './graph'

const LS = { theme: 'thoughtml:theme' }

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
    const safe = which && /^[a-z0-9-]+$/i.test(which) ? which : null
    const file = safe ? `/dev-model-${safe}.json` : '/dev-model.json'
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
  const scopes = canon.objects.filter((o) => o.type === 'scope')
  if (!scopes.length) return 'viewer'
  const included = new Set<string>()
  for (const o of canon.objects) if (o.type === 'scope') o.includes?.forEach((m) => included.add(m))
  const roots = scopes.filter((s) => !included.has(s.id))
  // prefer a non-imported root scope (imported ids carry an alias prefix, e.g. `base.`)
  const primary = roots.find((s) => !s.id.includes('.')) ?? roots[0] ?? scopes[0]
  return primary.id
}

async function boot(): Promise<void> {
  let theme: Theme = localStorage.getItem(LS.theme) === 'light' ? 'light' : 'dark'
  document.body.dataset.theme = theme

  setIcon(el('#theme'), theme === 'dark' ? 'moon' : 'sun')
  setIcon(el('#fit'), 'fit')
  setIcon(el('#legend-toggle'), 'legend')
  setIcon(el('#detail-close'), 'close')
  setIcon(el('#zoom-in'), 'plus')
  setIcon(el('#zoom-out'), 'minus')

  const canon = await loadModel()
  if (!canon || canon.objects.length === 0) {
    el('#empty-state').hidden = false
    return
  }

  // prefer the title baked by the CLI (the source file name); fall back to the
  // document's root scope when developing against a dev fixture.
  const bakedTitle = document.getElementById('thoughtml-title')?.textContent?.trim()
  const title = bakedTitle || docTitle(canon)
  el('#doc-title').textContent = title
  document.title = `${title} — ThoughtML`

  const view = createTimeView(el('#graph'), theme, { embedded: false })

  // ---- legend ----
  buildLegend(el('#legend'), theme)
  el('#legend-toggle').addEventListener('click', () => { el('#legend').hidden = !el('#legend').hidden })

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
    view.select(id)
    window.setTimeout(() => view.centerOn(id), 60)
  }
  function closeDetail() {
    selectedId = null
    detailPane.classList.add('collapsed')
    view.select(null)
  }
  function navigateTo(id: string) { showDetail(id) }

  view.onSelect((info) => { if (info) showDetail(info.id); else closeDetail() })
  el('#detail-close').addEventListener('click', closeDetail)

  // ---- controls + zoom ----
  el('#fit').addEventListener('click', () => view.fit())
  el('#zoom-in').addEventListener('click', () => view.zoomIn())
  el('#zoom-out').addEventListener('click', () => view.zoomOut())
  el('#zoom-pct').addEventListener('click', () => view.zoomReset())
  view.onZoom((pct) => { el('#zoom-pct').textContent = `${pct}%` })

  // ---- theme ----
  el('#theme').addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(LS.theme, theme)
    document.body.dataset.theme = theme
    setIcon(el('#theme'), theme === 'dark' ? 'moon' : 'sun')
    view.setTheme(theme)
    buildLegend(el('#legend'), theme)
  })

  // ---- keyboard ----
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !detailPane.classList.contains('collapsed')) closeDetail()
  })
  window.addEventListener('resize', () => view.fit())

  // ---- render ----
  view.render(canon)
  void selectedId
}

boot().catch((err) => {
  document.body.innerHTML = `<pre style="padding:16px;color:#f06576">Failed to start: ${String(err)}</pre>`
})
