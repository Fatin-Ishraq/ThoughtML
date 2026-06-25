// The reasoning viewer — a self-contained, dependency-free SVG renderer that
// lays a ThoughtML document out the way the design mock does: reasoning
// *emerges over a time axis* (x = when), with the vertical placement settled by
// a small force relaxation rather than any fixed lanes. It owns its own
// play/scrub timeline, narration line, and conflict banner; selection is handed
// back to the host (which shows the detail card). Themed entirely through the
// app's CSS custom properties, so the light/dark toggle is free.
//
// Shared by both surfaces: it is the playground's primary view (where
// "Readable" was) and the whole standalone `--html` viewer.

import { relationCategory, REL_STYLE, type RelCat, type Theme } from './graph'
import { assertedAt, parseTime, type Canonical, type CanonObject, type Value } from './model'

const SVGNS = 'http://www.w3.org/2000/svg'

export interface TimeViewHandle {
  render(canon: Canonical): void
  applyAsOf(t: number | null): void
  select(id: string | null): boolean
  onSelect(cb: (info: { id: string; kind: string } | null) => void): void
  setTheme(theme: Theme): void
  fit(): void
  zoomIn(): void
  zoomOut(): void
  zoomReset(): void
  onZoom(cb: (pct: number) => void): void
  centerOn(id: string): void
  resize(): void
  setActive(on: boolean): void
  destroy(): void
}

// --- colour: kind / relation → a CSS custom property ---------------------
// Reuse the relation categorisation from graph.ts; map both kinds and relation
// categories onto the shared design tokens so themes drive everything.
const KIND_VAR: Record<string, string> = {
  observation: '--c-focus', claim: '--c-focus', hypothesis: '--c-link',
  option: '--c-question', decision: '--c-question', goal: '--c-agent',
  outcome: '--c-agent', memory: '--c-stance', assumption: '--c-scope',
  question: '--c-question',
}
const REL_VAR: Record<RelCat, string> = {
  support: '--c-agent', attack: '--error', causal: '--c-link', enable: '--accent',
  depend: '--c-scope', revise: '--c-stance', answer: '--c-question',
  lead: '--accent', option: '--c-scope', other: '--c-link',
}

// --- the time model (no lanes) -------------------------------------------
interface TNode {
  id: string
  label: string
  note: string
  kind: string
  colorVar: string
  t: number | null
  author: string | null
  confidence: number | null
  supersededAt: number | null
  abandoned: boolean
  band: string | null
  // layout (filled by layout())
  x: number; y: number; vx: number; vy: number; x0: number
  // runtime
  visible: boolean
  // dom
  g?: SVGGElement; shape?: SVGRectElement; ring?: SVGRectElement
}
interface TEdge { from: string; to: string; cat: RelCat; colorVar: string; arrow: string; dash: boolean; g?: SVGGElement; path?: SVGPathElement
  // port assignment (filled by layout)
  sa?: Side; sb?: Side; fa?: number; fb?: number }
interface Tension { target: string; tFrom: number; tTo: number; message: string }
interface Beat { t: number; text: string }
interface Band { id: string; label: string; y: number }
interface TimeModel { nodes: TNode[]; edges: TEdge[]; narration: Beat[]; tension: Tension[]; tMin: number; tMax: number; bands: Band[]; worldW: number; bandH: number }

type Side = 'L' | 'R' | 'T' | 'B'

function confMidpoint(v: Value | undefined): number | null {
  if (!v) return null
  if (v.kind === 'number') return v.value
  if (v.kind === 'range') return (v.value[0] + v.value[1]) / 2
  return null
}

/** Stable, RNG-free hash (FNV-1a) used to seed deterministic y positions. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0)
}

function firstLine(s: string | undefined): string {
  if (!s) return ''
  const line = s.trim().split('\n')[0]
  return line.length > 64 ? line.slice(0, 62) + '…' : line
}

// --- adapter: canonical → time model -------------------------------------
function buildTimeModel(canon: Canonical): TimeModel {
  const objects = canon.objects
  const byId = new Map<string, CanonObject>(objects.map((o) => [o.id, o]))

  // each enclosing scope becomes a horizontal band (lane). A member's band is its
  // innermost scope; a sub-scope only ever lists its own leaves, so first-writer
  // wins gives the innermost. Reified links inherit their endpoint's band.
  const parentScope = new Map<string, string>()
  for (const o of objects) if (o.type === 'scope') o.includes?.forEach((m) => { if (!parentScope.has(m)) parentScope.set(m, o.id) })

  // which ids are referenced as a target (→ reify the link/claim as a node)
  const referenced = new Set<string>()
  for (const o of objects) {
    if (o.type === 'link') { referenced.add(o.from); referenced.add(o.to) }
    else if (o.type === 'stance') referenced.add(o.target)
    else if (o.type === 'question') o.asks_about?.forEach((r) => referenced.add(r))
  }
  for (const c of canon.audit?.conflicts ?? []) c.subjects.forEach((s) => referenced.add(s))

  // stances targeting an id, by latest assertion (for author + confidence)
  const stancesByTarget = new Map<string, CanonObject[]>()
  for (const o of objects) {
    if (o.type === 'stance') {
      const arr = stancesByTarget.get(o.target) ?? []
      arr.push(o); stancesByTarget.set(o.target, arr)
    }
  }
  const latestStance = (id: string): Extract<CanonObject, { type: 'stance' }> | undefined => {
    const arr = (stancesByTarget.get(id) ?? []).filter((s): s is Extract<CanonObject, { type: 'stance' }> => s.type === 'stance')
    if (!arr.length) return undefined
    return arr.slice().sort((a, b) => (assertedAt(a) ?? 0) - (assertedAt(b) ?? 0)).at(-1)
  }

  const eventAt = new Map<string, number>()
  canon.timeline?.events?.forEach((e) => { const t = parseTime(e.at); if (t !== undefined) eventAt.set(e.id, t) })

  const timeOf = (o: CanonObject): number | null => {
    const own = assertedAt(o) ?? eventAt.get(o.id)
    if (own !== undefined) return own
    // a reified claim with no own time: earliest targeting stance, else endpoints
    const st = latestStance(o.id)
    if (st) { const t = assertedAt(st); if (t !== undefined) return t }
    if (o.type === 'link') {
      const a = (() => { const f = byId.get(o.from); return f ? assertedAt(f) ?? eventAt.get(o.from) : undefined })()
      const b = (() => { const g = byId.get(o.to); return g ? assertedAt(g) ?? eventAt.get(o.to) : undefined })()
      const v = Math.max(a ?? -Infinity, b ?? -Infinity)
      if (Number.isFinite(v)) return v
    }
    return null
  }

  const nodes: TNode[] = []
  const nodeIds = new Set<string>()
  const pushNode = (o: CanonObject, kind: string, colorVar: string) => {
    const st = latestStance(o.id)
    const sup = 'superseded_by' in o && o.superseded_by ? byId.get(o.superseded_by) : undefined
    let band = parentScope.get(o.id) ?? null
    if (band === null && o.type === 'link') band = parentScope.get(o.to) ?? parentScope.get(o.from) ?? null
    nodes.push({
      id: o.id,
      label: o.id,
      note: ('body' in o && o.body) ? o.body : firstLine(undefined),
      kind,
      colorVar,
      t: timeOf(o),
      author: st?.agent ?? null,
      confidence: confMidpoint(st?.confidence),
      supersededAt: sup ? (assertedAt(sup) ?? null) : null,
      abandoned: o.type === 'focus' && o.status === 'abandoned',
      band,
      x: 0, y: 0, vx: 0, vy: 0, x0: 0, visible: true,
    })
    nodeIds.add(o.id)
  }

  for (const o of objects) {
    if (o.type === 'focus') pushNode(o, o.kind ?? 'observation', KIND_VAR[o.kind ?? 'observation'] ?? '--c-focus')
    else if (o.type === 'question') pushNode(o, 'question', '--c-question')
    else if (o.type === 'link' && referenced.has(o.id)) {
      // a reified claim — colour by its relation so it reads support/attack/…
      const cat = relationCategory(o.relation)
      pushNode(o, 'claim', REL_VAR[cat])
    }
  }

  // edges: relation links whose endpoints are both present nodes (or to a node)
  const edges: TEdge[] = []
  for (const o of objects) {
    if (o.type !== 'link') continue
    if (!nodeIds.has(o.from) || !nodeIds.has(o.to)) continue
    const cat = relationCategory(o.relation)
    edges.push({ from: o.from, to: o.to, cat, colorVar: REL_VAR[cat], arrow: REL_STYLE[cat].arrow, dash: REL_STYLE[cat].line === 'dashed' })
  }
  // a reified claim connects to the foci it is about (from → claim → to)
  for (const o of objects) {
    if (o.type === 'link' && referenced.has(o.id)) {
      if (nodeIds.has(o.from)) edges.push({ from: o.from, to: o.id, cat: 'other', colorVar: REL_VAR.other, arrow: 'triangle', dash: true })
      if (nodeIds.has(o.to)) edges.push({ from: o.id, to: o.to, cat: relationCategory(o.relation), colorVar: REL_VAR[relationCategory(o.relation)], arrow: REL_STYLE[relationCategory(o.relation)].arrow, dash: REL_STYLE[relationCategory(o.relation)].line === 'dashed' })
    }
  }

  // tension windows from the mirror's confidence-vs-status conflicts
  const tension: Tension[] = []
  for (const c of canon.audit?.conflicts ?? []) {
    if (c.kind !== 'confidence-vs-status' || c.subjects.length < 2) continue
    const [stanceId, targetId] = c.subjects
    const st = byId.get(stanceId)
    const tFrom = st ? (assertedAt(st) ?? null) : null
    // attacking evidence: an attack link into the target
    let tTo: number | null = null
    for (const o of objects) {
      if (o.type === 'link' && o.to === targetId && relationCategory(o.relation) === 'attack') {
        const at = assertedAt(o); if (at !== undefined) tTo = tTo === null ? at : Math.min(tTo, at)
      }
    }
    if (tFrom !== null) tension.push({ target: targetId, tFrom, tTo: tTo ?? tFrom + 1, message: c.message.replace(/`/g, '') })
  }

  // time span
  const times = nodes.map((n) => n.t).filter((t): t is number => t !== null)
  const tlStart = parseTime(canon.timeline?.start)
  const tlEnd = parseTime(canon.timeline?.end)
  let tMin = Math.min(...(tlStart !== undefined ? [tlStart, ...times] : times))
  let tMax = Math.max(...(tlEnd !== undefined ? [tlEnd, ...times] : times))
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax)) { tMin = 0; tMax = 1 }
  if (tMax === tMin) tMax = tMin + 1

  // narration beats: one per node (by time), plus one at each tension onset
  const beats: Beat[] = []
  for (const n of nodes) {
    if (n.t === null) continue
    beats.push({ t: n.t, text: n.author ? `${n.author}: ${n.label}` : firstLine(n.note) || n.label })
  }
  for (const ten of tension) beats.push({ t: ten.tFrom, text: ten.message })
  beats.sort((a, b) => a.t - b.t)

  return { nodes, edges, narration: beats, tension, tMin, tMax, bands: [], worldW: 0, bandH: 150 }
}

// --- lane-less layout: x = time (pinned), y = emergent force relaxation ---
const PAD = 150
const NODE_W = 162
const NODE_H = 54
const TOP_Y = 60

function layout(model: TimeModel): { worldW: number; worldH: number } {
  const { nodes, edges } = model

  // --- bands: one horizontal lane per enclosing scope, ordered by first time ---
  const UNGROUPED = '·ungrouped'
  const bandIds: string[] = []
  const firstT = new Map<string, number>()
  for (const n of nodes) {
    const b = n.band ?? UNGROUPED
    if (!bandIds.includes(b)) bandIds.push(b)
    const t = n.t ?? Infinity
    const cur = firstT.get(b)
    if (cur === undefined || t < cur) firstT.set(b, t)
  }
  bandIds.sort((a, b) => (firstT.get(a)! - firstT.get(b)!) || (bandIds.indexOf(a) - bandIds.indexOf(b)))
  const bandH = Math.max(116, Math.min(172, Math.round(2600 / Math.max(1, bandIds.length))))
  const bandIndex = new Map(bandIds.map((b, i) => [b, i]))
  const bandY = (b: string | null) => TOP_Y + (bandIndex.get(b ?? UNGROUPED) ?? 0) * bandH + bandH / 2

  // x: within each lane, place records left→right in time order with an even gap —
  // a clean swimlane that fills the width. The slider still reveals by real time,
  // so a doc whose timestamps bunch up no longer collapses into a single column.
  const STEP = NODE_W + 30
  const perBand = new Map<string, TNode[]>()
  for (const n of nodes) { const b = n.band ?? UNGROUPED; const a = perBand.get(b) ?? []; a.push(n); perBand.set(b, a) }
  for (const arr of perBand.values()) {
    arr.sort((p, q) => ((p.t ?? Infinity) - (q.t ?? Infinity)) || (hash(p.id) - hash(q.id)))
    arr.forEach((n, i) => { n.x0 = PAD + i * STEP; n.x = n.x0 })
  }
  for (const n of nodes) { n.y = bandY(n.band) + ((hash(n.id) % 100) - 50) / 100 * (bandH * 0.5); n.vx = 0; n.vy = 0 }

  const idx = new Map(nodes.map((n, i) => [n.id, i]))
  const COLL = Math.hypot(NODE_W, NODE_H) * 0.5 + 16
  const iters = Math.min(420, Math.max(200, Math.floor(11000 / Math.max(1, nodes.length))))
  for (let it = 0; it < iters; it++) {
    const cool = 0.55 + 0.45 * (1 - it / iters)
    const fx = new Float64Array(nodes.length)
    const fy = new Float64Array(nodes.length)
    // x: spring toward the time anchor (keeps left→right time order)
    for (let i = 0; i < nodes.length; i++) fx[i] += (nodes[i].x0 - nodes[i].x) * 0.05
    // y: spring that holds each node inside its lane
    for (let i = 0; i < nodes.length; i++) fy[i] += (bandY(nodes[i].band) - nodes[i].y) * 0.06
    // link attraction: mostly horizontal; only a gentle y pull so cross-lane
    // links don't drag nodes out of their band
    for (const e of edges) {
      const a = idx.get(e.from), b = idx.get(e.to)
      if (a === undefined || b === undefined) continue
      fx[a] += (nodes[b].x - nodes[a].x) * 0.008; fx[b] += (nodes[a].x - nodes[b].x) * 0.008
      fy[a] += (nodes[b].y - nodes[a].y) * 0.004; fy[b] += (nodes[a].y - nodes[b].y) * 0.004
    }
    // collision / separation, pruned by an x window
    const order = nodes.map((_, i) => i).sort((i, j) => nodes[i].x - nodes[j].x)
    for (let oi = 0; oi < order.length; oi++) {
      const i = order[oi]
      for (let oj = oi + 1; oj < order.length; oj++) {
        const j = order[oj]
        let dx = nodes[j].x - nodes[i].x
        if (dx > COLL * 2.4) break
        let dy = nodes[j].y - nodes[i].y
        const dist = Math.hypot(dx, dy) || 0.01
        if (dist < COLL * 1.7) {
          const push = (COLL * 1.7 - dist) / dist * 0.5
          dx *= push; dy *= push
          fx[i] -= dx; fy[i] -= dy; fx[j] += dx; fy[j] += dy
        }
      }
    }
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      n.vx = (n.vx + fx[i]) * 0.82; n.vy = (n.vy + fy[i]) * 0.82
      n.x += n.vx * cool; n.y += n.vy * cool
    }
  }

  // normalise x to the stage origin; y already lives in band coordinates
  let minX = Infinity
  for (const n of nodes) minX = Math.min(minX, n.x)
  const dx0 = PAD - (Number.isFinite(minX) ? minX : 0)
  let maxX = 0
  for (const n of nodes) { n.x += dx0; maxX = Math.max(maxX, n.x) }
  const worldW = maxX + NODE_W + PAD
  const worldH = TOP_Y + bandIds.length * bandH + 70
  model.bands = bandIds.map((b) => ({ id: b, label: b === UNGROUPED ? '' : b, y: bandY(b) }))
  model.worldW = worldW
  model.bandH = bandH
  assignPorts(model)
  return { worldW, worldH }
}

// --- edge geometry (ported from the mock so links don't stack) -----------
function assignPorts(model: TimeModel): void {
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  const cx = (n: TNode) => n.x + NODE_W / 2
  const cy = (n: TNode) => n.y + NODE_H / 2
  for (const e of model.edges) {
    const a = byId.get(e.from), b = byId.get(e.to)
    if (!a || !b) continue
    const dx = cx(b) - cx(a), dyv = cy(b) - cy(a)
    if (Math.abs(dx) >= Math.abs(dyv)) { e.sa = dx > 0 ? 'R' : 'L'; e.sb = dx > 0 ? 'L' : 'R' }
    else { e.sa = dyv > 0 ? 'B' : 'T'; e.sb = dyv > 0 ? 'T' : 'B' }
  }
  // distribute multiple ports on a side so they fan out
  const ports = new Map<string, Array<{ e: TEdge; end: 'a' | 'b' }>>()
  const reg = (id: string, side: Side | undefined, e: TEdge, end: 'a' | 'b') => {
    if (!side) return
    const k = id + '|' + side; const arr = ports.get(k) ?? []; arr.push({ e, end }); ports.set(k, arr)
  }
  for (const e of model.edges) { reg(e.from, e.sa, e, 'a'); reg(e.to, e.sb, e, 'b') }
  const other = (p: { e: TEdge; end: 'a' | 'b' }) => byId.get(p.end === 'a' ? p.e.to : p.e.from)!
  for (const [k, arr] of ports) {
    const side = k.split('|')[1] as Side
    arr.sort((p, q) => {
      const op = other(p), oq = other(q)
      return side === 'L' || side === 'R' ? cy(op) - cy(oq) : cx(op) - cx(oq)
    })
    const m = arr.length
    arr.forEach((p, i) => { const f = m === 1 ? 0.5 : 0.2 + 0.6 * (i / (m - 1)); if (p.end === 'a') p.e.fa = f; else p.e.fb = f })
  }
}

function portPoint(n: TNode, side: Side, f: number): { x: number; y: number } {
  if (side === 'L') return { x: n.x, y: n.y + NODE_H * f }
  if (side === 'R') return { x: n.x + NODE_W, y: n.y + NODE_H * f }
  if (side === 'T') return { x: n.x + NODE_W * f, y: n.y }
  return { x: n.x + NODE_W * f, y: n.y + NODE_H }
}
function ctrlOff(side: Side, d: number): { x: number; y: number } {
  const o = Math.min(80, Math.max(32, d * 0.35))
  return side === 'L' ? { x: -o, y: 0 } : side === 'R' ? { x: o, y: 0 } : side === 'T' ? { x: 0, y: -o } : { x: 0, y: o }
}
function edgePath(e: TEdge, byId: Map<string, TNode>): string {
  const a = byId.get(e.from)!, b = byId.get(e.to)!
  const p1 = portPoint(a, e.sa ?? 'R', e.fa ?? 0.5), p2 = portPoint(b, e.sb ?? 'L', e.fb ?? 0.5)
  const d = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  const o1 = ctrlOff(e.sa ?? 'R', d), o2 = ctrlOff(e.sb ?? 'L', d)
  return `M${p1.x},${p1.y} C${p1.x + o1.x},${p1.y + o1.y} ${p2.x + o2.x},${p2.y + o2.y} ${p2.x},${p2.y}`
}

// --- the renderer ---------------------------------------------------------
export function createTimeView(container: HTMLElement, theme: Theme, opts: { embedded?: boolean } = {}): TimeViewHandle {
  void theme; void opts
  // DOM scaffold
  const root = document.createElement('div')
  root.className = 'timeview'
  const svg = document.createElementNS(SVGNS, 'svg')
  svg.setAttribute('class', 'tv-svg')
  const vp = document.createElementNS(SVGNS, 'g')
  const bandL = document.createElementNS(SVGNS, 'g')
  const eL = document.createElementNS(SVGNS, 'g')
  const nL = document.createElementNS(SVGNS, 'g')
  vp.append(bandL, eL, nL); svg.appendChild(vp)
  const narr = document.createElement('div'); narr.className = 'tv-narr'
  const banner = document.createElement('div'); banner.className = 'tv-banner'
  const bar = document.createElement('div'); bar.className = 'tv-bar'
  bar.innerHTML =
    '<div class="tv-bar-row">' +
      '<span class="tv-clock"></span>' +
      '<button class="tv-play" type="button" title="Play the run">▶ Play the run</button>' +
    '</div>' +
    '<div class="tv-track"><input class="tv-range" type="range" min="0" max="1000" value="1000" step="1" aria-label="time" /><div class="tv-ticks"></div></div>' +
    '<div class="tv-ends"><span class="tv-start"></span><span class="tv-end"></span></div>'
  root.append(svg, narr, banner, bar)
  container.appendChild(root)

  const clockEl = bar.querySelector('.tv-clock') as HTMLElement
  const rangeEl = bar.querySelector('.tv-range') as HTMLInputElement
  const playEl = bar.querySelector('.tv-play') as HTMLButtonElement
  const ticksEl = bar.querySelector('.tv-ticks') as HTMLElement
  const startEl = bar.querySelector('.tv-start') as HTMLElement
  const endEl = bar.querySelector('.tv-end') as HTMLElement

  let model: TimeModel = { nodes: [], edges: [], narration: [], tension: [], tMin: 0, tMax: 1, bands: [], worldW: 0, bandH: 150 }
  let byId = new Map<string, TNode>()
  let asOf: number | null = null
  let focusId: string | null = null
  let pendingFit = false
  let selectCb: (info: { id: string; kind: string } | null) => void = () => {}
  let zoomCb: (pct: number) => void = () => {}
  const T = { x: 0, y: 0, k: 1 }

  const EL = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] => {
    const e = document.createElementNS(SVGNS, tag)
    for (const k in attrs) e.setAttribute(k, String(attrs[k]))
    return e
  }
  const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

  // The viewport transform uses the SVG attribute (reliable across browsers and
  // independent of requestAnimationFrame); applied synchronously so the initial
  // fit always lands. Motion comes from the CSS opacity/pulse animations.
  function applyTransform() { vp.setAttribute('transform', `translate(${T.x},${T.y}) scale(${T.k})`) }
  function setView(k: number, x: number, y: number) { T.k = k; T.x = x; T.y = y; applyTransform(); zoomCb(Math.round(T.k * 100)) }
  function zoomAbout(f: number) {
    const W = svg.clientWidth || 1000, Hh = svg.clientHeight || 700
    const cx = W / 2, cy = Hh / 2
    const nk = Math.max(0.15, Math.min(2.8, T.k * f))
    const wx = (cx - T.x) / T.k, wy = (cy - T.y) / T.k
    setView(nk, cx - wx * nk, cy - wy * nk)
  }

  function buildDefs() {
    const old = svg.querySelector('defs'); if (old) old.remove()
    const defs = document.createElementNS(SVGNS, 'defs')
    const cats: RelCat[] = ['support', 'attack', 'causal', 'enable', 'depend', 'revise', 'answer', 'lead', 'option', 'other']
    for (const c of cats) {
      const m = EL('marker', { id: `tv-mk-${c}`, markerWidth: 9, markerHeight: 9, refX: 7, refY: 4, orient: 'auto' })
      const arrow = REL_STYLE[c].arrow
      let shape: SVGElement
      if (arrow === 'tee') shape = EL('path', { d: 'M0,2 L2,2 L2,6 L0,6 z' })
      else if (arrow === 'vee') shape = EL('path', { d: 'M0,1 L8,4 L0,7', fill: 'none', 'stroke-width': 1.4 })
      else if (arrow === 'diamond') shape = EL('path', { d: 'M0,4 L4,1 L8,4 L4,7 z' })
      else if (arrow === 'circle') shape = EL('circle', { cx: 4, cy: 4, r: 3 })
      else shape = EL('path', { d: 'M0,1 L8,4 L0,7 z' })
      shape.setAttribute('style', `fill:var(${REL_VAR[c]});stroke:var(${REL_VAR[c]})`)
      m.appendChild(shape); defs.appendChild(m)
    }
    svg.insertBefore(defs, svg.firstChild)
  }

  function renderGraph() {
    bandL.replaceChildren(); eL.replaceChildren(); nL.replaceChildren()
    byId = new Map(model.nodes.map((n) => [n.id, n]))
    buildDefs()
    // bands: faint full-width separators + a lane label, so related reasoning
    // reads as a swimlane (the scope it lives in) — structure, not a scatter.
    const half = model.bandH / 2
    for (const b of model.bands) {
      bandL.appendChild(EL('line', { x1: 0, y1: b.y - half, x2: model.worldW, y2: b.y - half, class: 'tv-band-sep' }))
      if (b.label) {
        const t = EL('text', { x: 18, y: b.y - half + 18, class: 'tv-band-label' })
        t.textContent = b.label
        bandL.appendChild(t)
      }
    }
    // edges
    for (const e of model.edges) {
      const g = EL('g', { class: 'tv-edge' })
      const p = EL('path', { d: edgePath(e, byId), fill: 'none', 'marker-end': `url(#tv-mk-${e.cat})`, 'stroke-width': e.cat === 'support' || e.cat === 'enable' ? 1.8 : 1.5, style: `stroke:var(${e.colorVar})` })
      if (e.dash) p.setAttribute('stroke-dasharray', '5 4')
      if (e.cat === 'other') p.setAttribute('opacity', '0.5')
      g.appendChild(p); e.g = g; e.path = p; eL.appendChild(g)
    }
    // nodes
    for (const n of model.nodes) {
      const g = EL('g', { 'data-id': n.id, class: 'tv-node' })
      const shape = EL('rect', { x: n.x, y: n.y, width: NODE_W, height: NODE_H, rx: 11, style: `fill:color-mix(in srgb, var(${n.colorVar}) 15%, var(--bg-panel));stroke:var(${n.colorVar})`, 'stroke-width': 1.4 })
      g.appendChild(shape)
      g.appendChild(EL('circle', { cx: n.x + 13, cy: n.y + 14, r: 3.2, style: `fill:var(${n.colorVar})` }))
      const t = EL('text', { x: n.x + NODE_W / 2, y: n.y + (n.author ? 22 : 30), 'text-anchor': 'middle', class: 'tv-nt' })
      t.textContent = n.label; g.appendChild(t)
      if (n.author) {
        const a = EL('text', { x: n.x + NODE_W / 2, y: n.y + 38, 'text-anchor': 'middle', class: 'tv-na' })
        a.textContent = n.author; g.appendChild(a)
      }
      const ring = EL('rect', { x: n.x - 3, y: n.y - 3, width: NODE_W + 6, height: NODE_H + 6, rx: 13, fill: 'none', class: 'tv-ring', style: 'stroke:var(--error)', 'stroke-width': 1.7, opacity: 0 })
      g.appendChild(ring)
      n.g = g; n.shape = shape; n.ring = ring
      nL.appendChild(g)
    }
  }

  function clk(ms: number) { return fmtDate(ms) }

  // resting opacity of a node at time `t` (abandoned / superseded read folded)
  function restOpacity(n: TNode, t: number | null): number {
    if (n.abandoned) return 0.45
    if (t !== null && n.supersededAt !== null && t >= n.supersededAt) return 0.42
    return 1
  }

  function applyAsOf(t: number | null) {
    asOf = t
    for (const n of model.nodes) {
      if (!n.g) continue
      const on = t === null || n.t === null || n.t <= t + 1e-9
      n.visible = on
      // opacity (transitions in CSS → reveal/hide fade as the run plays)
      n.g.style.opacity = on ? String(restOpacity(n, t)) : '0'
      n.g.style.pointerEvents = on ? '' : 'none'
      n.shape!.setAttribute('stroke-dasharray', '')
      if (on && (n.abandoned || (t !== null && n.supersededAt !== null && t >= n.supersededAt))) n.shape!.setAttribute('stroke-dasharray', '4 3')
      // tension ring → pulsing class
      const ten = model.tension.find((x) => x.target === n.id)
      const live = !!ten && t !== null && t >= ten.tFrom && t < ten.tTo
      n.g.classList.toggle('tv-tension', live)
    }
    for (const e of model.edges) {
      if (!e.g) continue
      const a = byId.get(e.from), b = byId.get(e.to)
      const vis = !!a && !!b && a.visible && b.visible
      e.g.style.opacity = vis ? (e.cat === 'other' ? '0.5' : '1') : '0'
      e.g.style.pointerEvents = vis ? '' : 'none'
    }
    // banner
    const active = t === null ? model.tension : model.tension.filter((x) => t >= x.tFrom && t < x.tTo)
    if (active.length) { banner.classList.add('on'); banner.textContent = '⚠ ' + active[0].message }
    else banner.classList.remove('on')
    // narration
    let text = ''
    for (const bt of model.narration) { if (t === null || bt.t <= t) text = bt.text }
    narr.textContent = text
    clockEl.textContent = t === null ? clk(model.tMax) : clk(t)
    const pct = t === null ? 100 : Math.max(0, Math.min(100, ((t - model.tMin) / (model.tMax - model.tMin)) * 100))
    rangeEl.style.setProperty('--fill', pct + '%')
    if (focusId) applyFocus()
  }

  function applyFocus() {
    if (!focusId) return
    const nb = new Set<string>([focusId])
    for (const e of model.edges) { if (e.from === focusId) nb.add(e.to); if (e.to === focusId) nb.add(e.from) }
    for (const n of model.nodes) {
      if (!n.g || !n.visible) continue
      n.g.style.opacity = nb.has(n.id) ? String(restOpacity(n, asOf)) : '0.1'
    }
    for (const e of model.edges) {
      if (!e.g || e.g.style.opacity === '0') continue
      e.g.style.opacity = (e.from === focusId || e.to === focusId) ? '1' : '0.07'
    }
  }
  function clearFocusDim() {
    for (const e of model.edges) {
      if (!e.g) continue
      const a = byId.get(e.from), b = byId.get(e.to)
      if (a?.visible && b?.visible) e.g.style.opacity = e.cat === 'other' ? '0.5' : '1'
    }
  }

  function setBar() {
    rangeEl.min = String(model.tMin); rangeEl.max = String(model.tMax)
    rangeEl.step = String(Math.max(1, Math.floor((model.tMax - model.tMin) / 240)))
    rangeEl.value = String(model.tMax)
    startEl.textContent = clk(model.tMin); endEl.textContent = clk(model.tMax)
    const span = model.tMax - model.tMin || 1
    ticksEl.replaceChildren()
    const seen = new Set<number>()
    for (const bt of model.narration) {
      if (seen.has(bt.t)) continue; seen.add(bt.t)
      const i = document.createElement('i'); i.style.left = `${((bt.t - model.tMin) / span) * 100}%`; ticksEl.appendChild(i)
    }
  }

  function fit() {
    const W = svg.clientWidth || container.clientWidth || 1000
    const Hh = svg.clientHeight || container.clientHeight || 700
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of model.nodes) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + NODE_W); maxY = Math.max(maxY, n.y + NODE_H) }
    if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = W; maxY = Hh }
    const bw = (maxX - minX) || 1, bh = (maxY - minY) || 1
    const padX = 90, topRoom = 100, botRoom = 108 // leave room for narration + bar
    const avail = Hh - topRoom - botRoom
    let k = Math.min((W - padX * 2) / bw, avail / bh, 1.3)
    if (!Number.isFinite(k) || k <= 0) k = 0.6
    const x = (W - bw * k) / 2 - minX * k
    // bias toward the top (cap the centring offset) so a wide-but-short stage
    // doesn't leave a big void above the lanes
    const y = topRoom + Math.min((avail - bh * k) / 2, 28) - minY * k
    if ((svg.clientWidth || 0) > 0) pendingFit = false // a real (sized) fit landed
    setView(k, x, y)
  }

  function render(canon: Canonical) {
    model = buildTimeModel(canon)
    layout(model)
    renderGraph()
    setBar()
    applyAsOf(model.tMax)
    pendingFit = true // if the pane isn't sized yet, the observer re-fits once it is
    fit()
  }

  // one-shot: the first time the stage has a real size, fit to it (the initial
  // render can run before layout gives the pane its width).
  const ro = new ResizeObserver(() => { if (pendingFit && (svg.clientWidth || 0) > 0) fit() })
  ro.observe(svg)

  // ---- interactions ----
  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault()
    const r = svg.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top
    const f = ev.deltaY < 0 ? 1.1 : 1 / 1.1, nk = Math.max(0.15, Math.min(2.6, T.k * f))
    const wx = (mx - T.x) / T.k, wy = (my - T.y) / T.k
    setView(nk, mx - wx * nk, my - wy * nk)
  }, { passive: false })

  let drag: { x: number; y: number; tx: number; ty: number; node: string | null; moved: boolean } | null = null
  let pointerId: number | null = null
  function endDrag(click: boolean) {
    if (drag && click && !drag.moved) selectNode(drag.node ?? null)
    drag = null; root.classList.remove('dragging')
    if (pointerId !== null) { try { svg.releasePointerCapture(pointerId) } catch { /* already released */ } pointerId = null }
  }
  svg.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return // pan only with the primary button
    const ge = (ev.target as Element).closest?.('g[data-id]') as SVGGElement | null
    drag = { x: ev.clientX, y: ev.clientY, tx: T.x, ty: T.y, node: ge?.getAttribute('data-id') ?? null, moved: false }
    pointerId = ev.pointerId
    try { svg.setPointerCapture(ev.pointerId) } catch { /* noop */ }
    root.classList.add('dragging')
  })
  svg.addEventListener('pointermove', (ev) => {
    if (drag) {
      // a move with no button held means we missed the release — stop dragging
      if (ev.buttons === 0) { endDrag(false); return }
      if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 5) drag.moved = true
      T.x = drag.tx + (ev.clientX - drag.x); T.y = drag.ty + (ev.clientY - drag.y); applyTransform()
      return
    }
    // hover spotlight (only when not panning)
    const ge = (ev.target as Element).closest?.('g[data-id]') as SVGGElement | null
    if (!focusId) hover(ge ? ge.getAttribute('data-id') : null)
  })
  svg.addEventListener('pointerup', () => endDrag(true))
  // releases / cancels outside the SVG must still clear the drag
  window.addEventListener('pointerup', () => { if (drag) endDrag(false) })
  window.addEventListener('pointercancel', () => endDrag(false))
  window.addEventListener('blur', () => endDrag(false))

  function hover(id: string | null) {
    if (focusId) return
    if (!id) { for (const n of model.nodes) if (n.g && n.visible) n.g.style.opacity = String(restOpacity(n, asOf)); clearFocusDim(); return }
    const nb = new Set<string>([id])
    for (const e of model.edges) { if (e.from === id) nb.add(e.to); if (e.to === id) nb.add(e.from) }
    for (const n of model.nodes) { if (!n.g || !n.visible) continue; n.g.style.opacity = nb.has(n.id) ? String(restOpacity(n, asOf)) : '0.16' }
  }

  function selectNode(id: string | null) {
    focusId = id
    for (const n of model.nodes) if (n.g && n.visible) n.g.style.opacity = String(restOpacity(n, asOf))
    clearFocusDim()
    if (id) { applyFocus(); const n = byId.get(id); selectCb(n ? { id, kind: n.kind } : null) }
    else selectCb(null)
  }

  // ---- timeline bar ----
  let timer: number | undefined
  function stopPlay() { if (timer) { clearInterval(timer); timer = undefined } playEl.textContent = '▶ Play the run' }
  playEl.addEventListener('click', () => {
    if (timer) { stopPlay(); return }
    const min = Number(rangeEl.min), max = Number(rangeEl.max)
    if (Number(rangeEl.value) >= max) rangeEl.value = String(min)
    playEl.textContent = '❚❚ Pause'
    const step = (max - min) / 120
    timer = window.setInterval(() => {
      const next = Number(rangeEl.value) + step
      if (next >= max) { rangeEl.value = String(max); applyAsOf(max); stopPlay() }
      else { rangeEl.value = String(next); applyAsOf(next) }
    }, 70)
  })
  rangeEl.addEventListener('input', () => { stopPlay(); applyAsOf(Number(rangeEl.value)) })

  return {
    render,
    applyAsOf,
    select: (id) => { selectNode(id); return id === null || byId.has(id) },
    onSelect: (cb) => { selectCb = cb },
    setTheme: () => { /* themed by CSS vars on <body>; nothing to recompute */ },
    fit,
    zoomIn: () => zoomAbout(1.25),
    zoomOut: () => zoomAbout(1 / 1.25),
    zoomReset: fit,
    onZoom: (cb) => { zoomCb = cb },
    centerOn: (id) => { const n = byId.get(id); if (!n) return; const W = svg.clientWidth, Hh = svg.clientHeight; setView(T.k, W / 2 - (n.x + NODE_W / 2) * T.k, Hh / 2 - (n.y + NODE_H / 2) * T.k) },
    resize: () => { /* svg is responsive; nothing to do */ },
    setActive: (on) => { root.style.display = on ? '' : 'none' },
    destroy: () => { stopPlay(); ro.disconnect(); root.remove() },
  }
}
