export type HistoryKind = 'correction' | 'traduction' | 'courrier'

export type HistoryRecord = {
  id: string
  kind: HistoryKind
  title: string
  excerpt: string
  createdAt: number
  text: string
  extra?: {
    original?: string
    source?: string
    target?: string
    templateId?: string
    fields?: Record<string, string>
  }
}

const DB_NAME = 'correcteur-pro'
const STORE = 'history'
const LOCAL_KEY = 'correcteur-pro-history'
const MAX_ITEMS = 40

let useLocal = false

function readLocal(): HistoryRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    const parsed = raw ? JSON.parse(raw) as HistoryRecord[] : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocal(items: HistoryRecord[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)))
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function allFrom(db: IDBDatabase): Promise<HistoryRecord[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    request.onsuccess = () => resolve((request.result as HistoryRecord[]) ?? [])
    request.onerror = () => reject(request.error)
  })
}

export function sortHistory(items: HistoryRecord[]): HistoryRecord[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ITEMS)
}

export async function listHistory(): Promise<HistoryRecord[]> {
  if (useLocal) return sortHistory(readLocal())
  try {
    const db = await openDb()
    const items = await allFrom(db)
    db.close()
    return sortHistory(items)
  } catch {
    useLocal = true
    return sortHistory(readLocal())
  }
}

async function persist(items: HistoryRecord[]): Promise<HistoryRecord[]> {
  const next = sortHistory(items)
  if (useLocal) {
    writeLocal(next)
    return next
  }
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      store.clear()
      for (const item of next) store.put(item)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    useLocal = true
    writeLocal(next)
  }
  return next
}

export async function remember(record: HistoryRecord): Promise<HistoryRecord[]> {
  const items = await listHistory()
  const latest = items[0]
  if (latest && latest.kind === record.kind && latest.text === record.text) return items
  return persist([record, ...items])
}

export async function removeHistory(id: string): Promise<HistoryRecord[]> {
  const items = await listHistory()
  return persist(items.filter((item) => item.id !== id))
}

export async function clearHistory(): Promise<void> {
  await persist([])
}

export function excerptOf(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 140 ? `${clean.slice(0, 139).trim()}…` : clean
}

export function formatHistoryDate(timestamp: number): string {
  const date = new Date(timestamp)
  const day = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day} à ${hours}\u00a0h\u00a0${minutes}`
}
