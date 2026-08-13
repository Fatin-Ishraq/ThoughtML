import type { ParseResult } from './model'

interface CompileResponse {
  version: number
  result?: ParseResult
  error?: string
}

interface Pending {
  resolve: (result: ParseResult) => void
  reject: (error: Error) => void
}

export class ProjectCompiler {
  private readonly worker = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' })
  private readonly pending = new Map<number, Pending>()
  private version = 0

  constructor() {
    this.worker.onmessage = (event: MessageEvent<CompileResponse>) => {
      const pending = this.pending.get(event.data.version)
      if (!pending) return
      this.pending.delete(event.data.version)
      if (event.data.result) pending.resolve(event.data.result)
      else pending.reject(new Error(event.data.error ?? 'ThoughtML compiler failed'))
    }
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'ThoughtML compiler worker failed')
      for (const pending of this.pending.values()) pending.reject(error)
      this.pending.clear()
    }
  }

  compile(entry: string, sources: Record<string, string>): { version: number; promise: Promise<ParseResult> } {
    const version = ++this.version
    const promise = new Promise<ParseResult>((resolve, reject) => {
      this.pending.set(version, { resolve, reject })
      this.worker.postMessage({ version, entry, sources })
    })
    return { version, promise }
  }

  isLatest(version: number): boolean {
    return version === this.version
  }

  dispose(): void {
    this.worker.terminate()
    this.pending.clear()
  }
}
