import { initParser, parseProject } from './parse'

interface CompileRequest {
  version: number
  entry: string
  sources: Record<string, string>
}

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<CompileRequest>) => void) | null
  postMessage(message: unknown): void
}

worker.onmessage = (event) => {
  const { version, entry, sources } = event.data
  void initParser()
    .then(() => parseProject(entry, sources))
    .then((result) => worker.postMessage({ version, result }))
    .catch((error: unknown) => worker.postMessage({ version, error: String(error) }))
}

export {}
