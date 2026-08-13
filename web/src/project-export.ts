import { strToU8, zipSync } from 'fflate'

export function downloadText(name: string, text: string): void {
  downloadBlob(name, new Blob([text], { type: 'text/plain;charset=utf-8' }))
}

export function downloadProject(name: string, files: Record<string, string>): void {
  const archive = Object.fromEntries(
    Object.entries(files).map(([file, source]) => [file, strToU8(source)]),
  )
  const bytes = zipSync(archive, { level: 6 })
  downloadBlob(`${safeName(name)}.zip`, new Blob([bytes as BlobPart], { type: 'application/zip' }))
}

function downloadBlob(name: string, blob: Blob): void {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
}

function safeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'thoughtml-project'
}
