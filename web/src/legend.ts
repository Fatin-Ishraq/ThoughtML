// The visual key — node-type swatches, the relation vocabulary with inline edge
// samples, and the per-lens scale. Pure view: it depends only on the palette
// exposed by `graph.ts`, so both the playground and the standalone viewer share
// one legend rather than each maintaining its own.

import { legendItems, relationLegend, type Theme } from './graph'

/** Fill `container` with the legend: node types, then the relation vocabulary
 *  (each row a coloured edge sample ending in the relation's arrowhead). */
export function buildLegend(container: HTMLElement, theme: Theme): void {
  container.replaceChildren()
  const section = (title: string, rows: string[]) => {
    const wrap = document.createElement('div')
    wrap.className = 'legend-group'
    wrap.innerHTML = `<div class="legend-title">${title}</div>` +
      rows.map((r) => `<div class="legend-row">${r}</div>`).join('')
    container.appendChild(wrap)
  }
  section('Node types', legendItems(theme).map(({ label, color }) =>
    `<span class="legend-swatch" style="background:${color}"></span>${label}`))
  section('Links', relationLegend(theme).map(({ label, color, arrow, line }) =>
    `${relSample(color, arrow, line)}<span>${label}</span>`))
}

/** Fill `container` with the active lens's scale/key, or hide it for the plain
 *  Type lens. Mirrors the overlays in `graph.ts` (heat / status / sensitivity /
 *  decision). */
export function buildLensKey(container: HTMLElement, lens: string): void {
  if (lens === 'evidence') {
    container.innerHTML = '<div class="lens-key-title">Derived confidence</div>'
      + '<div class="lens-scale"><span class="sw" style="background:var(--error)"></span><span class="sw" style="background:var(--warning)"></span><span class="sw" style="background:var(--ok)"></span></div>'
      + '<div class="lens-scale-ends"><span>weak</span><span>strong</span></div>'
  } else if (lens === 'argument') {
    const rows: Array<[string, string]> = [['var(--ok)', 'accepted'], ['var(--error)', 'defeated'], ['var(--warning)', 'undecided']]
    container.innerHTML = '<div class="lens-key-title">Argument status</div>'
      + rows.map(([c, l]) => `<div class="lens-key-row"><span class="sw" style="background:${c}"></span>${l}</div>`).join('')
  } else if (lens === 'sensitivity') {
    container.innerHTML = '<div class="lens-key-title">Load-bearing evidence</div>'
      + '<div class="lens-key-row"><span class="lens-bar thin"></span>barely matters</div>'
      + '<div class="lens-key-row"><span class="lens-bar thick"></span>holds it up</div>'
  } else if (lens === 'decision') {
    container.innerHTML = '<div class="lens-key-title">Decision EV</div>'
      + '<div class="lens-key-row"><span class="sw" style="background:var(--accent)"></span>decision</div>'
      + '<div class="lens-key-row"><span class="sw" style="background:var(--text-dim)"></span>option weighed</div>'
  }
  container.hidden = lens === 'type'
}

// A tiny inline edge sample for the legend: a coloured line ending in the
// relation's arrowhead (triangle / tee / open vee / diamond / circle), matching
// the graph's own edge styling.
export function relSample(color: string, arrow: string, line: string): string {
  const y = 6, x = 26
  const dash = line === 'dashed' ? ' stroke-dasharray="4 3"' : ''
  const lineEnd = arrow === 'tee' ? x : x - 6
  let head = ''
  if (arrow === 'triangle') head = `<polygon points="${x - 7},${y - 3.5} ${x},${y} ${x - 7},${y + 3.5}" fill="${color}"/>`
  else if (arrow === 'tee') head = `<line x1="${x}" y1="${y - 5}" x2="${x}" y2="${y + 5}" stroke="${color}" stroke-width="2.4"/>`
  else if (arrow === 'vee') head = `<polyline points="${x - 7},${y - 3.5} ${x},${y} ${x - 7},${y + 3.5}" fill="none" stroke="${color}" stroke-width="1.8"/>`
  else if (arrow === 'diamond') head = `<polygon points="${x - 8},${y} ${x - 4},${y - 3.5} ${x},${y} ${x - 4},${y + 3.5}" fill="${color}"/>`
  else if (arrow === 'circle') head = `<circle cx="${x - 3}" cy="${y}" r="3" fill="${color}"/>`
  return `<svg class="legend-edge" width="30" height="12" viewBox="0 0 30 12" aria-hidden="true"><line x1="2" y1="${y}" x2="${lineEnd}" y2="${y}" stroke="${color}" stroke-width="1.8"${dash}/>${head}</svg>`
}
