// Projects the canonical object model (§13) into a Cytoscape graph and renders
// it with a themed, "ink & paper" visual style.
//
// Links and stances are reified as nodes when referenced (so link→link and
// stance→anything render); in "readable" mode unreferenced links/stances
// collapse into labelled edges, in "structural" mode everything is a node.

import cytoscape, { type Core, type ElementDefinition } from 'cytoscape'
import dagre from 'cytoscape-dagre'
import { assertedAt, formatValue, type Canonical, type CanonObject, type Value } from './parse'

cytoscape.use(dagre)

export type ViewMode = 'readable' | 'structural'
export type Theme = 'dark' | 'light'

interface Palette {
  text: string
  edge: string
  edgeText: string
  textBg: string
  focus: string
  question: string
  link: string
  stance: string
  scope: string
  agent: string
  missing: string
  accent: string
  select: string
  faded: number
  nodeOpacity: number
}

const PALETTE: Record<Theme, Palette> = {
  // "Caveman" — vivid hues (coral/lime/amber lineage) on a near-black ground;
  // bright borders carry type identity, the dark fill keeps nodes legible.
  dark: {
    text: '#f5f4f2', edge: '#4f4a44', edgeText: '#b4b0aa', textBg: '#100f0e',
    focus: '#5a9bef', question: '#e8b84a', link: '#34cdb8', stance: '#ec74c0',
    scope: '#9d968c', agent: '#a6d957', missing: '#ff6b6b', accent: '#5cb0ff',
    select: '#f4f4f5',
    faded: 0.12, nodeOpacity: 0.22,
  },
  // Warm parchment — a comfortable, sepia-leaning light theme: deepened hues on
  // warm paper with muted-brown text. Deliberately not white (easy on the eyes).
  light: {
    text: '#463d2d', edge: '#b3a17a', edgeText: '#6c6147', textBg: '#ddd0b2',
    focus: '#2c66c4', question: '#9a6a10', link: '#0d7e70', stance: '#b83a85',
    scope: '#6a6253', agent: '#5a7d1e', missing: '#cc4434', accent: '#2c66c4',
    select: '#2a2418',
    faded: 0.1, nodeOpacity: 0.3,
  },
}

const NODE_KINDS: Array<{ kind: keyof Palette; label: string }> = [
  { kind: 'focus', label: 'Focus' },
  { kind: 'question', label: 'Question' },
  { kind: 'link', label: 'Link' },
  { kind: 'stance', label: 'Stance' },
  { kind: 'scope', label: 'Scope' },
  { kind: 'agent', label: 'Agent' },
]

export function legendItems(theme: Theme): Array<{ label: string; color: string }> {
  const p = PALETTE[theme]
  return NODE_KINDS.map(({ kind, label }) => ({ label, color: p[kind] as string }))
}

// --- Relation vocabulary -------------------------------------------------
// Each relation reads by arrowhead + line style + colour, the way a Mermaid
// diagram does: supports points (green arrow), attacks blunt (red tee), causes
// drives (teal triangle), enables suggests (open chevron), depends-on is
// tentative (dashed), revises replaces (mauve diamond).

export type RelCat = 'support' | 'attack' | 'causal' | 'enable' | 'depend' | 'revise' | 'answer' | 'lead' | 'option' | 'other'

export function relationCategory(rel: string): RelCat {
  switch (rel) {
    case 'supports': return 'support'
    case 'undercuts': case 'opposes': case 'rejects': case 'prevents': case 'blocks': return 'attack'
    case 'causes': return 'causal'
    case 'enables': return 'enable'
    case 'depends-on': return 'depend'
    case 'revises': return 'revise'
    case 'answers': return 'answer'
    case 'leads-to': return 'lead'
    case 'option-of': return 'option'
    default: return 'other'
  }
}

interface RelStyle { color: keyof Palette; arrow: string; line: 'solid' | 'dashed'; label: string }

export const REL_STYLE: Record<RelCat, RelStyle> = {
  support: { color: 'agent', arrow: 'triangle', line: 'solid', label: 'supports' },
  attack: { color: 'missing', arrow: 'tee', line: 'solid', label: 'undercuts · opposes · rejects' },
  causal: { color: 'link', arrow: 'triangle', line: 'solid', label: 'causes' },
  enable: { color: 'agent', arrow: 'vee', line: 'solid', label: 'enables' },
  depend: { color: 'scope', arrow: 'triangle', line: 'dashed', label: 'depends-on' },
  revise: { color: 'stance', arrow: 'diamond', line: 'solid', label: 'revises' },
  answer: { color: 'question', arrow: 'triangle', line: 'solid', label: 'answers' },
  // Decision EV (Phase 9): leads-to carries a probability toward an outcome
  // (accent, the EV-bearing edge); option-of groups an option under a decision
  // (a soft, dashed membership tie).
  lead: { color: 'accent', arrow: 'triangle', line: 'solid', label: 'leads-to' },
  option: { color: 'scope', arrow: 'circle', line: 'dashed', label: 'option-of' },
  other: { color: 'link', arrow: 'triangle', line: 'solid', label: 'related' },
}

/** The relation categories worth showing in the legend, in reading order. */
export function relationLegend(theme: Theme): Array<{ cat: RelCat; label: string; color: string; arrow: string; line: string }> {
  const p = PALETTE[theme]
  const cats: RelCat[] = ['support', 'attack', 'causal', 'enable', 'depend', 'revise', 'answer', 'lead', 'option']
  return cats.map((cat) => ({ cat, label: REL_STYLE[cat].label, color: p[REL_STYLE[cat].color] as string, arrow: REL_STYLE[cat].arrow, line: REL_STYLE[cat].line }))
}

/** Midpoint of a confidence value in [0,1], or undefined if not numeric. */
function confValue(v: Value | undefined): number | undefined {
  if (!v) return undefined
  if (v.kind === 'number') return v.value
  if (v.kind === 'range') return (v.value[0] + v.value[1]) / 2
  return undefined
}

function buildElements(canon: Canonical, mode: ViewMode): ElementDefinition[] {
  const objects = canon.objects
  const byId = new Map<string, CanonObject>(objects.map((o) => [o.id, o]))

  const referenced = new Set<string>()
  for (const o of objects) {
    if (o.type === 'link') { referenced.add(o.from); referenced.add(o.to) }
    else if (o.type === 'stance') referenced.add(o.target)
    else if (o.type === 'question') o.asks_about?.forEach((r) => referenced.add(r))
    else if (o.type === 'scope') o.includes?.forEach((r) => referenced.add(r))
  }

  const nodes: ElementDefinition[] = []
  const edges: ElementDefinition[] = []
  const seen = new Set<string>()

  // Temporal data for the as-of view: `at` = assertion instant (epoch ms),
  // `superBy` = id of the belief that revises this one. Both optional.
  const timeData = (o: CanonObject): Record<string, unknown> => {
    const r: Record<string, unknown> = {}
    const at = assertedAt(o)
    if (at !== undefined) r.at = at
    if ('superseded_by' in o && o.superseded_by) r.superBy = o.superseded_by
    return r
  }
  // Evidence-derived confidence (Phase 4) for the heat overlay.
  const derivedData = (o: CanonObject): Record<string, unknown> =>
    'derived_confidence' in o && o.derived_confidence !== undefined ? { derived: o.derived_confidence } : {}
  // Grounded argument status (Phase 5) for the status overlay.
  const statusData = (o: CanonObject): Record<string, unknown> =>
    'argument_status' in o && o.argument_status ? { status: o.argument_status } : {}
  // Per-evidence leverage (Phase 6) for the sensitivity overlay: `lev` keeps the
  // signed value, `levAbs` drives width/thickness mappings.
  const leverData = (o: CanonObject): Record<string, unknown> =>
    'leverage' in o && o.leverage !== undefined ? { lev: o.leverage, levAbs: Math.abs(o.leverage) } : {}

  // Decision EV (§10.6): which foci are decisions and which options they weigh —
  // for the Decision overlay. The engine orders the options by EV; it crowns none.
  const rankedOptions = new Set<string>()
  for (const o of objects) {
    if (o.type === 'focus' && o.decision) {
      o.decision.ranked.forEach((e) => rankedOptions.add(e.option))
    }
  }
  const decisionData = (o: CanonObject): Record<string, unknown> => {
    const r: Record<string, unknown> = {}
    if (o.type === 'focus' && o.decision) r.decision = 1
    if (rankedOptions.has(o.id)) r.ranked = 1
    return r
  }

  const addNode = (id: string, label: string, kind: string, extra: Record<string, unknown> = {}, extraClass = '') => {
    if (seen.has(id)) return
    seen.add(id)
    nodes.push({ group: 'nodes', data: { id, label, kind, ...extra }, classes: extraClass ? `${kind} ${extraClass}` : kind })
  }
  const agentNode = (name: string) => {
    const id = `agent:${name}`
    addNode(id, name, 'agent')
    return id
  }
  const ensureRef = (id: string) => {
    if (!seen.has(id) && !byId.has(id)) addNode(id, id, 'missing')
  }
  const reify = (id: string) => mode === 'structural' || referenced.has(id)

  for (const o of objects) {
    if (o.type === 'focus') {
      // Phase 7/8: surface a measure as a second label line so numbers read
      // straight off the graph — the computed value (prefixed `=`) when a formula
      // produced one, otherwise the authored quantity.
      const fmtQ = (q: { value: number; unit: string }) => (q.unit ? `${q.value} ${q.unit}` : `${q.value}`)
      let label = o.id
      // An option shows its expected value (§10.6); otherwise a computed value
      // (Phase 8) or the authored quantity (Phase 7). A decision keeps its bare
      // id — the mirror names no winning option on the node.
      if (o.expected_value) label = `${o.id}\nEV ${fmtQ(o.expected_value)}`
      else if (o.computed_quantity) label = `${o.id}\n= ${fmtQ(o.computed_quantity)}`
      else if (o.quantity) label = `${o.id}\n${fmtQ(o.quantity)}`
      addNode(o.id, label, 'focus', { body: o.body ?? '', ...timeData(o), ...derivedData(o), ...statusData(o), ...decisionData(o) }, o.kind ? `kind-${o.kind}` : '')
    }
    else if (o.type === 'question') {
      const detail = [o.expects && `expects ${o.expects}`, o.status && `status ${o.status}`].filter(Boolean).join(' · ')
      addNode(o.id, o.id, 'question', { body: o.body ?? '', detail, ...timeData(o) })
    } else if (o.type === 'scope') addNode(o.id, o.id, 'scope')
    else if (o.type === 'act') addNode(o.id, o.verb, 'act')
  }

  for (const o of objects) {
    if (o.type !== 'link') continue
    ensureRef(o.from)
    ensureRef(o.to)
    const w = o.weight !== undefined ? { weight: o.weight } : {}
    const td = timeData(o)
    const rel = `rel-${relationCategory(o.relation)}`
    if (reify(o.id)) {
      addNode(o.id, o.relation, 'link', { detail: `${o.from} → ${o.to}`, ...w, ...td, ...derivedData(o), ...statusData(o), ...leverData(o) }, rel)
      edges.push({ group: 'edges', data: { id: `${o.id}::from`, source: o.id, target: o.from }, classes: 'e-from' })
      edges.push({ group: 'edges', data: { id: `${o.id}::to`, source: o.id, target: o.to, ...leverData(o) }, classes: `e-to ${rel}` })
    } else {
      edges.push({ group: 'edges', data: { id: o.id, source: o.from, target: o.to, label: o.relation, ...w, ...td, ...leverData(o) }, classes: `e-relation ${rel}` })
    }
  }

  for (const o of objects) {
    if (o.type !== 'stance') continue
    const agentId = agentNode(o.agent)
    ensureRef(o.target)
    const conf = formatValue(o.confidence)
    const cv = confValue(o.confidence)
    const label = conf ? `${o.posture}\n${conf}` : o.posture
    const td = timeData(o)
    if (reify(o.id)) {
      addNode(o.id, label, 'stance', { detail: `${o.agent} → ${o.target}`, ...(cv !== undefined ? { confValue: cv } : {}), ...td })
      edges.push({ group: 'edges', data: { id: `${o.id}::by`, source: agentId, target: o.id }, classes: 'e-by' })
      edges.push({ group: 'edges', data: { id: `${o.id}::targets`, source: o.id, target: o.target }, classes: 'e-targets' })
    } else {
      edges.push({ group: 'edges', data: { id: o.id, source: agentId, target: o.target, label: conf ? `${o.posture} ${conf}` : o.posture, ...td }, classes: 'e-stance' })
    }
  }

  for (const o of objects) {
    if (o.type === 'question') {
      o.asks_about?.forEach((r, i) => { ensureRef(r); edges.push({ group: 'edges', data: { id: `${o.id}::asks:${i}`, source: o.id, target: r, label: 'asks about' }, classes: 'e-asks' }) })
    } else if (o.type === 'scope' && mode !== 'structural') {
      // Readable mode shows membership as scope→member edges; structural mode
      // shows it as Cytoscape compound nesting instead (below).
      o.includes?.forEach((r, i) => { ensureRef(r); edges.push({ group: 'edges', data: { id: `${o.id}::inc:${i}`, source: o.id, target: r }, classes: 'e-includes' }) })
    }
  }

  // Structural mode: nest each scope's members inside it as a compound parent,
  // so a scope draws as a box containing its reasoning (sub-scopes nest too).
  if (mode === 'structural') {
    const parentOf = new Map<string, string>()
    for (const o of objects) {
      if (o.type === 'scope') o.includes?.forEach((m) => parentOf.set(m, o.id))
    }
    for (const n of nodes) {
      const p = parentOf.get(n.data.id as string)
      if (p && seen.has(p)) n.data.parent = p
    }
  }

  return [...nodes, ...edges]
}

function buildStyle(p: Palette): any[] {
  const nodeKind = (k: keyof Palette) => ({ selector: `node.${k}`, style: { 'background-color': p[k] as string, 'border-color': p[k] as string } })
  // Relation-aware edges + reified-link tints, generated from REL_STYLE.
  const cats = Object.keys(REL_STYLE) as RelCat[]
  const relEdge = cats.map((c) => {
    const s = REL_STYLE[c]
    return { selector: `edge.rel-${c}`, style: { 'line-color': p[s.color] as string, 'target-arrow-color': p[s.color] as string, 'target-arrow-shape': s.arrow, 'target-arrow-fill': s.arrow === 'vee' ? 'hollow' : 'filled', 'line-style': s.line } }
  })
  const relNode = cats.map((c) => ({ selector: `node.link.rel-${c}`, style: { 'border-color': p[REL_STYLE[c].color] as string } }))
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        color: p.text,
        'font-size': 11,
        'font-family': 'ui-monospace, monospace',
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-max-width': '150px',
        'line-height': 1.3,
        width: 'label',
        height: 'label',
        padding: '10px',
        shape: 'round-rectangle',
        'background-opacity': p.nodeOpacity,
        'border-width': 1.6,
        'transition-property': 'opacity, background-opacity, border-width',
        'transition-duration': 0.15,
      },
    },
    nodeKind('focus'),
    nodeKind('link'),
    nodeKind('stance'),
    nodeKind('agent'),
    { selector: 'node.question', style: { 'background-color': p.question, 'border-color': p.question, shape: 'round-diamond', 'text-max-width': '110px' } },
    { selector: 'node.scope', style: { 'background-color': p.scope, 'border-color': p.scope, shape: 'round-rectangle', 'font-weight': 700, 'background-opacity': p.nodeOpacity * 0.55 } },
    // A scope holding members (structural mode) draws as a compound box: label
    // at the top, padded, faint fill so the nested nodes read clearly. Only
    // matches when the scope actually has children, so leaf scopes are untouched.
    { selector: 'node.scope:parent', style: { 'text-valign': 'top', 'text-halign': 'center', padding: 18, 'background-opacity': 0.08, 'border-opacity': 0.7 } },
    // Focus kind → shape (v0.2). Colour stays `focus`; shape encodes the kind,
    // so type reads by colour and reasoning-category reads by silhouette.
    { selector: 'node.kind-observation', style: { shape: 'round-rectangle' } },
    { selector: 'node.kind-claim', style: { shape: 'ellipse' } },
    { selector: 'node.kind-hypothesis', style: { shape: 'round-hexagon' } },
    { selector: 'node.kind-option', style: { shape: 'round-tag' } },
    { selector: 'node.kind-decision', style: { shape: 'round-diamond' } },
    { selector: 'node.kind-goal', style: { shape: 'round-pentagon' } },
    { selector: 'node.kind-memory', style: { shape: 'barrel' } },
    { selector: 'node.kind-assumption', style: { shape: 'cut-rectangle' } },
    { selector: 'node.kind-outcome', style: { shape: 'rhomboid' } },
    { selector: 'node.missing', style: { 'background-color': p.missing, 'border-color': p.missing, 'border-style': 'dashed' } },
    { selector: 'node.agent', style: { 'background-color': p.agent, 'border-color': p.agent, shape: 'ellipse' } },
    // confidence → border thickness on stance nodes
    { selector: 'node.stance[confValue]', style: { 'border-width': 'mapData(confValue, 0, 1, 1, 4.5)' } },
    // relation weight (v0.2) → border thickness on reified link nodes
    { selector: 'node.link[weight]', style: { 'border-width': 'mapData(weight, 0, 1, 1, 4.5)' } },
    // Relation tint on reified link nodes (so a hypothesis reads support/attack/…).
    ...relNode,
    // Evidence-heat overlay (v0.2, Phase 4): colour claims by their derived
    // confidence — weak/contested (red) → strongly supported (green).
    { selector: 'node.heat[derived]', style: { 'background-color': `mapData(derived, 0, 1, ${p.missing}, ${p.agent})`, 'border-color': `mapData(derived, 0, 1, ${p.missing}, ${p.agent})`, 'background-opacity': 0.6 } },
    // Argument-status overlay (v0.2, Phase 5): accepted (green) / defeated
    // (dashed, dim red) / undecided (dotted amber).
    { selector: 'node.sv-in', style: { 'border-color': p.agent, 'border-width': 3 } },
    { selector: 'node.sv-out', style: { 'border-color': p.missing, 'border-width': 2, 'border-style': 'dashed', 'background-opacity': 0.07, 'text-opacity': 0.6 } },
    { selector: 'node.sv-undecided', style: { 'border-color': p.question, 'border-width': 2, 'border-style': 'dotted' } },
    // Sensitivity overlay (v0.2, Phase 6): thicken a reified link's border by how
    // load-bearing it is (|leverage|). The edge-side rules live at the end of the
    // sheet so they win over the base width/weight mappings.
    { selector: 'node.link.lever[levAbs]', style: { 'border-width': 'mapData(levAbs, 0, 0.4, 2, 9)' } },
    // Decision overlay (v0.2, §10.6): outline the decision and mark the options it
    // weighs. The mirror orders options by EV but rings no winner.
    { selector: 'node.dv-decision', style: { 'border-color': p.accent, 'border-width': 3, 'border-style': 'double' } },
    { selector: 'node.dv-option', style: { 'border-color': p.scope, 'border-width': 2, 'border-style': 'dashed', 'background-opacity': 0.1, 'text-opacity': 0.72 } },
    // What-if (v0.2, Phase 6): a muted node and its edges read as removed.
    { selector: 'node.muted', style: { 'background-opacity': 0.04, opacity: 0.32, 'text-opacity': 0.45, 'border-style': 'dashed' } },
    { selector: 'node:selected', style: { 'border-color': p.select, 'border-width': 3.5, 'background-opacity': p.nodeOpacity + 0.2 } },
    { selector: 'node.faded', style: { 'background-opacity': 0.04, opacity: 0.32, 'text-opacity': 0.3 } },
    // As-of view (v0.2, Phase 3): hide assertions later than the slider time;
    // dim + mute beliefs that have been superseded as of that time.
    { selector: '.time-hidden', style: { display: 'none' } },
    { selector: 'node.superseded', style: { opacity: 0.4, 'background-opacity': 0.05, 'text-opacity': 0.55, color: p.edgeText, 'border-style': 'dashed' } },

    {
      selector: 'edge',
      style: {
        width: 1.6,
        'line-color': p.edge,
        'target-arrow-color': p.edge,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.9,
        'curve-style': 'bezier',
        'font-size': 9,
        'font-family': 'ui-monospace, monospace',
        color: p.edgeText,
        'text-background-color': p.textBg,
        'text-background-opacity': 0.85,
        'text-background-padding': '2px',
        'text-rotation': 'autorotate',
        'transition-property': 'opacity',
        'transition-duration': 0.15,
      },
    },
    { selector: 'edge[label]', style: { label: 'data(label)' } },
    { selector: 'edge.e-relation', style: { 'line-color': p.link, 'target-arrow-color': p.link } },
    // relation weight (v0.2) → line thickness on non-reified relation edges
    { selector: 'edge.e-relation[weight]', style: { width: 'mapData(weight, 0, 1, 1, 5)' } },
    { selector: 'edge.e-stance', style: { 'line-color': p.stance, 'target-arrow-color': p.stance, 'line-style': 'dashed' } },
    { selector: 'edge.e-from, edge.e-to', style: { 'line-color': p.link, 'target-arrow-color': p.link, width: 1.2, 'line-style': 'dotted' } },
    { selector: 'edge.e-by', style: { 'line-color': p.agent, 'target-arrow-color': p.agent, width: 1.2 } },
    { selector: 'edge.e-targets', style: { 'line-color': p.stance, 'target-arrow-color': p.stance, 'line-style': 'dashed' } },
    { selector: 'edge.e-asks, edge.e-includes', style: { 'line-color': p.edge, 'target-arrow-color': p.edge, 'line-style': 'dashed' } },
    // Relation-aware edges (arrowhead + colour + line per relation) — placed
    // after the structural rules so the relation's look wins on relation edges.
    ...relEdge,
    { selector: 'edge.faded', style: { opacity: p.faded } },
    { selector: 'edge.superseded', style: { opacity: 0.28, 'line-style': 'dashed', 'text-opacity': 0.4 } },
    // Phase 6 edge overlays — last, so they win the `width`/`opacity` cascade over
    // the base edge and the relation-weight mapping above.
    { selector: 'edge.lever-faded', style: { opacity: p.faded } },
    { selector: 'edge.lever[levAbs]', style: { opacity: 1, width: 'mapData(levAbs, 0, 0.4, 1.5, 9)' } },
    { selector: 'edge.muted', style: { opacity: 0.12, 'line-style': 'dashed' } },
  ]
}

const LAYOUT = { name: 'dagre', rankDir: 'LR', nodeSep: 30, rankSep: 70, edgeSep: 12, padding: 30 } as const

export interface GraphHandle {
  cy: Core
  render(canon: Canonical, mode: ViewMode, animate?: boolean): void
  relayout(): void
  fit(): void
  resize(): void
  setTheme(theme: Theme): void
  zoomIn(): void
  zoomOut(): void
  zoomReset(): void
  onZoom(cb: (pct: number) => void): void
  centerOn(id: string): void
  select(id: string): boolean
  onSelect(cb: (info: { id: string; kind: string } | null) => void): void
  /** Filter the graph to an as-of time (epoch ms), or `null` to show all. */
  applyAsOf(t: number | null): void
  /** Toggle the evidence-heat overlay (colour nodes by derived confidence). */
  setHeat(on: boolean): void
  /** Toggle the argument-status overlay (outline nodes by in/out/undecided). */
  setStatus(on: boolean): void
  /** Toggle the sensitivity overlay (thicken evidence by |leverage|). */
  setSensitivity(on: boolean): void
  /** Toggle the decision overlay (mark the decision and the options it weighs). */
  setDecision(on: boolean): void
  /** Mark a set of node/link ids as muted (what-if), or clear with an empty set. */
  setMuted(ids: Set<string>): void
}

export function createGraph(container: HTMLElement, theme: Theme): GraphHandle {
  const cy = cytoscape({
    container,
    elements: [],
    style: buildStyle(PALETTE[theme]),
    minZoom: 0.1,
    maxZoom: 3,
  })

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).thoughtmlGraph = cy

  const runLayout = (animate: boolean) => {
    cy.layout({ ...LAYOUT, animate, animationDuration: animate ? 350 : 0, fit: true } as unknown as cytoscape.LayoutOptions).run()
  }

  // Hover spotlight: dim everything except the hovered node's neighborhood.
  cy.on('mouseover', 'node', (e) => {
    const nb = e.target.closedNeighborhood()
    cy.elements().addClass('faded')
    nb.removeClass('faded')
  })
  cy.on('mouseout', 'node', () => cy.elements().removeClass('faded'))

  // Current as-of filter; re-applied after every render since rebuilding the
  // graph recreates all elements. `null` = show the whole timeline.
  let asOf: number | null = null

  function applyAsOf(t: number | null) {
    asOf = t
    cy.batch(() => {
      cy.elements().removeClass('time-hidden superseded')
      if (t === null) return
      // Hide assertions that haven't happened yet at time `t`.
      cy.elements().forEach((ele) => {
        const at = ele.data('at')
        if (typeof at === 'number' && at > t) ele.addClass('time-hidden')
      })
      // Dim beliefs whose reviser is present at `t` (untimed reviser = always).
      cy.elements().forEach((ele) => {
        if (ele.hasClass('time-hidden')) return
        const by = ele.data('superBy')
        if (!by) return
        const sup = cy.getElementById(by as string)
        const supAt = sup.nonempty() ? sup.data('at') : undefined
        if (typeof supAt !== 'number' || supAt <= t) ele.addClass('superseded')
      })
    })
  }

  // Overlay states; re-applied after every render (elements are recreated).
  let heatOn = false
  function setHeat(on: boolean) {
    heatOn = on
    cy.batch(() => {
      cy.nodes().removeClass('heat')
      if (on) cy.nodes('[derived]').addClass('heat')
    })
  }

  let statusOn = false
  function setStatus(on: boolean) {
    statusOn = on
    cy.batch(() => {
      cy.nodes().removeClass('sv-in sv-out sv-undecided')
      if (on) {
        cy.nodes('[status = "in"]').addClass('sv-in')
        cy.nodes('[status = "out"]').addClass('sv-out')
        cy.nodes('[status = "undecided"]').addClass('sv-undecided')
      }
    })
  }

  let sensOn = false
  function setSensitivity(on: boolean) {
    sensOn = on
    cy.batch(() => {
      cy.elements().removeClass('lever lever-faded')
      if (on) {
        cy.edges().addClass('lever-faded')
        cy.elements('[levAbs]').removeClass('lever-faded').addClass('lever')
      }
    })
  }

  let decisionOn = false
  function setDecision(on: boolean) {
    decisionOn = on
    cy.batch(() => {
      cy.nodes().removeClass('dv-decision dv-option')
      if (on) {
        cy.nodes('[decision = 1]').addClass('dv-decision')
        cy.nodes('[ranked = 1]').addClass('dv-option')
      }
    })
  }

  let muted = new Set<string>()
  function setMuted(ids: Set<string>) {
    muted = ids
    cy.batch(() => {
      cy.elements().removeClass('muted')
      ids.forEach((id) => {
        const ele = cy.getElementById(id)
        if (ele.empty()) return
        ele.addClass('muted')
        if (ele.isNode()) ele.connectedEdges().addClass('muted')
      })
    })
  }

  function render(canon: Canonical, mode: ViewMode, animate = false) {
    cy.elements().remove()
    cy.add(buildElements(canon, mode))
    runLayout(animate)
    applyAsOf(asOf)
    setHeat(heatOn)
    setStatus(statusOn)
    setSensitivity(sensOn)
    setDecision(decisionOn)
    setMuted(muted)
  }

  function onSelect(cb: (info: { id: string; kind: string } | null) => void) {
    cy.on('tap', 'node', (e) => cb({ id: e.target.data('id'), kind: e.target.data('kind') }))
    cy.on('tap', (e) => { if (e.target === cy) cb(null) })
  }

  const zoomBy = (factor: number) => {
    const level = Math.min(3, Math.max(0.1, cy.zoom() * factor))
    cy.animate({ zoom: { level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }, duration: 130 } as unknown as cytoscape.AnimateOptions)
  }

  function centerOn(id: string) {
    const node = cy.$id(id)
    if (node.nonempty()) cy.animate({ center: { eles: node }, duration: 250 } as unknown as cytoscape.AnimateOptions)
  }

  function select(id: string): boolean {
    const node = cy.$id(id)
    if (node.empty()) return false
    cy.elements().unselect()
    node.select()
    return true
  }

  return {
    cy,
    render,
    relayout: () => runLayout(true),
    fit: () => cy.animate({ fit: { eles: cy.elements(), padding: 30 }, duration: 250 } as unknown as cytoscape.AnimateOptions),
    resize: () => cy.resize(),
    setTheme: (t: Theme) => cy.style(buildStyle(PALETTE[t])),
    zoomIn: () => zoomBy(1.3),
    zoomOut: () => zoomBy(1 / 1.3),
    zoomReset: () => cy.animate({ fit: { eles: cy.elements(), padding: 30 }, duration: 200 } as unknown as cytoscape.AnimateOptions),
    onZoom: (cb: (pct: number) => void) => cy.on('zoom', () => cb(Math.round(cy.zoom() * 100))),
    centerOn,
    select,
    onSelect,
    applyAsOf,
    setHeat,
    setStatus,
    setSensitivity,
    setDecision,
    setMuted,
  }
}
