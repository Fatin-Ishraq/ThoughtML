// Inline SVG icons (Lucide-style), injected via innerHTML.

const wrap = (inner: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

export const ICONS: Record<string, string> = {
  moon: wrap('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  sun: wrap(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  ),
  fit: wrap('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  relayout: wrap('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'),
  braces: wrap(
    '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>',
  ),
  legend: wrap(
    '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  ),
  close: wrap('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  copy: wrap('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  chevron: wrap('<polyline points="6 9 12 15 18 9"/>'),
  plus: wrap('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  minus: wrap('<line x1="5" y1="12" x2="19" y2="12"/>'),
  external: wrap('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'),
  heat: wrap('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>'),
  scale: wrap('<path d="M12 3v18M7 21h10M5.5 7h13M6.5 7 3 14c0 1.1 1.6 2 3.5 2s3.5-.9 3.5-2L6.5 7Zm11 0L14 14c0 1.1 1.6 2 3.5 2s3.5-.9 3.5-2l-3.5-7Z"/>'),
  // What-if: a beaker — perturb the inputs and watch the argument recompute.
  flask: wrap('<path d="M9 3h6M10 3v6.5L4.8 18A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-3L14 9.5V3"/><line x1="7.5" y1="14" x2="16.5" y2="14"/>'),
}

/** Set an element's icon by name. */
export function setIcon(el: Element | null, name: string): void {
  if (el) el.innerHTML = ICONS[name] ?? ''
}

// Concept glyphs — one per posture, focus kind, and diagnostic severity — so
// the reasoning vocabulary reads as icons, not just text, across the detail
// panel, legend, and diagnostics.
export const GLYPHS: Record<string, string> = {
  // postures
  noticed: wrap('<circle cx="12" cy="12" r="3"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/>'),
  considers: wrap('<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2Z"/>'),
  suspects: wrap('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  infers: wrap('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>'),
  asks: wrap('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"/><path d="M12 17h.01"/>'),
  holds: wrap('<circle cx="12" cy="5" r="2"/><path d="M12 7v14"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>'),
  chooses: wrap('<path d="M20 6 9 17l-5-5"/>'),
  rejects: wrap('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>'),
  revises: wrap('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>'),
  remembers: wrap('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>'),
  doubts: wrap('<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>'),
  accepts: wrap('<circle cx="12" cy="12" r="10"/><path d="m8.5 12 2.5 2.5 4.5-4.5"/>'),
  // focus kinds
  observation: wrap('<circle cx="12" cy="12" r="3"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/>'),
  claim: wrap('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  hypothesis: wrap('<path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/>'),
  option: wrap('<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1.3"/><circle cx="4.5" cy="12" r="1.3"/><circle cx="4.5" cy="18" r="1.3"/>'),
  decision: wrap('<path d="M9 11l3 3L20 6"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  goal: wrap('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
  memory: wrap('<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>'),
  assumption: wrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  // diagnostic severities
  error: wrap('<circle cx="12" cy="12" r="10"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12" y2="16.6"/>'),
  warning: wrap('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
}

/** Raw SVG markup for a concept glyph, or '' if there is none. */
export function glyph(name: string): string {
  return GLYPHS[name] ?? ''
}
