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
    return Array.isArray(parsed) ? parsed : [{
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
    })
  }
  return Object.freeze({
    format,
    extension: 'md',
    initialContent: INITIAL_MARKDOWN,
    validate: validateMarkdown,
    inspect: inspectMarkdown,
  })
}
