// CodeMirror 6 editor with a lightweight ThoughtML highlight mode, theme-aware
// styling, and externally-driven lint diagnostics.

import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint'
import type { Diagnostic } from './model'
import type { Theme } from './graph'

const RECORD_KEYWORDS = new Set(['focus', 'link', 'stance', 'scope', 'question'])
const POSTURES = new Set([
  'noticed', 'considers', 'suspects', 'infers', 'asks', 'holds',
  'chooses', 'rejects', 'revises', 'remembers', 'doubts', 'accepts',
])
const RELATIONS = new Set([
  'supports', 'opposes', 'undercuts', 'answers', 'causes', 'enables',
  'prevents', 'depends-on', 'blocks', 'revises',
])
const FIELDS = new Set([
  'note', 'kind', 'about', 'weight', 'confidence', 'because', 'answers', 'expects',
  'status', 'until', 'source', 'observed-at', 'asserted-at', 'valid-during',
  'noted-by', 'noticed-by', 'suspected-by', 'chosen-by', 'blocked-by', 'undercut-by',
])
const CONNECTORS = new Set(['as', 'from'])

const thoughtmlLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.sol() && stream.match(/^\s*#/)) {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.eatSpace()) return null
    if (stream.peek() === '#') {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string'
    if (stream.match(/^uri:[^\s]+/)) return 'string'
    if (stream.match(/^\d+(?:\.\d+)?\.\.\d+(?:\.\d+)?/)) return 'number'
    if (stream.match(/^\d+(?:\.\d+)?/)) return 'number'
    if (stream.match(/^\?(?=\s|$)/)) return 'atom'

    const word = stream.match(/^[a-z][a-z0-9-]*/) as RegExpMatchArray | null
    if (word) {
      const w = word[0]
      if (RECORD_KEYWORDS.has(w)) return 'keyword'
      if (POSTURES.has(w)) return 'keyword'
      if (CONNECTORS.has(w)) return 'keyword'
      if (RELATIONS.has(w)) return 'operator'
      if (FIELDS.has(w)) return 'propertyName'
      return 'variableName'
    }
    stream.next()
    return null
  },
  languageData: { commentTokens: { line: '#' } },
})

// Syntax colours: each token type gets a distinct, legible hue — keywords blue,
// relations teal, fields gold, strings lime, numbers plum. Identifiers and the
// free-text inside node bodies read as plain foreground, so the highlighted
// tokens (the structure) stand out instead of drowning everything in one colour.
const darkHighlight = HighlightStyle.define([
  { tag: t.comment, color: '#6f6a63', fontStyle: 'italic' },
  { tag: t.keyword, color: '#5cb0ff' },
  { tag: t.operator, color: '#34cdb8' },
  { tag: t.propertyName, color: '#e8b84a' },
  { tag: t.number, color: '#cf8fd4' },
  { tag: t.atom, color: '#cf8fd4' },
  { tag: t.string, color: '#a6d957' },
  { tag: t.variableName, color: '#f5f4f2' },
])

// Warm parchment ("light" slot) — distinct deepened hues per token type
// (keywords blue, relations teal, fields amber, strings olive, numbers plum);
// identifiers and node-body prose stay plain ink so the structure stands out.
const lightHighlight = HighlightStyle.define([
  { tag: t.comment, color: '#9a8f76', fontStyle: 'italic' },
  { tag: t.keyword, color: '#2c66c4' },
  { tag: t.operator, color: '#0d7e70' },
  { tag: t.propertyName, color: '#9a6a10' },
  { tag: t.number, color: '#8f3f71' },
  { tag: t.atom, color: '#8f3f71' },
  { tag: t.string, color: '#5a7d1e' },
  { tag: t.variableName, color: '#463d2d' },
])

const makeTheme = (dark: boolean) =>
  EditorView.theme(
    {
      '&': { color: 'var(--text)', backgroundColor: 'transparent', height: '100%' },
      '.cm-content': { caretColor: 'var(--accent)' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
      '.cm-gutters': { backgroundColor: 'var(--bg-panel)', color: 'var(--text-faint)', border: 'none' },
      '.cm-activeLine': { backgroundColor: 'var(--accent-dim)' },
      '.cm-activeLineGutter': { backgroundColor: 'var(--accent-dim)', color: 'var(--text-dim)' },
      '.cm-selectionBackground, ::selection': { backgroundColor: 'var(--accent-dim)' },
      '&.cm-focused': { outline: 'none' },
      '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--accent-dim)' },
    },
    { dark },
  )

function themeExtensions(theme: Theme) {
  return theme === 'dark'
    ? [makeTheme(true), syntaxHighlighting(darkHighlight)]
    : [makeTheme(false), syntaxHighlighting(lightHighlight)]
}

export interface EditorHandle {
  view: EditorView
  getValue(): string
  setValue(text: string): void
  setDiagnostics(diags: Diagnostic[]): void
  setTheme(theme: Theme): void
  gotoLine(line: number): void
}

export function createEditor(
  parent: HTMLElement,
  doc: string,
  onChange: (value: string) => void,
  initialTheme: Theme,
): EditorHandle {
  const themeComp = new Compartment()

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        lintGutter(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        thoughtmlLanguage,
        themeComp.of(themeExtensions(initialTheme)),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString())
        }),
      ],
    }),
  })

  function gotoLine(line: number) {
    const d = view.state.doc
    if (line < 1 || d.lines === 0) return
    const l = d.line(Math.min(line, d.lines))
    view.dispatch({ selection: { anchor: l.from }, scrollIntoView: true })
    view.focus()
  }

  function setValue(text: string) {
    if (text === view.state.doc.toString()) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
  }

  function applyDiagnostics(diags: Diagnostic[]) {
    const d = view.state.doc
    const cm: CmDiagnostic[] = diags.map((diag) => {
      const lineNo = Math.min(Math.max(diag.line, 1), d.lines)
      const line = d.line(lineNo)
      return { from: line.from, to: line.to, severity: diag.severity, message: diag.message }
    })
    view.dispatch(setDiagnostics(view.state, cm))
  }

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue,
    setDiagnostics: applyDiagnostics,
    setTheme: (theme: Theme) => view.dispatch({ effects: themeComp.reconfigure(themeExtensions(theme)) }),
    gotoLine,
  }
}
