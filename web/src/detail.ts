// Node-detail panel: identity facts + computed relationships ("how this node
// affects the whole"). Relationship chips navigate to the connected node.

import { formatValue, type Canonical, type CanonObject, type DecisionEV, type ExpectedValue, type Fields, type Link, type Quantity, type Value } from './model'
import { glyph } from './icons'

/** What-if context (Phase 6): which nodes/links are muted, the unperturbed
 *  baseline to diff against, and a toggle callback. Optional — the detail panel
 *  renders fine without it. */
export interface WhatIfCtx {
  /** Whether what-if mode is on (gates the mute control). */
  enabled: boolean
  muted: Set<string>
  baseline: Canonical
  /** Whether anything is currently muted (gates the baseline-delta display). */
  active: boolean
  onToggle: (id: string) => void
}

/** The derived confidence of a node in a given model, or undefined. */
function derivedOf(canon: Canonical, id: string): number | undefined {
  const o = canon.objects.find((x) => x.id === id)
  return o && (o.type === 'focus' || o.type === 'link') ? o.derived_confidence : undefined
}

/** A row in the "load-bearing evidence" list: an incoming evidence link, its
 *  signed leverage, and a magnitude bar. Clicking navigates to the source. */
function leverageRow(l: Link, isTop: boolean, onNav: (id: string) => void): HTMLElement {
  const lev = l.leverage ?? 0
  const row = document.createElement('button')
  row.className = 'lever-row'
  row.title = `${l.from} ${l.relation} → ${l.to}`
  row.addEventListener('click', () => onNav(l.from))

  const top = document.createElement('div')
  top.className = 'lever-top'
  const name = document.createElement('span')
  name.className = 'lever-name'
  name.textContent = l.from
  if (isTop) {
    const tag = document.createElement('span')
    tag.className = 'lever-key'
    tag.textContent = 'load-bearing'
    name.appendChild(tag)
  }
  const val = document.createElement('span')
  val.className = `lever-val ${lev >= 0 ? 'pos' : 'neg'}`
  val.textContent = `${lev >= 0 ? '+' : '−'}${Math.abs(lev).toFixed(3)}`
  top.append(name, val)

  const track = document.createElement('div')
  track.className = 'lever-track'
  const fill = document.createElement('div')
  fill.className = `lever-fill ${lev >= 0 ? 'pos' : 'neg'}`
  // |leverage| ~0..0.4 maps to the full bar; clamp so a huge swing still fits.
  fill.style.width = `${Math.max(4, Math.min(1, Math.abs(lev) / 0.4) * 100)}%`
  track.appendChild(fill)

  row.append(top, track)
  return row
}

/** Format a number for display: thousands separators, up to 6 decimals. */
function formatNum(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

/** The headline measure block for a focus (Phase 7): value + unit, dimension,
 *  and the normalized base-unit value where the unit converts. An optional
 *  `label` ("authored" / "computed") distinguishes the two when both are shown. */
function quantityFact(q: Quantity, label?: string): HTMLElement {
  const wrap = document.createElement('div')
  const variant = label === 'computed' ? ' computed' : label === 'expected value' ? ' ev' : ''
  wrap.className = `detail-quantity${variant}`
  if (label) {
    const tag = document.createElement('div')
    tag.className = 'quantity-label'
    tag.textContent = label
    wrap.appendChild(tag)
  }
  const main = document.createElement('div')
  main.className = 'quantity-main'
  main.innerHTML = `<span class="quantity-value">${formatNum(q.value)}</span><span class="quantity-unit">${q.unit}</span>`
  const meta = document.createElement('div')
  meta.className = 'quantity-meta'
  const dim = q.dimension.split(':')[0]
  // `1` is the dimensionless base (a ratio/fraction) — show the number bare.
  const baseLabel = q.base_unit && q.base_unit !== '1' ? ` ${q.base_unit}` : ''
  const dimMeta = q.normalized !== undefined ? `${dim} · ${formatNum(q.normalized)}${baseLabel}` : dim
  // Provenance (v0.1.0): how the number was arrived at, when declared.
  meta.textContent = q.basis ? `${dimMeta} · ${q.basis}` : dimMeta
  wrap.append(main, meta)
  return wrap
}

/** The authored formula expression for a focus (Phase 8): the `= expr` source. */
function formulaFact(expr: string): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'detail-formula'
  const eq = document.createElement('span')
  eq.className = 'formula-eq'
  eq.textContent = '='
  const code = document.createElement('span')
  code.className = 'formula-expr'
  code.textContent = expr
  wrap.append(eq, code)
  return wrap
}

/** The expected-value ordering on a decision focus (§10.6): its options, highest
 *  EV first, each with a bar scaled across the field. This is the engine's second
 *  reading of the author's numbers — it shows the EVs and orders them, it crowns
 *  no winner. Each row navigates to the option. */
function decisionRanking(dec: DecisionEV, onNav: (id: string) => void): HTMLElement {
  const list = document.createElement('div')
  list.className = 'ev-rows'
  const vals = dec.ranked.map((e) => e.value)
  const min = Math.min(...vals)
  const span = Math.max(...vals) - min || 1 // avoid /0 when all equal
  for (const e of dec.ranked) {
    const row = document.createElement('button')
    row.className = 'ev-row'
    row.title = e.option
    row.addEventListener('click', () => onNav(e.option))

    const top = document.createElement('div')
    top.className = 'ev-top'
    const name = document.createElement('span')
    name.className = 'ev-name'
    name.textContent = e.option
    const val = document.createElement('span')
    val.className = 'ev-val'
    val.textContent = `${formatNum(e.value)}${e.unit ? ` ${e.unit}` : ''}`
    top.append(name, val)

    const track = document.createElement('div')
    track.className = 'ev-track'
    const fill = document.createElement('div')
    fill.className = 'ev-fill'
    // Normalize across the option field so the highest EV fills the bar, the lowest barely.
    fill.style.width = `${Math.max(6, ((e.value - min) / span) * 100)}%`
    track.appendChild(fill)

    row.append(top, track)
    list.appendChild(row)
  }
  return list
}

/** The per-outcome breakdown of an option's expected value (Phase 9): each
 *  outcome's `probability × payoff = contribution`, plus the probability mass and
 *  worst-case downside. Rows navigate to the outcome. */
function evBreakdown(ev: ExpectedValue, onNav: (id: string) => void): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'ev-breakdown'
  for (const t of ev.terms) {
    const row = document.createElement('button')
    row.className = 'ev-term'
    row.title = t.outcome
    row.addEventListener('click', () => onNav(t.outcome))
    const name = document.createElement('span')
    name.className = 'ev-term-name'
    name.textContent = t.outcome
    const calc = document.createElement('span')
    calc.className = 'ev-term-calc'
    calc.textContent = `${t.probability} × ${formatNum(t.payoff)} = ${formatNum(t.contribution)}`
    row.append(name, calc)
    wrap.appendChild(row)
  }
  const foot = document.createElement('div')
  foot.className = 'ev-foot'
  const massPct = Math.round(ev.probability_mass * 100)
  const mass =
    ev.probability_mass < 0.999 ? `mass ${ev.probability_mass} · ${100 - massPct}% unmodeled`
    : ev.probability_mass > 1.001 ? `mass ${ev.probability_mass} · exceeds 1`
    : `mass ${ev.probability_mass}`
  foot.textContent = `${mass} · worst-case ${formatNum(ev.downside)}${ev.unit ? ` ${ev.unit}` : ''}`
  wrap.appendChild(foot)
  return wrap
}

export function kindOf(canon: Canonical, id: string): string {
  if (id.startsWith('agent:')) return 'agent'
  const o = canon.objects.find((x) => x.id === id)
  return o ? o.type : 'missing'
}

export function labelOf(id: string): string {
  return id.startsWith('agent:') ? id.slice(6) : id
}

/** The authored confidence on a node: the first non-superseded stance that
 *  targets it and carries a confidence. Used to contrast with the derived one. */
function authoredConfidence(canon: Canonical, id: string): Value | undefined {
  for (const o of canon.objects) {
    if (o.type === 'stance' && o.target === id && !o.superseded_by && o.confidence) return o.confidence
  }
  return undefined
}

type Chip = { label: string; navId: string; glyph?: string }
type Group = { title: string; chips: Chip[] }

function relationGroups(canon: Canonical, id: string): Group[] {
  const objects = canon.objects
  const groups: Record<string, Chip[]> = {}
  const add = (title: string, label: string, navId: string, glyphName?: string) => {
    ;(groups[title] ??= []).push({ label, navId, glyph: glyphName })
  }

  if (id.startsWith('agent:')) {
    const name = id.slice(6)
    for (const o of objects) {
      if (o.type === 'stance' && o.agent === name) {
        const c = formatValue(o.confidence)
        add('Asserts', `${o.posture} ${o.target}${c ? ` · ${c}` : ''}`, o.target, o.posture)
      }
    }
    return toOrdered(groups, ['Asserts'])
  }

  for (const o of objects) {
    if (o.type === 'link') {
      if (o.from === id) add('Points to', `${o.relation} → ${o.to}`, o.to)
      if (o.to === id) add('Pointed at by', `${o.from} → ${o.relation}`, o.from)
    } else if (o.type === 'stance') {
      if (o.target === id) {
        const c = formatValue(o.confidence)
        add('Stances on this', `${o.agent} ${o.posture}${c ? ` · ${c}` : ''}`, `agent:${o.agent}`, o.posture)
      }
    } else if (o.type === 'question') {
      o.asks_about?.forEach((r) => { if (r === id) add('Questioned by', o.id, o.id) })
    } else if (o.type === 'scope') {
      o.includes?.forEach((r) => {
        if (r === id) add('In scope', o.id, o.id) // viewing a member → its scope
        if (o.id === id) add('Contains', r, r) // viewing the scope → its members
      })
    }
    // Supersession (v0.2, Phase 3): `o.superseded_by === id` means this node
    // revises `o`; chips navigate the revision history in both directions.
    if ('superseded_by' in o && o.superseded_by === id) add('Revises', o.id, o.id)
  }
  const self = objects.find((x) => x.id === id)
  if (self && 'superseded_by' in self && self.superseded_by) {
    add('Superseded by', self.superseded_by, self.superseded_by)
  }
  return toOrdered(groups, ['Points to', 'Pointed at by', 'Stances on this', 'Revises', 'Superseded by', 'Questioned by', 'Contains', 'In scope'])
}

function toOrdered(groups: Record<string, Chip[]>, order: string[]): Group[] {
  return order.filter((t) => groups[t]?.length).map((t) => ({ title: t, chips: groups[t] }))
}

function fieldsList(fields: Fields | undefined): HTMLElement | null {
  if (!fields || Object.keys(fields).length === 0) return null
  const dl = document.createElement('dl')
  dl.className = 'detail-fields'
  for (const [name, value] of Object.entries(fields)) {
    const dt = document.createElement('dt')
    dt.textContent = name
    const dd = document.createElement('dd')
    dd.textContent = formatValue(value as Value) ?? ''
    dl.append(dt, dd)
  }
  return dl
}

// A labelled 0–1 bar, reused for stance `confidence` and link `weight`. `basis`
// (v0.1.0) is the number's declared provenance — measured/estimated/assumed.
function meterBar(value: Value | undefined, title = 'confidence', accent?: string, basis?: string): HTMLElement | null {
  if (!value) return null
  let lo = 0
  let hi = 0
  let label = ''
  if (value.kind === 'number') { lo = hi = value.value; label = String(value.value) }
  else if (value.kind === 'range') { lo = value.value[0]; hi = value.value[1]; label = `${lo}–${hi}` }
  else if (value.kind === 'unknown') { label = 'unknown' }
  else return null

  const wrap = document.createElement('div')
  wrap.className = 'conf'
  const lab = document.createElement('div')
  lab.className = 'conf-label'
  const titleText = basis ? `${title} · ${basis}` : title
  lab.innerHTML = `<span>${titleText}</span><span>${label}</span>`
  const track = document.createElement('div')
  track.className = 'conf-track'
  const fill = document.createElement('div')
  fill.className = 'conf-fill'
  if (value.kind === 'unknown') {
    fill.classList.add('unknown')
  } else {
    fill.style.left = `${lo * 100}%`
    fill.style.width = `${Math.max(2, (hi - lo) * 100)}%`
  }
  if (accent) fill.style.background = accent
  track.appendChild(fill)
  wrap.append(lab, track)
  return wrap
}

function section(title: string): HTMLElement {
  const h = document.createElement('div')
  h.className = 'detail-section-title'
  h.textContent = title
  return h
}

export function renderDetail(
  bodyEl: HTMLElement,
  canon: Canonical,
  id: string,
  onNav: (id: string) => void,
  whatIf?: WhatIfCtx,
): void {
  bodyEl.replaceChildren()
  const obj: CanonObject | undefined = canon.objects.find((x) => x.id === id)

  // What-if control (Phase 6): mute a focus or link to drop it from the evidence
  // and attack graphs, then watch every derived value recompute.
  if (whatIf?.enabled && obj && (obj.type === 'focus' || obj.type === 'link')) {
    const isMuted = whatIf.muted.has(id)
    const btn = document.createElement('button')
    btn.className = `whatif-toggle${isMuted ? ' active' : ''}`
    btn.innerHTML = `<span>${isMuted ? 'Restore to graph' : 'Mute in what-if'}</span>`
    btn.addEventListener('click', () => whatIf.onToggle(id))
    bodyEl.appendChild(btn)
  }

  const makeChip = (label: string, navId: string, glyphName?: string) => {
    const b = document.createElement('button')
    b.className = `chip chip-${kindOf(canon, navId)}`
    const g = glyphName ? glyph(glyphName) : ''
    b.innerHTML = `${g ? `<span class="chip-glyph">${g}</span>` : ''}<span class="chip-label">${label}</span>`
    b.title = navId
    b.addEventListener('click', () => onNav(navId))
    return b
  }

  // ---- identity facts ----
  const facts = document.createElement('div')
  facts.className = 'detail-facts'

  if (id.startsWith('agent:')) {
    const p = document.createElement('p')
    p.className = 'detail-note'
    p.textContent = 'Agent — an actor that holds stances.'
    facts.appendChild(p)
  } else if (!obj) {
    const p = document.createElement('p')
    p.className = 'detail-note'
    p.textContent = 'Unresolved reference — not declared in this document.'
    facts.appendChild(p)
  } else {
    if (obj.type === 'focus' && obj.kind) {
      const k = document.createElement('div')
      k.className = 'detail-kind'
      k.innerHTML = `${glyph(obj.kind)}<span>${obj.kind}</span>`
      facts.appendChild(k)
    }
    // Typed measure (Phase 7) and/or formula (Phase 8): the authored value, the
    // `= expr` it's computed from, and the computed result — shown side by side
    // so authored and computed never get conflated.
    if (obj.type === 'focus') {
      const labelled = !!obj.computed_quantity || !!obj.formula
      if (obj.quantity) facts.appendChild(quantityFact(obj.quantity, labelled ? 'authored' : undefined))
      if (obj.formula) facts.appendChild(formulaFact(obj.formula))
      if (obj.computed_quantity) facts.appendChild(quantityFact(obj.computed_quantity, 'computed'))
      // An option's expected value (Phase 9): the probability-weighted payoff.
      if (obj.expected_value) facts.appendChild(quantityFact(obj.expected_value, 'expected value'))
    }
    if ('superseded_by' in obj && obj.superseded_by) {
      const s = document.createElement('div')
      s.className = 'detail-superseded'
      s.innerHTML = `<span class="strike">${labelOf(id)}</span> · revised`
      facts.appendChild(s)
    }
    // Grounded argument status (Phase 5): does this claim survive the attacks?
    if ((obj.type === 'focus' || obj.type === 'link') && obj.argument_status) {
      const labels: Record<string, string> = { in: 'accepted', out: 'defeated', undecided: 'undecided' }
      const s = document.createElement('div')
      s.className = `detail-status status-${obj.argument_status}`
      s.textContent = labels[obj.argument_status] ?? obj.argument_status
      facts.appendChild(s)
    }
    if ('body' in obj && obj.body) {
      const p = document.createElement('p')
      p.className = 'detail-body-text'
      p.textContent = obj.body
      facts.appendChild(p)
    }
    if (obj.type === 'link') {
      const row = document.createElement('div')
      row.className = 'detail-relation'
      row.append(makeChip(obj.from, obj.from), tag(obj.relation), makeChip(obj.to, obj.to))
      facts.appendChild(row)
      if (obj.weight !== undefined) {
        const wb = meterBar({ kind: 'number', value: obj.weight }, 'strength', 'var(--c-link)', obj.basis)
        if (wb) facts.appendChild(wb)
      }
      // Outcome probability on a `leads-to` edge (Phase 9).
      if (obj.probability !== undefined) {
        const pb = meterBar({ kind: 'number', value: obj.probability }, 'probability', 'var(--accent)', obj.basis)
        if (pb) facts.appendChild(pb)
      }
    }
    if (obj.type === 'stance') {
      const row = document.createElement('div')
      row.className = 'detail-relation'
      row.append(makeChip(obj.agent, `agent:${obj.agent}`), tag(obj.posture, obj.posture), makeChip(obj.target, obj.target))
      facts.appendChild(row)
      const cb = meterBar(obj.confidence, 'confidence', undefined, obj.basis)
      if (cb) facts.appendChild(cb)
    }
    if (obj.type === 'question') {
      const meta = [obj.expects && `expects ${obj.expects}`, obj.status && `status ${obj.status}`].filter(Boolean)
      if (meta.length) {
        const row = document.createElement('div')
        row.className = 'detail-meta'
        meta.forEach((m) => row.appendChild(tag(m as string)))
        facts.appendChild(row)
      }
    }
    // Evidence-derived confidence (Phase 4): shown beside the authored value so
    // the contrast — "what the evidence supports" vs "what was claimed" — reads
    // at a glance. These are deliberately separate facts.
    if ((obj.type === 'focus' || obj.type === 'link') && obj.derived_confidence !== undefined) {
      facts.appendChild(section('Confidence'))
      const authored = authoredConfidence(canon, id)
      if (authored) {
        const ab = meterBar(authored, 'authored', 'var(--c-stance)')
        if (ab) facts.appendChild(ab)
      }
      const label = whatIf?.active ? 'from evidence (what-if)' : 'from evidence'
      const db = meterBar({ kind: 'number', value: obj.derived_confidence }, label, 'var(--accent)')
      if (db) facts.appendChild(db)
      // When a what-if is live, show how this value moved from the baseline.
      const base = whatIf?.active ? derivedOf(whatIf.baseline, id) : undefined
      if (base !== undefined && Math.abs(base - obj.derived_confidence) >= 0.001) {
        const delta = obj.derived_confidence - base
        const d = document.createElement('div')
        d.className = `detail-delta ${delta >= 0 ? 'pos' : 'neg'}`
        d.textContent = `was ${base.toFixed(3)} · ${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(3)}`
        facts.appendChild(d)
      }
    }

    const fl = fieldsList('fields' in obj ? obj.fields : undefined)
    if (fl) facts.appendChild(fl)
  }
  bodyEl.appendChild(facts)

  // ---- decision ranking (Phase 9) ----
  // On a decision, show its options ordered by expected value. This is the
  // engine's second reading of the author's numbers — it orders them, it
  // crowns no winner; the graph's Decision lens marks the same options.
  if (obj && obj.type === 'focus' && obj.decision) {
    bodyEl.appendChild(section('Options by expected value'))
    bodyEl.appendChild(decisionRanking(obj.decision, onNav))
  }

  // ---- expected-value breakdown (Phase 9) ----
  // On an option, show how each outcome contributes to its EV, plus the
  // probability mass and the downside.
  if (obj && obj.type === 'focus' && obj.expected_value && obj.expected_value.terms.length) {
    bodyEl.appendChild(section('Outcomes'))
    bodyEl.appendChild(evBreakdown(obj.expected_value, onNav))
  }

  // ---- load-bearing evidence (Phase 6) ----
  // For a claim, list the evidence pointing at it ranked by leverage — how much
  // confidence it would lose if that one link were removed. The top edge is the
  // one the conclusion most rests on.
  if (obj && (obj.type === 'focus' || obj.type === 'link')) {
    const incoming = canon.objects.filter(
      (o): o is Link => o.type === 'link' && o.to === id && o.leverage !== undefined,
    )
    if (incoming.length) {
      incoming.sort((a, b) => Math.abs(b.leverage ?? 0) - Math.abs(a.leverage ?? 0))
      bodyEl.appendChild(section('Load-bearing evidence'))
      const list = document.createElement('div')
      list.className = 'levers'
      incoming.forEach((l, i) => list.appendChild(leverageRow(l, i === 0 && incoming.length > 1, onNav)))
      bodyEl.appendChild(list)
    }
  }

  // ---- relationships ----
  const groups = relationGroups(canon, id)
  if (groups.length === 0) {
    const p = document.createElement('p')
    p.className = 'detail-note'
    p.textContent = 'No connections in the graph.'
    bodyEl.appendChild(p)
  } else {
    for (const g of groups) {
      bodyEl.appendChild(section(g.title))
      const chips = document.createElement('div')
      chips.className = 'chips'
      g.chips.forEach((c) => chips.appendChild(makeChip(c.label, c.navId, c.glyph)))
      bodyEl.appendChild(chips)
    }
  }
}

function tag(text: string, glyphName?: string): HTMLElement {
  const s = document.createElement('span')
  s.className = 'detail-tag'
  const g = glyphName ? glyph(glyphName) : ''
  s.innerHTML = `${g}<span>${text}</span>`
  return s
}
