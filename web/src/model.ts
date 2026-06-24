// The ThoughtML canonical model — the type contract and pure value helpers,
// with no dependency on the wasm parser. This is the seam between the *compiler*
// (which produces the canonical JSON) and the *view* (which renders it): the
// graph, detail panel, legend, and any future standalone viewer depend on these
// shapes alone, never on how the JSON was produced. The wasm adapter lives in
// `parse.ts` and imports its types from here.

export type Severity = 'error' | 'warning'
export interface Diagnostic {
  severity: Severity
  /** 1-based source line; 0 means not line-specific. */
  line: number
  message: string
}
export interface Diagnostics {
  items: Diagnostic[]
}

export type Value =
  | { kind: 'text'; value: string }
  | { kind: 'symbol'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'range'; value: [number, number] }
  | { kind: 'unknown' }
  | { kind: 'ref'; value: string }
  | { kind: 'uri'; value: string }
  | { kind: 'time'; value: string }
  | { kind: 'list'; value: string[] }

export type Fields = Record<string, Value>

/** A typed numeric measure on a focus (v0.2, Phase 7). */
export interface Quantity { value: number; unit: string; dimension: string; normalized?: number; base_unit?: string; basis?: string }

/** One outcome's contribution to an option's expected value (v0.2, Phase 9). */
export interface EvTerm { outcome: string; probability: number; payoff: number; contribution: number }
/** An option's expected-value analysis: the EV, its per-outcome breakdown, the
 *  probability mass placed on outcomes, and the worst-case downside (v0.2, Phase 9). */
export interface ExpectedValue { value: number; unit: string; dimension: string; probability_mass: number; downside: number; terms: EvTerm[] }
/** One option's expected value, ranked within a decision (v0.2, Phase 9). */
export interface OptionEV { option: string; value: number; unit: string; downside: number }
/** A decision's options ordered by expected value, highest first (v0.2, §10.6).
 *  A second reading of the author's numbers — it orders, it crowns no winner. */
export interface DecisionEV { ranked: OptionEV[] }

export interface Focus { type: 'focus'; id: string; kind?: string; quantity?: Quantity; formula?: string; computed_quantity?: Quantity; body?: string; fields?: Fields; superseded_by?: string; derived_confidence?: number; argument_status?: string; expected_value?: ExpectedValue; decision?: DecisionEV }
export interface Question {
  type: 'question'
  id: string
  body?: string
  asks_about?: string[]
  expects?: string
  status?: string
  fields?: Fields
  superseded_by?: string
}
export interface Link { type: 'link'; id: string; from: string; relation: string; to: string; weight?: number; probability?: number; basis?: string; body?: string; fields?: Fields; superseded_by?: string; derived_confidence?: number; leverage?: number; argument_status?: string }
export interface Stance {
  type: 'stance'
  id: string
  agent: string
  posture: string
  target: string
  confidence?: Value
  basis?: string
  fields?: Fields
  superseded_by?: string
}
export interface Scope { type: 'scope'; id: string; includes?: string[]; fields?: Fields }
export interface Act {
  type: 'act'
  id: string
  agent?: string
  verb: string
  args: Value[]
  expands_to?: string[]
  fields?: Fields
}
/** A profile declaration (Phase 5): the custom vocabulary a document's dialect
 *  adds. Document metadata keyed by `name` (no `id`) — deliberately kept out of
 *  `CanonObject` so it is ignored by the id-keyed graph rather than rendered. */
export interface Profile {
  type: 'profile'
  name: string
  kinds?: string[]
  relations?: string[]
  fields?: string[]
  postures?: string[]
}

export type CanonObject = Focus | Question | Link | Stance | Scope | Act
/** One dated record on the timeline spine (Phase A): `at` = valid-time instant
 *  (when in the world), `seq` = transaction position (when in the ledger). */
export interface TimelineEvent { at: string; seq: number; id: string; kind: string; agent?: string }
/** The document's time spine: earliest/latest valid timestamps (`start`/`end`,
 *  raw ISO-8601 strings) plus the ordered `events` backbone for replay. */
export interface Timeline { start: string; end: string; events?: TimelineEvent[] }
/** A mirror conflict (§10.7): where the engine's reading of the graph disagrees
 *  with what the author asserted. Distinct from diagnostics — it judges coherence,
 *  not form, and ships the conflict rather than a verdict. */
export interface Conflict { kind: string; severity: 'error' | 'warning' | 'info'; subjects: string[]; message: string }
export interface Audit { conflicts: Conflict[] }
export interface Canonical { objects: CanonObject[]; timeline?: Timeline; audit?: Audit }

export interface ParseResult {
  canonical: Canonical
  diagnostics: Diagnostics
  surface: unknown
}

/** A what-if perturbation: links/nodes to drop from the evidence/attack graphs. */
export interface Overrides {
  disabled_links?: string[]
  disabled_nodes?: string[]
}

/** Parse a (loose) ISO-8601 date/time to epoch ms, or undefined if unparseable. */
export function parseTime(s: string | undefined): number | undefined {
  if (!s) return undefined
  const t = Date.parse(s)
  return Number.isNaN(t) ? undefined : t
}

/** The instant an object was asserted: its `asserted-at`, else `observed-at`. */
export function assertedAt(o: CanonObject): number | undefined {
  const fields = 'fields' in o ? o.fields : undefined
  if (!fields) return undefined
  const pick = (name: string): number | undefined => {
    const v = fields[name]
    return v && v.kind === 'time' ? parseTime(v.value) : undefined
  }
  return pick('asserted-at') ?? pick('observed-at')
}

/** Format a confidence/value for display. */
export function formatValue(v: Value | undefined): string | undefined {
  if (!v) return undefined
  switch (v.kind) {
    case 'number': return String(v.value)
    case 'range': return `${v.value[0]}–${v.value[1]}`
    case 'unknown': return '?'
    case 'list': return v.value.join(', ')
    default: return v.value
  }
}
