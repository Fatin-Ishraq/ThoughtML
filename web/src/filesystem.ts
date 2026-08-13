import { validFileName } from './workspace.ts'

type PermissionMode = 'read' | 'readwrite'
type PermissionStateLike = 'granted' | 'denied' | 'prompt'

export interface FileHandleLike {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{
    write(data: string | Blob): Promise<void>
    close(): Promise<void>
  }>
}

export interface DirectoryHandleLike {
  kind: 'directory'
  name: string
  values(): AsyncIterableIterator<FileHandleLike | DirectoryHandleLike>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>
  removeEntry(name: string): Promise<void>
  queryPermission?(options: { mode: PermissionMode }): Promise<PermissionStateLike>
  requestPermission?(options: { mode: PermissionMode }): Promise<PermissionStateLike>
}

interface PickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: PermissionMode }) => Promise<DirectoryHandleLike>
  showOpenFilePicker?: (options?: {
    multiple?: boolean
    types?: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<FileHandleLike[]>
}

export interface DiskSnapshot {
  text: string
  lastModified: number
}

export interface DirectoryProject {
  directory: DirectoryHandleLike
  handles: Map<string, FileHandleLike>
  snapshots: Map<string, DiskSnapshot>
}

export interface ReadProject {
  project: DirectoryProject
  files: Record<string, string>
  rejected: string[]
}

const DB_NAME = 'thoughtml-workspace'
const STORE = 'handles'
const DIRECTORY_KEY = 'current-directory'

export function supportsDirectoryAccess(): boolean {
  return typeof (window as PickerWindow).showDirectoryPicker === 'function'
}

export function supportsFilePicker(): boolean {
  return typeof (window as PickerWindow).showOpenFilePicker === 'function'
}

export async function chooseDirectory(): Promise<ReadProject> {
  const picker = (window as PickerWindow).showDirectoryPicker
  if (!picker) throw new Error('Folder access is not supported by this browser')
  const directory = await picker({ mode: 'readwrite' })
  try {
    await rememberDirectory(directory)
  } catch { /* an open project still works when the browser cannot persist handles */ }
  return readDirectory(directory)
}

export async function chooseFiles(): Promise<{ files: Record<string, string>; handles: Map<string, FileHandleLike> }> {
  const picker = (window as PickerWindow).showOpenFilePicker
  if (!picker) throw new Error('Native file picking is not supported by this browser')
  const selected = await picker({
    multiple: true,
    types: [{ description: 'ThoughtML', accept: { 'text/plain': ['.thml'] } }],
  })
  const files: Record<string, string> = {}
  const handles = new Map<string, FileHandleLike>()
  for (const handle of selected) {
    const name = handle.name.toLowerCase()
    if (!validFileName(name)) continue
    const file = await handle.getFile()
    files[name] = await file.text()
    handles.set(name, handle)
  }
  return { files, handles }
}

export async function readDirectory(directory: DirectoryHandleLike): Promise<ReadProject> {
  const files: Record<string, string> = {}
  const handles = new Map<string, FileHandleLike>()
  const snapshots = new Map<string, DiskSnapshot>()
  const rejected: string[] = []
  for await (const handle of directory.values()) {
    if (handle.kind !== 'file' || !handle.name.toLowerCase().endsWith('.thml')) continue
    const name = handle.name.toLowerCase()
    if (!validFileName(name) || handle.name !== name) {
      rejected.push(handle.name)
      continue
    }
    const file = await handle.getFile()
    const text = await file.text()
    files[name] = text
    handles.set(name, handle)
    snapshots.set(name, { text, lastModified: file.lastModified })
  }
  return { project: { directory, handles, snapshots }, files, rejected }
}

export async function saveDirectoryFiles(
  project: DirectoryProject,
  files: Record<string, string>,
  names: string[],
): Promise<void> {
  await requirePermission(project.directory)
  for (const name of names) {
    const text = files[name]
    if (text === undefined) continue
    const handle = project.handles.get(name)
      ?? await project.directory.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
    const file = await handle.getFile()
    project.handles.set(name, handle)
    project.snapshots.set(name, { text, lastModified: file.lastModified })
  }
}

export async function savePickedFiles(
  handles: Map<string, FileHandleLike>,
  files: Record<string, string>,
  names: string[],
): Promise<string[]> {
  const saved: string[] = []
  for (const name of names) {
    const handle = handles.get(name)
    const text = files[name]
    if (!handle || text === undefined) continue
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
    saved.push(name)
  }
  return saved
}

export async function removeDirectoryFiles(project: DirectoryProject, names: string[]): Promise<void> {
  await requirePermission(project.directory)
  for (const name of names) {
    try {
      await project.directory.removeEntry(name)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
    }
    project.handles.delete(name)
    project.snapshots.delete(name)
  }
}

export async function readDiskChanges(project: DirectoryProject): Promise<ReadProject> {
  await requirePermission(project.directory, 'read')
  return readDirectory(project.directory)
}

export async function restoreDirectory(): Promise<DirectoryHandleLike | null> {
  const directory = await idbGet<DirectoryHandleLike>(DIRECTORY_KEY)
  if (!directory) return null
  const state = await directory.queryPermission?.({ mode: 'readwrite' })
  return state === 'granted' ? directory : null
}

export async function forgetDirectory(): Promise<void> {
  await idbDelete(DIRECTORY_KEY)
}

async function requirePermission(directory: DirectoryHandleLike, mode: PermissionMode = 'readwrite'): Promise<void> {
  const current = await directory.queryPermission?.({ mode })
  if (!current || current === 'granted') return
  const requested = await directory.requestPermission?.({ mode })
  if (requested !== 'granted') throw new Error('Folder permission was not granted')
}

async function rememberDirectory(directory: DirectoryHandleLike): Promise<void> {
  await idbPut(DIRECTORY_KEY, directory)
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE)
    const request = transaction.objectStore(STORE).get(key)
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
  })
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).put(value, key)
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error) }
  })
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).delete(key)
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error) }
  })
}
