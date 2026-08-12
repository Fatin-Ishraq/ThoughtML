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
import type { Canonical, Diagnostic } from './model'
import type { Theme } from './graph'

const LS = { theme: 'thoughtml:theme' }

interface StreamConfig { snapshot: string; events: string }
interface StreamActivity { sequence: number; at_ms: number; kind: string; summary: string; detail?: string }
interface StreamSnapshot {
  schema_version: number
  sequence: number
  title: string
  source_state: 'valid' | 'invalid'
  showing_last_valid: boolean
  updated_at_ms: number
  canonical: Canonical | null
  diagnostics: Diagnostic[]
  watched_files: string[]
  activity: StreamActivity[]
}

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

function streamConfig(): StreamConfig | null {
  const raw = document.getElementById('thoughtml-stream-config')?.textContent?.trim()
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    return typeof value?.snapshot === 'string' && typeof value?.events === 'string' ? value as StreamConfig : null
  } catch {
    return null
  }
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

  const live = streamConfig()
  let canon = await loadModel()

  // prefer the title baked by the CLI (the source file name); fall back to the
  // document's root scope when developing against a dev fixture.
  const bakedTitle = document.getElementById('thoughtml-title')?.textContent?.trim()
  const title = bakedTitle || (canon ? docTitle(canon) : 'viewer')
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

  function showDetail(id: string, syncView = true) {
    if (!canon) return
    selectedId = id
    detailPane.classList.remove('collapsed')
    const kind = kindOf(canon, id)
    const obj = canon.objects.find((o) => o.id === id)
    const gname = obj?.type === 'focus' ? obj.kind : obj?.type === 'stance' ? obj.posture : ''
    detailBadge.className = `detail-badge k-${kind}`
    detailBadge.innerHTML = `${gname ? glyph(gname) : ''}<span>${kind}</span>`
    detailId.textContent = labelOf(id)
    renderDetail(detailBody, canon, id, navigateTo)
    if (syncView) {
      view.select(id)
      window.setTimeout(() => view.centerOn(id), 60)
    }
  }
  function closeDetail(syncView = true) {
    selectedId = null
    detailPane.classList.add('collapsed')
    if (syncView) view.select(null)
  }
  function navigateTo(id: string) { showDetail(id) }

  view.onSelect((info) => { if (info) showDetail(info.id, false); else closeDetail(false) })
  el('#detail-close').addEventListener('click', () => closeDetail())

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

  // ---- initial render ----
  if (canon && canon.objects.length > 0) view.render(canon)
  else el('#empty-state').hidden = false

  // ---- optional live session ----
  if (live) {
    const status = el<HTMLButtonElement>('#stream-status')
    const statusText = el('#stream-status-text')
    const panel = el('#stream-panel')
    const closePanel = el<HTMLButtonElement>('#stream-panel-close')
    status.hidden = false
    let latestSequence = 0
    let latestSourceState: 'valid' | 'invalid' = 'valid'

    const openPanel = (open: boolean) => {
      panel.hidden = !open
      status.setAttribute('aria-expanded', String(open))
    }
    status.addEventListener('click', () => openPanel(panel.hidden))
    closePanel.addEventListener('click', () => openPanel(false))

    const connectionState = (state: 'online' | 'invalid' | 'offline') => {
      status.className = `stream-status ${state}`
      if (state === 'offline') statusText.textContent = 'Reconnecting'
    }

    const renderStreamPanel = (snapshot: StreamSnapshot) => {
      el('#stream-updated').textContent = `Revision ${snapshot.sequence} · ${new Date(snapshot.updated_at_ms).toLocaleTimeString()}`
      const files = el('#stream-files')
      files.replaceChildren(...snapshot.watched_files.map((name) => {
        const code = document.createElement('code'); code.textContent = name; return code
      }))

      const diagnosticsSection = el('#stream-diagnostics-section')
      const diagnostics = el('#stream-diagnostics')
      diagnosticsSection.hidden = snapshot.diagnostics.length === 0
      diagnostics.replaceChildren(...snapshot.diagnostics.map((diag) => {
        const row = document.createElement('div')
        row.className = `stream-diagnostic ${diag.severity}`
        const where = diag.line ? `line ${diag.line}` : diag.severity
        const label = document.createElement('span'); label.textContent = where
        const message = document.createElement('p'); message.textContent = diag.message
        row.append(label, message)
        return row
      }))

      const activity = el('#stream-activity')
      activity.replaceChildren(...[...snapshot.activity].reverse().map((item) => {
        const row = document.createElement(item.detail ? 'details' : 'div')
        row.className = `stream-activity-item ${item.kind}`
        const heading = document.createElement(item.detail ? 'summary' : 'div')
        const dot = document.createElement('i')
        const copy = document.createElement('span'); copy.textContent = item.summary
        const time = document.createElement('time'); time.textContent = new Date(item.at_ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        heading.append(dot, copy, time); row.append(heading)
        if (item.detail) {
          const pre = document.createElement('pre'); pre.textContent = item.detail; row.append(pre)
        }
        return row
      }))
    }

    const applySnapshot = (snapshot: StreamSnapshot) => {
      if (snapshot.schema_version !== 1 || snapshot.sequence <= latestSequence) return
      latestSequence = snapshot.sequence
      latestSourceState = snapshot.source_state
      statusText.textContent = snapshot.source_state === 'valid'
        ? `Live · revision ${snapshot.sequence}`
        : `Edit has errors · revision ${snapshot.sequence}`
      connectionState(snapshot.source_state === 'valid' ? 'online' : 'invalid')
      el('#doc-sub').textContent = snapshot.source_state === 'valid'
        ? `live reasoning · revision ${snapshot.sequence}`
        : snapshot.showing_last_valid ? 'latest edit has errors · showing last valid graph' : 'latest edit has errors'
      renderStreamPanel(snapshot)

      if (snapshot.canonical && snapshot.canonical.objects.length > 0) {
        const first = !canon || canon.objects.length === 0
        const graphChanged = snapshot.source_state === 'valid' && snapshot.activity.at(-1)?.kind !== 'unchanged'
        canon = snapshot.canonical
        el('#empty-state').hidden = true
        if (first) view.render(canon)
        else if (graphChanged) view.update(canon)
        if (selectedId && !canon.objects.some((o) => o.id === selectedId)) closeDetail()
        else if (selectedId) renderDetail(detailBody, canon, selectedId, navigateTo)
      } else if (!canon) {
        const empty = el('#empty-state')
        empty.textContent = 'Waiting for the first valid ThoughtML revision.'
        empty.hidden = false
      }
    }

    try {
      const response = await fetch(live.snapshot, { cache: 'no-store' })
      if (!response.ok) throw new Error(`snapshot request failed (${response.status})`)
      applySnapshot(await response.json() as StreamSnapshot)
    } catch {
      connectionState('offline')
    }

    const events = new EventSource(live.events)
    events.addEventListener('open', () => {
      if (status.classList.contains('offline')) connectionState(latestSourceState === 'valid' ? 'online' : 'invalid')
    })
    events.addEventListener('snapshot', (event) => {
      try { applySnapshot(JSON.parse((event as MessageEvent).data) as StreamSnapshot) } catch { /* wait for the next complete snapshot */ }
    })
    events.addEventListener('error', () => connectionState('offline'))
  }
}

boot().catch((err) => {
  document.body.innerHTML = `<pre style="padding:16px;color:#f06576">Failed to start: ${String(err)}</pre>`
})
