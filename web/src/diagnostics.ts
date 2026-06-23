// Renders the diagnostics list rows. The status summary lives in the bar
// header; inline editor markers are handled by the editor's lint integration.

import type { Diagnostic, Conflict } from './model'
import { glyph } from './icons'

export function renderDiagnostics(
  el: HTMLElement,
  diags: Diagnostic[],
  conflicts: Conflict[],
  onJump: (line: number) => void,
): void {
  el.replaceChildren()

  // Mirror conflicts first — the engine's second reading disagreeing with the
  // author. They carry no source line; the message states said-X vs computes-Y.
  for (const c of conflicts) {
    const row = document.createElement('div')
    row.className = `diag diag-conflict diag-${c.severity}`

    const mark = document.createElement('span')
    mark.className = 'diag-line'
    mark.textContent = '⚑'

    const sev = document.createElement('span')
    sev.className = 'diag-sev'
    sev.innerHTML = `<span>conflict</span>`

    const msg = document.createElement('span')
    msg.className = 'diag-msg'
    msg.textContent = c.message

    row.append(mark, sev, msg)
    el.appendChild(row)
  }

  for (const d of [...diags].sort((a, b) => a.line - b.line)) {
    const row = document.createElement('button')
    row.className = `diag diag-${d.severity}`

    const line = document.createElement('span')
    line.className = 'diag-line'
    line.textContent = d.line > 0 ? String(d.line) : '–'

    const sev = document.createElement('span')
    sev.className = 'diag-sev'
    sev.innerHTML = `${glyph(d.severity)}<span>${d.severity}</span>`

    const msg = document.createElement('span')
    msg.className = 'diag-msg'
    msg.textContent = d.message

    row.append(line, sev, msg)
    row.addEventListener('click', () => onJump(d.line))
    el.appendChild(row)
  }
}
