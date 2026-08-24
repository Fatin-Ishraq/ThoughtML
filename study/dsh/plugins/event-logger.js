import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const name = 'thoughtml-study-event-logger'
export const inject = ['sessions', 'tools']

function appendJsonLine(path, value) {
  appendFileSync(path, `${JSON.stringify(value)}\n`, 'utf8')
}

export function apply(ctx, config = {}) {
  const outputDir = resolve(config.outputDir)
  mkdirSync(outputDir, { recursive: true })
  const eventPath = join(outputDir, 'events.jsonl')
  const toolPath = join(outputDir, 'tools.jsonl')
  const observerPath = join(outputDir, 'observer.json')
  writeFileSync(eventPath, '', 'utf8')
  writeFileSync(toolPath, '', 'utf8')
  writeFileSync(observerPath, JSON.stringify({
    schemaVersion: 1,
    condition: config.condition,
    telemetryMode: process.env.DSH_TELEMETRY_MODE ?? null,
    deepseekCredentialPresent: Boolean(process.env.DEEPSEEK_API_KEY),
  }, null, 2), 'utf8')

  ctx.on('session/event', (session, event) => {
    appendJsonLine(eventPath, {
      observedAt: new Date().toISOString(),
      condition: config.condition,
      sessionId: session.id,
      seq: event.seq,
      type: event.type,
      data: event.data,
      sourceEventSeqs: event.sourceEventSeqs,
      surfaceOp: event.surfaceOp,
    })
  })

  ctx.on('tools/result', (exec, result) => {
    appendJsonLine(toolPath, {
      observedAt: new Date().toISOString(),
      condition: config.condition,
      sessionId: exec.agent?.session?.id ?? null,
      callId: exec.callId,
      name: exec.name,
      arguments: exec.arguments,
      ok: !result.isError,
      isError: result.isError,
      content: result.content,
      error: result.error,
    })
  })
}
