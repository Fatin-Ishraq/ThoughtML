// Download the current document as a self-contained interactive HTML file — the
// browser equivalent of `thoughtml --html`. It bakes the (already fully computed)
// canonical model into the *same* single-file viewer template the CLI embeds
// (`crates/thoughtml/assets/viewer.html`), so a downloaded file and a CLI export
// are byte-for-byte the same shape. The template is fetched lazily via a `?url`
// asset, so its ~600 KB never weighs down the playground's main bundle.

import viewerTemplateUrl from '../../crates/thoughtml/assets/viewer.html?url'
import type { Canonical, SourceMap } from './model'

// The template carries two empty placeholders we fill (same markers as the CLI).
const MODEL_MARKER = 'id="thoughtml-model">'
const TITLE_MARKER = 'id="thoughtml-title">'

// Neutralize `</` so a node's body text can never close the inlined <script> tag
// early (still valid JSON). Mirrors `render_html` in the CLI.
const neutralize = (s: string): string => s.replaceAll('</', '<\\/')

/** Bake `canon` into the viewer template and trigger a download of `<title>.html`. */
export async function downloadStandalone(canon: Canonical, title: string, sourceMap?: SourceMap): Promise<void> {
  const template = await fetch(viewerTemplateUrl).then((r) => r.text())
  const model = neutralize(JSON.stringify(sourceMap ? { canonical: canon, source_map: sourceMap } : canon))
  let html = template.replace(MODEL_MARKER, MODEL_MARKER + model)
  html = html.replace(TITLE_MARKER, TITLE_MARKER + neutralize(title))

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title}.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** A filename-safe title for the document: its first scope or focus id. */
export function documentTitle(canon: Canonical): string {
  const scope = canon.objects.find((o) => o.type === 'scope')
  const focus = canon.objects.find((o) => o.type === 'focus')
  const base = scope?.id ?? focus?.id ?? 'thoughtml-document'
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'thoughtml-document'
}
