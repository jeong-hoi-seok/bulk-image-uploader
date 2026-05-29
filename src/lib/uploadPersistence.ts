'use client'

import type { OutputFormat, ServerMetrics, UploadFile } from '@/types/image'

const DB_NAME = 'bulk-image-uploader'
const DB_VERSION = 1
const STORE_NAME = 'upload-records'

export interface PersistedUploadRecord {
  id: string
  fingerprint: string
  file: File
  preview: string
  outputFormat: OutputFormat
  quality: number
  fileName?: string
  mimeType?: string
  processedBlob?: Blob
  sessionUri?: string
  uploadedBytes: number
  totalBytes?: number
  driveId?: string
  webViewLink?: string
  serverMetrics?: ServerMetrics
  status: UploadFile['status']
  error?: string
  createdAt: number
  updatedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null
const deletedRecordIds = new Set<string>()

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('fingerprint', 'fingerprint', { unique: false })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  return dbPromise
}

function txStore(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function createFileFingerprint(file: File, quality: number, outputFormat: OutputFormat): string {
  return [
    file.name,
    file.size,
    file.lastModified,
    file.type,
    quality,
    outputFormat,
  ].join(':')
}

export async function saveUploadRecord(record: PersistedUploadRecord): Promise<void> {
  deletedRecordIds.delete(record.id)
  const db = await openDb()
  await requestToPromise(txStore(db, 'readwrite').put({ ...record, updatedAt: Date.now() }))
}

export async function patchUploadRecord(
  id: string,
  patch: Partial<PersistedUploadRecord>,
): Promise<void> {
  if (deletedRecordIds.has(id)) return
  const db = await openDb()
  const store = txStore(db, 'readwrite')
  const current = await requestToPromise<PersistedUploadRecord | undefined>(store.get(id))
  if (!current || deletedRecordIds.has(id)) return
  await requestToPromise(store.put({ ...current, ...patch, updatedAt: Date.now() }))
}

export async function deleteUploadRecord(id: string): Promise<void> {
  deletedRecordIds.add(id)
  const db = await openDb()
  await requestToPromise(txStore(db, 'readwrite').delete(id))
}

export async function clearUploadRecords(): Promise<void> {
  const db = await openDb()
  await requestToPromise(txStore(db, 'readwrite').clear())
}

export async function getUploadRecords(): Promise<PersistedUploadRecord[]> {
  const db = await openDb()
  const records = await requestToPromise<PersistedUploadRecord[]>(txStore(db, 'readonly').getAll())
  return records.sort((a, b) => a.createdAt - b.createdAt)
}
