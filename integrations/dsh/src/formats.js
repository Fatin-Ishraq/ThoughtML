import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export const SUPPORTED_FORMATS = Object.freeze(['thoughtml', 'markdown'])

export const MARKDOWN_HEADINGS = Object.freeze([
  '# Current Goal',
  '## Evidence',
  '## Current Hypothesis',
  '## Superseded',
  '## Actions and Results',
  '## Unresolved',
  '## Next Action',
  '## Uncertainty',
])

const INITIAL_THOUGHTML = `claim reasoning-state
  Persistent reasoning state for this agent session.

observation session-start
  Persistent reasoning state was initialized for this agent session.

claim current-goal
  Establish the concrete task goal from the user's request.

claim current-hypothesis
  The task requirements still need to be established.

claim superseded-none
  No belief has been superseded.

action session-initialized
  Session state was initialized.

question unresolved-exact-outcome
  What exact outcome does the user require?

action next-action
  Read the request and establish the concrete goal.

claim uncertainty
  Initial state; confidence is low until the request is analyzed.

part-of reasoning-state
  session-start
  current-goal
  current-hypothesis
  superseded-none
  session-initialized
  unresolved-exact-outcome
  next-action
  uncertainty

agent holds current-goal
  confidence 0.5 assumed
`

const INITIAL_MARKDOWN = `# Current Goal

Establish the concrete task goal from the user's request.

## Evidence

- Persistent reasoning state was initialized for this agent session.

## Current Hypothesis

- The task requirements still need to be established.

## Superseded

- None.

## Actions and Results

- Session state initialized.

## Unresolved

- What exact outcome does the user require?

## Next Action

- Read the request and establish the concrete goal.

## Uncertainty

- Initial state; confidence is low until the request is analyzed.
`

// The checker's diagnostics are declared output of the state tools, and the
// tool schema requires code, severity and message on every one. The checker
// does not always supply a code, and an unnormalized diagnostic made the plugin
// fail its own output schema: DSH rejected the whole tool result, so the agent
// saw "returned invalid output" instead of the validation errors and had to
// guess what was wrong with its ledger. That cost turns in condition T only —
// the Markdown validator builds its diagnostics in code and always sets a code —
// which is friction against ThoughtML unrelated to the representation itself.
// Observed 2026-08-25: two of three commits rejected this way in one session.
function normalizeDiagnostic(diagnostic) {
  const source = (diagnostic && typeof diagnostic === 'object') ? diagnostic : {}
  const text = typeof source.message === 'string' && source.message.trim()
    ? source.message
    : (typeof diagnostic === 'string' ? diagnostic : JSON.stringify(diagnostic))
  return {
    ...source,
    code: typeof source.code === 'string' && source.code
      ? source.code
      : 'THOUGHTML_DIAGNOSTIC',
    severity: typeof source.severity === 'string' && source.severity
      ? source.severity
      : 'error',
    message: text,
  }
}

function diagnosticsFromProcess(result) {
  if (result.error) {
    return [{
      code: result.error.code ?? 'THOUGHTML_PROCESS_ERROR',
      severity: 'error',
      message: result.error.message,
    }]
  }
  if (!result.stdout?.trim()) return []
  try {
    const parsed = JSON.parse(result.stdout)
    return Array.isArray(parsed) ? parsed.map(normalizeDiagnostic) : [{
      code: 'UNEXPECTED_THOUGHTML_OUTPUT',
      severity: 'error',
      message: 'ThoughtML diagnostics were not a JSON array.',
    }]
  } catch {
    return [{
      code: 'UNPARSEABLE_THOUGHTML_OUTPUT',
      severity: 'error',
      message: result.stdout.trim(),
    }]
  }
}

function runThoughtML(options, args, operation) {
  const result = spawnSync(
    options.thoughtmlBinary,
    args,
    {
      encoding: 'utf8',
      windowsHide: true,
      timeout: options.validationTimeoutMs,
    },
  )
  if (result.error || result.status !== 0) {
    const rawDetail = result.stderr?.trim() || result.stdout?.trim() || result.error?.message || 'unknown error'
    const detail = String(rawDetail).slice(0, 2000)
    throw new Error(`ThoughtML ${operation} failed: ${detail}`)
  }
  return result.stdout.trim()
}

function validateThoughtML(path, options) {
  const result = spawnSync(
    options.thoughtmlBinary,
    ['check', '--json', ...(options.strict ? ['--strict'] : []), path],
    {
      encoding: 'utf8',
      windowsHide: true,
      timeout: options.validationTimeoutMs,
    },
  )
  const diagnostics = diagnosticsFromProcess(result)
  return {
    valid: result.status === 0 && !result.error,
    diagnostics,
    summary: result.status === 0 && !result.error
      ? 'valid'
      : (result.stderr?.trim() || diagnostics[0]?.message || 'invalid'),
  }
}

function validateMarkdown(path) {
  const content = readFileSync(path, 'utf8')
  const lines = content.split(/\r?\n/).map((line) => line.trim())
  const diagnostics = []
  const positions = []
  for (const heading of MARKDOWN_HEADINGS) {
    const matches = lines
      .map((line, index) => line === heading ? index : -1)
      .filter((index) => index >= 0)
    if (matches.length === 0) {
      diagnostics.push({
        code: 'MD_MISSING_SECTION',
        severity: 'error',
        message: `Missing required section: ${heading}`,
      })
    } else {
      positions.push(matches[0])
      if (matches.length > 1) {
        diagnostics.push({
          code: 'MD_DUPLICATE_SECTION',
          severity: 'error',
          message: `Required section appears ${matches.length} times: ${heading}`,
        })
      }
    }
  }
  if (positions.length === MARKDOWN_HEADINGS.length
    && positions.some((position, index) => index > 0 && position <= positions[index - 1])) {
    diagnostics.push({
      code: 'MD_SECTION_ORDER',
      severity: 'error',
      message: 'Required sections are not in the frozen order.',
    })
  }
  return {
    valid: diagnostics.length === 0,
    diagnostics,
    summary: diagnostics.length === 0 ? 'valid' : `${diagnostics.length} Markdown structure error(s)`,
  }
}

function inspectThoughtML(path, options) {
  const result = spawnSync(
    options.thoughtmlBinary,
    ['--compact', '--compute', path],
    {
      encoding: 'utf8',
      windowsHide: true,
      timeout: options.validationTimeoutMs,
    },
  )
  if (result.error || result.status !== 0) {
    return { itemCount: 0, relationCount: 0, conflictCount: 0 }
  }
  try {
    const model = JSON.parse(result.stdout)
    const objects = Array.isArray(model.objects) ? model.objects : []
    return {
      itemCount: objects.filter((object) => object.type !== 'link').length,
      relationCount: objects.filter((object) => object.type === 'link').length,
      conflictCount: Array.isArray(model.audit?.conflicts) ? model.audit.conflicts.length : 0,
    }
  } catch {
    return { itemCount: 0, relationCount: 0, conflictCount: 0 }
  }
}

function inspectMarkdown(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  const itemCount = lines.filter((line) => {
    const trimmed = line.trim()
    return trimmed && !trimmed.startsWith('#')
  }).length
  return { itemCount, relationCount: 0, conflictCount: 0 }
}

function thoughtMLDiff(beforePath, afterPath, options) {
  return runThoughtML(options, ['diff', beforePath, afterPath], 'diff')
}

function thoughtMLExplain(path, target, options) {
  return runThoughtML(options, ['explain', path, target], 'explain')
}

function limited(values, limit) {
  return {
    total: values.length,
    returned: Math.min(values.length, limit),
    truncated: values.length > limit,
    items: values.slice(0, limit),
  }
}

function analyzeThoughtML(path, options) {
  const output = runThoughtML(options, ['--compact', '--compute', path], 'analysis')
  let model
  try {
    model = JSON.parse(output)
  } catch {
    throw new Error('ThoughtML analysis returned invalid JSON')
  }

  const objects = Array.isArray(model.objects) ? model.objects : []
  const links = objects.filter((object) => object.type === 'link')
  const items = objects.filter((object) => object.type !== 'link')
  const conflicts = Array.isArray(model.audit?.conflicts) ? model.audit.conflicts : []
  const conciseConflicts = conflicts.map((conflict) => ({
    kind: conflict.kind,
    severity: conflict.severity,
    subjects: Array.isArray(conflict.subjects) ? conflict.subjects.slice(0, 8) : [],
    message: String(conflict.message ?? '').slice(0, 400),
  }))
  const derivedNodes = objects
    .filter((object) => object.derived_confidence !== undefined || object.argument_status !== undefined)
    .map((object) => ({
      id: object.id,
      type: object.type,
      kind: object.kind ?? null,
      relation: object.relation ?? null,
      derivedConfidence: object.derived_confidence ?? null,
      argumentStatus: object.argument_status ?? null,
      supersededBy: object.superseded_by ?? null,
    }))
  const loadBearingRelations = links
    .filter((link) => typeof link.leverage === 'number')
    .map((link) => ({
      id: link.id,
      from: link.from,
      relation: link.relation,
      to: link.to,
      leverage: link.leverage,
    }))
    .sort((left, right) => Math.abs(right.leverage) - Math.abs(left.leverage))
  const computedQuantities = objects
    .filter((object) => object.computed_quantity)
    .map((object) => ({ id: object.id, ...object.computed_quantity }))
  const expectedValues = objects
    .filter((object) => object.expected_value)
    .map((object) => ({
      id: object.id,
      value: object.expected_value.value,
      unit: object.expected_value.unit,
      dimension: object.expected_value.dimension,
      probabilityMass: object.expected_value.probability_mass,
      downside: object.expected_value.downside,
    }))
  const decisions = objects
    .filter((object) => object.decision)
    .map((object) => ({
      id: object.id,
      ranked: Array.isArray(object.decision.ranked)
        ? object.decision.ranked.slice(0, 8).map((entry) => ({
          option: entry.option,
          value: entry.value,
          unit: entry.unit,
          downside: entry.downside,
        }))
        : [],
    }))

  return {
    mode: 'thoughtml-compute',
    objectCount: objects.length,
    itemCount: items.length,
    relationCount: links.length,
    stanceCount: objects.filter((object) => object.type === 'stance').length,
    conflictCount: conflicts.length,
    conflicts: limited(conciseConflicts, 20),
    derivedNodes: limited(derivedNodes, 30),
    loadBearingRelations: limited(loadBearingRelations, 20),
    computedQuantities: limited(computedQuantities, 15),
    expectedValues: limited(expectedValues, 15),
    decisions: limited(decisions, 10),
    limitations: [
      'Computed confidence, status, sensitivity, and expected values are mechanical readings of authored structure, not truth judgments.',
      'Lists are bounded; total, returned, and truncated report omitted entries.',
    ],
  }
}

function markdownSections(path) {
  const content = readFileSync(path, 'utf8')
  const lines = content.split(/\r?\n/)
  const sections = []
  for (const heading of MARKDOWN_HEADINGS) {
    const start = lines.findIndex((line) => line.trim() === heading)
    if (start < 0) {
      sections.push({ heading, content: '', present: false })
      continue
    }
    let end = lines.length
    for (let index = start + 1; index < lines.length; index += 1) {
      if (/^#{1,6}\s+/.test(lines[index].trim())) {
        end = index
        break
      }
    }
    sections.push({
      heading,
      content: lines.slice(start + 1, end).join('\n').trim(),
      present: true,
    })
  }
  return sections
}

function markdownDiff(beforePath, afterPath) {
  const before = new Map(markdownSections(beforePath).map((section) => [section.heading, section]))
  const after = new Map(markdownSections(afterPath).map((section) => [section.heading, section]))
  const changed = MARKDOWN_HEADINGS.filter((heading) => before.get(heading)?.content !== after.get(heading)?.content)
  const unchanged = MARKDOWN_HEADINGS.filter((heading) => !changed.includes(heading))
  return [
    'matched Markdown section diff',
    `changed (${changed.length}): ${changed.length ? changed.join(', ') : 'none'}`,
    `unchanged (${unchanged.length}): ${unchanged.length ? unchanged.join(', ') : 'none'}`,
  ].join('\n')
}

function markdownExplain(path, target) {
  const normalized = String(target).replace(/^#{1,6}\s*/, '').trim().toLowerCase()
  const section = markdownSections(path).find(({ heading }) => (
    heading.replace(/^#{1,6}\s*/, '').trim().toLowerCase() === normalized
  ))
  if (!section?.present) throw new Error(`Markdown state section not found: ${target}`)
  return `${section.heading}\n\n${section.content || '(empty section)'}`
}

function analyzeMarkdown(path) {
  const sections = markdownSections(path)
  const itemCount = sections.reduce((total, section) => (
    total + section.content.split(/\r?\n/).filter((line) => line.trim()).length
  ), 0)
  return {
    mode: 'matched-markdown-structure',
    objectCount: itemCount,
    itemCount,
    relationCount: 0,
    stanceCount: 0,
    conflictCount: 0,
    sections: sections.map((section) => ({
      heading: section.heading,
      present: section.present,
      nonEmptyLineCount: section.content.split(/\r?\n/).filter((line) => line.trim()).length,
    })),
    conflicts: limited([], 20),
    derivedNodes: limited([], 30),
    loadBearingRelations: limited([], 20),
    computedQuantities: limited([], 15),
    expectedValues: limited([], 15),
    decisions: limited([], 10),
    limitations: [
      'Markdown analysis checks matched section structure only; it cannot compute graph relations, confidence, argument status, sensitivity, or decisions.',
    ],
  }
}

export function createFormatAdapter(format, options = {}) {
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new Error(`unsupported reasoning-state format: ${JSON.stringify(format)}`)
  }
  const normalized = {
    thoughtmlBinary: options.thoughtmlBinary || 'thoughtml',
    strict: options.strict !== false,
    validationTimeoutMs: options.validationTimeoutMs ?? 10000,
  }
  if (!Number.isSafeInteger(normalized.validationTimeoutMs) || normalized.validationTimeoutMs <= 0) {
    throw new Error('validationTimeoutMs must be a positive safe integer')
  }

  if (format === 'thoughtml') {
    return Object.freeze({
      format,
      extension: 'thml',
      initialContent: INITIAL_THOUGHTML,
      validate(path) { return validateThoughtML(path, normalized) },
      inspect(path) { return inspectThoughtML(path, normalized) },
      diff(beforePath, afterPath) { return thoughtMLDiff(beforePath, afterPath, normalized) },
      explain(path, target) { return thoughtMLExplain(path, target, normalized) },
      analyze(path) { return analyzeThoughtML(path, normalized) },
    })
  }
  return Object.freeze({
    format,
    extension: 'md',
    initialContent: INITIAL_MARKDOWN,
    validate: validateMarkdown,
    inspect: inspectMarkdown,
    diff: markdownDiff,
    explain: markdownExplain,
    analyze: analyzeMarkdown,
  })
}

// Exported for the regression test covering the code-less diagnostic defect.
export function diagnosticsFromProcessForTest(result) {
  return diagnosticsFromProcess(result)
}
