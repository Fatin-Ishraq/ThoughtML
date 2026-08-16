// Standalone, read-only ThoughtML viewer — the document's *view*, detached from
// the playground. It renders a canonical model baked into the page (no wasm, no
// editor, no parsing) using the shared time-driven reasoning renderer: the same
// view the playground shows under "Viewer". The model is read from a
// `<script type="application/json" id="thoughtml-model">` tag, which
// `thml <doc>.thml --compute --html` fills; in dev it falls back to a fetch.

import './styles.css'
import { createTimeView } from './timeview'
import { buildLegend } from './legend'
import { createReasoningCard } from './reasoning-card'
import { ReasoningExpansion } from './reasoning-expansion'
import { setIcon } from './icons'
import type { Canonical, Diagnostic, SourceMap } from './model'
import type { Theme } from './graph'

const LS = { theme: 'thoughtml:theme' }

interface StreamConfig { snapshot: string; events: string }
interface StreamChanges {
  added: string[]
  removed: string[]
  modified: string[]
  conflicts_appeared: number
  conflicts_resolved: number
  files: string[]
}
interface StreamActivity { sequence: number; at_ms: number; kind: string; summary: string; detail?: string; changes?: StreamChanges }
interface StreamSnapshot {
  schema_version: number
  sequence: number
  title: string
  source_state: 'valid' | 'invalid'
  showing_last_valid: boolean
  updated_at_ms: number
  canonical: Canonical | null
  source_map: SourceMap
  diagnostics: Diagnostic[]
  watched_files: string[]
  activity: StreamActivity[]
  connected_viewers: number
}

function el<T extends HTMLElement = HTMLElement>(sel: string): T {
  const node = document.querySelector(sel)
  if (!node) throw new Error(`missing element: ${sel}`)
  return node as T
}

/** Read the baked canonical model from the page, accepting either a bare
 *  `Canonical` ({objects,…}) or a full parse result ({canonical,…}). */
interface ViewerModel { canonical: Canonical; sourceMap: SourceMap }

function parseModel(raw: string): ViewerModel | null {
  try {
    const data = JSON.parse(raw)
    const canon = data && typeof data === 'object' && 'canonical' in data ? data.canonical : data
    if (!canon || !Array.isArray(canon.objects)) return null
    const sourceMap = data && typeof data === 'object' && data.source_map?.objects
      ? data.source_map as SourceMap
      : { objects: {} }
    return { canonical: canon as Canonical, sourceMap }
  } catch {
    return null
  }
}

/** Load the model: the inline script tag if filled, else (dev only) a fetch of
 *  the dev fixture so the viewer can be developed without a bake step. */
async function loadModel(): Promise<ViewerModel | null> {
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
  const pristineHtml = `<!doctype html>\n${document.documentElement.outerHTML}`
  let theme: Theme = localStorage.getItem(LS.theme) === 'light' ? 'light' : 'dark'
  document.body.dataset.theme = theme

  setIcon(el('#theme'), theme === 'dark' ? 'moon' : 'sun')
  setIcon(el('#fit'), 'fit')
  setIcon(el('#legend-toggle'), 'legend')
  setIcon(el('#zoom-in'), 'plus')
  setIcon(el('#zoom-out'), 'minus')

  const live = streamConfig()
  const initialModel = await loadModel()
  let canon = initialModel?.canonical ?? null
  let sourceMap: SourceMap = initialModel?.sourceMap ?? { objects: {} }

  // prefer the title baked by the CLI (the source file name); fall back to the
  // document's root scope when developing against a dev fixture.
  const bakedTitle = document.getElementById('thoughtml-title')?.textContent?.trim()
  const title = bakedTitle || (canon ? docTitle(canon) : 'viewer')
  el('#doc-title').textContent = title
  document.title = `${title} — ThoughtML`

  const view = createTimeView(el('#graph'), theme, { embedded: false })
  const reasoningExpansion = new ReasoningExpansion()
  if (canon) reasoningExpansion.update(canon, sourceMap)
  const visibleCanonical = () => canon ? reasoningExpansion.project(canon) : null

  // ---- legend ----
  buildLegend(el('#legend'), theme)
  el('#legend-toggle').addEventListener('click', () => { el('#legend').hidden = !el('#legend').hidden })

  // ---- universal Reasoning Card: standalone, stream, and Follow ----
  let selectedId: string | null = null
  const reasoningCard = createReasoningCard(el('.graph-pane'), {
    sourceFor: (id) => {
      const origin = sourceMap.objects[id]
      return origin ? { label: `${origin.source}:${origin.line}` } : undefined
    },
    expansionFor: (id) => reasoningExpansion.info(id),
    onToggleExpansion: (id) => {
      if (!canon || (!reasoningExpansion.toggle(id) && !reasoningExpansion.info(id))) return
      view.update(reasoningExpansion.project(canon))
      view.setReasoningExpansions(reasoningExpansion.markers())
      view.select(id)
      window.setTimeout(() => view.centerOn(id), 60)
    },
    onNavigate: (id) => showDetail(id),
    onClose: (cardMode) => {
      selectedId = null
      if (cardMode === 'follow') view.setFollow(false)
      view.select(null)
    },
  })

  function showDetail(id: string, syncView = true, anchorX?: number) {
    if (!canon) return
    view.setFollow(false)
    selectedId = id
    reasoningCard.showNode(canon, id, anchorX)
    if (syncView) {
      view.select(id)
      window.setTimeout(() => view.centerOn(id), 60)
    }
  }
  function closeDetail(syncView = true) {
    selectedId = null
    reasoningCard.close(false)
    if (syncView) view.select(null)
  }

  view.onSelect((info) => { if (info) showDetail(info.id, false, info.x); else if (reasoningCard.mode() !== 'follow') closeDetail(false) })
  view.onFollow((moment) => {
    if (!moment || !canon) {
      if (reasoningCard.mode() === 'follow') reasoningCard.close(false)
      return
    }
    if (selectedId) { selectedId = null; view.select(null) }
    reasoningCard.showMoment(canon, moment)
  })

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
    if (e.key === 'Escape' && reasoningCard.isOpen()) closeDetail()
  })
  window.addEventListener('resize', () => view.fit())

  // ---- initial render ----
  if (canon && canon.objects.length > 0) {
    view.render(visibleCanonical()!)
    view.setReasoningExpansions(reasoningExpansion.markers())
  }
  else el('#empty-state').hidden = false

  // ---- optional live session ----
  if (live) {
    const status = el<HTMLButtonElement>('#stream-status')
    const statusText = el('#stream-status-text')
    const panel = el('#stream-panel')
    const closePanel = el<HTMLButtonElement>('#stream-panel-close')
    const download = el<HTMLButtonElement>('#stream-download')
    status.hidden = false
    let latestSequence = 0
    let latestSourceState: 'valid' | 'invalid' = 'valid'
    let latestSnapshot: StreamSnapshot | null = null

    const openPanel = (open: boolean) => {
      panel.hidden = !open
      status.setAttribute('aria-expanded', String(open))
    }
    status.addEventListener('click', () => openPanel(panel.hidden))
    closePanel.addEventListener('click', () => openPanel(false))

    download.addEventListener('click', () => {
      if (!latestSnapshot?.canonical) return
      const graphRevision = [...latestSnapshot.activity]
        .reverse()
        .find((item) => item.kind === 'revision' || item.kind === 'started')
        ?.sequence ?? latestSnapshot.sequence
      const snapshotTitle = `${title}-revision-${graphRevision}`
      const parsed = new DOMParser().parseFromString(pristineHtml, 'text/html')
      const model = parsed.querySelector('#thoughtml-model')
      const bakedTitle = parsed.querySelector('#thoughtml-title')
      const stream = parsed.querySelector('#thoughtml-stream-config')
      if (!model || !bakedTitle || !stream) return
      // Same escaping as the CLI: `outerHTML` serializes script content raw, so
      // the payload must not be able to reach the tokenizer at all.
      model.textContent = JSON.stringify({
        canonical: latestSnapshot.canonical,
        source_map: latestSnapshot.source_map,
      }).replace(/[<>&\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
      bakedTitle.textContent = snapshotTitle
      stream.textContent = ''
      const html = `<!doctype html>\n${parsed.documentElement.outerHTML}`
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${snapshotTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'thoughtml-snapshot'}.html`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    })

    let ended = false
    const connectionState = (state: 'online' | 'invalid' | 'offline' | 'ended') => {
      status.className = `stream-status ${state}`
      if (state === 'offline') statusText.textContent = 'Reconnecting'
      if (state === 'ended') statusText.textContent = 'Session ended'
    }

    const renderStreamPanel = (snapshot: StreamSnapshot) => {
      const viewers = `${snapshot.connected_viewers} viewer${snapshot.connected_viewers === 1 ? '' : 's'}`
      el('#stream-updated').textContent = `Revision ${snapshot.sequence} · ${viewers} · ${new Date(snapshot.updated_at_ms).toLocaleTimeString()}`
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
        const where = [diag.source, diag.line ? `line ${diag.line}` : null].filter(Boolean).join(':') || diag.severity
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
      if (snapshot.schema_version !== 1 || snapshot.sequence < latestSequence) return
      if (snapshot.sequence === latestSequence) {
        if (latestSnapshot && snapshot.connected_viewers !== latestSnapshot.connected_viewers) {
          latestSnapshot.connected_viewers = snapshot.connected_viewers
          renderStreamPanel(latestSnapshot)
        }
        return
      }
      latestSequence = snapshot.sequence
      latestSourceState = snapshot.source_state
      latestSnapshot = snapshot
      download.disabled = !snapshot.canonical
      const latest = snapshot.activity.at(-1)
      statusText.textContent = snapshot.source_state === 'valid'
        ? latest?.kind === 'revision' ? `Live · ${latest.summary}` : `Live · revision ${snapshot.sequence}`
        : `Edit has errors · revision ${snapshot.sequence}`
      connectionState(snapshot.source_state === 'valid' ? 'online' : 'invalid')
      el('#doc-sub').textContent = snapshot.source_state === 'valid'
        ? `live reasoning · revision ${snapshot.sequence}`
        : snapshot.showing_last_valid ? 'latest edit has errors · showing last valid graph' : 'latest edit has errors'
      renderStreamPanel(snapshot)

      if (snapshot.canonical && snapshot.canonical.objects.length > 0) {
        const first = !canon || canon.objects.length === 0
        const graphChanged = snapshot.source_state === 'valid' && latest?.kind !== 'unchanged'
        canon = snapshot.canonical
        sourceMap = snapshot.source_map ?? { objects: {} }
        reasoningExpansion.update(canon, sourceMap)
        const projected = reasoningExpansion.project(canon)
        el('#empty-state').hidden = true
        if (first) view.render(projected)
        else if (graphChanged) view.update(projected, latest?.changes)
        view.setReasoningExpansions(reasoningExpansion.markers())
        if (selectedId && !canon.objects.some((o) => o.id === selectedId)) closeDetail()
        else if (selectedId || reasoningCard.mode() === 'follow') reasoningCard.refresh(canon)
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
      if (!ended && status.classList.contains('offline')) connectionState(latestSourceState === 'valid' ? 'online' : 'invalid')
    })
    events.addEventListener('snapshot', (event) => {
      try { applySnapshot(JSON.parse((event as MessageEvent).data) as StreamSnapshot) } catch { /* wait for the next complete snapshot */ }
    })
    events.addEventListener('presence', (event) => {
      try {
        const presence = JSON.parse((event as MessageEvent).data) as { connected_viewers?: number }
        if (latestSnapshot && typeof presence.connected_viewers === 'number') {
          latestSnapshot.connected_viewers = presence.connected_viewers
          renderStreamPanel(latestSnapshot)
        }
      } catch { /* presence is informational; a later snapshot will refresh it */ }
    })
    events.addEventListener('ended', () => {
      ended = true
      events.close()
      connectionState('ended')
      el('#doc-sub').textContent = 'live session ended · final graph remains available'
    })
    events.addEventListener('error', () => { if (!ended) connectionState('offline') })
  }
}

boot().catch((err) => {
  // `err` can carry document-derived text; build the node instead of interpolating.
  const pre = document.createElement('pre')
  pre.setAttribute('style', 'padding:16px;color:#f06576')
  pre.textContent = `Failed to start: ${String(err)}`
  document.body.replaceChildren(pre)
})
