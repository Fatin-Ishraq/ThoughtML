import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'thoughtml-study-mock-operation'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'offline_operation',
    description: 'Deterministic offline operation used to verify failure and recovery instrumentation.',
    parameters: {
      attempt: {
        type: 'integer',
        required: true,
        description: 'Attempt number. Attempt 1 fails and attempt 2 succeeds.',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', required: true },
          attempt: { type: 'integer', required: true },
        },
        additionalProperties: false,
      },
      render(_args, value) {
        return [{ type: 'text', text: JSON.stringify(value) }]
      },
    },
    isConcurrencySafe: () => false,
    async execute({ attempt }) {
      if (attempt === 1) throw new Error('deterministic offline first-attempt failure')
      if (attempt !== 2) throw new Error(`unexpected offline attempt: ${attempt}`)
      return { ok: true, attempt }
    },
  }))
}
