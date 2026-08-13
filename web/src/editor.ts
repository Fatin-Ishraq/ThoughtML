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

const RECORD_KEYWORDS = new Set([
  'focus', 'link', 'stance', 'scope', 'question', 'profile', 'import',
  'observation', 'claim', 'hypothesis', 'assumption', 'option', 'decision',
  'goal', 'action', 'outcome', 'memory',
])
const POSTURES = new Set([
  'noticed', 'considers', 'suspects', 'infers', 'asks', 'holds',
  'chooses', 'rejects', 'revises', 'remembers', 'doubts', 'accepts',
])
const RELATIONS = new Set([
  'supports', 'opposes', 'undercuts', 'answers', 'causes', 'enables',
  'prevents', 'depends-on', 'blocks', 'revises',
  'leads-to', 'option-of', 'part-of', 'candidate-for',
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
  activeFile(): string
  getValue(): string
  reset(file: string, text: string): void
  openFile(file: string, text: string): void
  replaceFile(file: string, text: string): void
  renameFile(from: string, to: string): void
  removeFile(file: string): void
  setDiagnostics(diags: Diagnostic[]): void
  setTheme(theme: Theme): void
  gotoLine(line: number): void
}

export function createEditor(
  parent: HTMLElement,
  initialFile: string,
  doc: string,
  onChange: (file: string, value: string) => void,
  initialTheme: Theme,
): EditorHandle {
  const themeComp = new Compartment()
  const states = new Map<string, EditorState>()
  const scrollPositions = new Map<string, number>()
  let currentFile = initialFile
  let currentTheme = initialTheme
  let suppressChanges = false

  const makeState = (text: string) => EditorState.create({
    doc: text,
    extensions: [
      lineNumbers(),
      lintGutter(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      thoughtmlLanguage,
      themeComp.of(themeExtensions(currentTheme)),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !suppressChanges) onChange(currentFile, u.state.doc.toString())
      }),
    ],
  })

  const view = new EditorView({
    parent,
    state: makeState(doc),
  })

  function gotoLine(line: number) {
    const d = view.state.doc
    if (line < 1 || d.lines === 0) return
    const l = d.line(Math.min(line, d.lines))
    view.dispatch({ selection: { anchor: l.from }, scrollIntoView: true })
    view.focus()
  }

  function replaceActive(text: string) {
    if (text === view.state.doc.toString()) return
    suppressChanges = true
    try {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    } finally {
      suppressChanges = false
    }
  }

  function openFile(file: string, text: string) {
    if (file === currentFile) {
      replaceActive(text)
      return
    }
    states.set(currentFile, view.state)
    scrollPositions.set(currentFile, view.scrollDOM.scrollTop)
    currentFile = file
    const state = states.get(file)
    view.setState(state && state.doc.toString() === text ? state : makeState(text))
    view.dispatch({ effects: themeComp.reconfigure(themeExtensions(currentTheme)) })
    window.requestAnimationFrame(() => {
      view.scrollDOM.scrollTop = scrollPositions.get(file) ?? 0
    })
  }

  function replaceFile(file: string, text: string) {
    if (file === currentFile) {
      replaceActive(text)
      return
    }
    const previous = states.get(file)
    if (previous?.doc.toString() === text) return
    states.set(file, makeState(text))
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
    activeFile: () => currentFile,
    getValue: () => view.state.doc.toString(),
    reset: (file, text) => {
      states.clear()
      scrollPositions.clear()
      currentFile = file
      view.setState(makeState(text))
    },
    openFile,
    replaceFile,
    renameFile: (from, to) => {
      const state = states.get(from)
      if (state) {
        states.delete(from)
        states.set(to, state)
      }
      const scroll = scrollPositions.get(from)
      if (scroll !== undefined) {
        scrollPositions.delete(from)
        scrollPositions.set(to, scroll)
      }
      if (currentFile === from) currentFile = to
    },
    removeFile: (file) => {
      states.delete(file)
      scrollPositions.delete(file)
    },
    setDiagnostics: applyDiagnostics,
    setTheme: (theme: Theme) => {
      currentTheme = theme
      view.dispatch({ effects: themeComp.reconfigure(themeExtensions(theme)) })
    },
    gotoLine,
  }
}
