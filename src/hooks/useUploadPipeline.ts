'use client'

import { useCallback, useRef, useState } from 'react'
import { generateId, getMemoryMB } from '@/lib/imageProcessor'
import type { MemorySnapshot, ProcessingOptions, SessionMetrics, UploadFile } from '@/types/image'

export { formatBytes } from '@/lib/imageProcessor'

const DEFAULT_OPTIONS: ProcessingOptions = {
  quality: 85,
  outputFormat: 'jpeg',
}

const EMPTY_SESSION: SessionMetrics = {
  totalFiles: 0,
  processedFiles: 0,
  failedFiles: 0,
  totalOriginalSize: 0,
  totalResizedSize: 0,
  avgResizeMs: 0,
  avgUploadMs: 0,
  peakMemoryMB: 0,
  elapsedMs: 0,
}

interface WorkerResult {
  id: string
  blob: Blob
  width: number
  height: number
  metrics: {
    compressTime: number
    resizeTime: number
    convertTime: number
    originalSize: number
    processedSize: number
  }
}

function processWithWorker(
  item: UploadFile,
  opts: ProcessingOptions,
): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/imageProcessor.worker.ts', import.meta.url),
    )
    worker.onmessage = (e) => {
      worker.terminate()
      if (e.data.type === 'error') {
        reject(new Error(e.data.message))
      } else {
        resolve(e.data as WorkerResult)
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message))
    }
    worker.postMessage({
      id: item.id,
      file: item.file,
      quality: opts.quality / 100,
      outputFormat: opts.outputFormat,
    })
  })
}

async function getSessionUri(name: string, mimeType: string, size: number): Promise<string> {
  const res = await fetch('/api/drive/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType, size }),
  })
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json() : null
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
  return data.sessionUri as string
}

const CHUNK_SIZE = 4 * 1024 * 1024 // 4 MB — stays under Vercel 4.5 MB limit

async function uploadViaChunks(
  sessionUri: string,
  blob: Blob,
  onProgress: (pct: number) => void,
): Promise<{ id: string; webViewLink: string }> {
  const total = blob.size
  let start = 0

  while (start < total) {
    const end = Math.min(start + CHUNK_SIZE, total)
    const chunk = blob.slice(start, end)
    const buffer = await chunk.arrayBuffer()

    const res = await fetch('/api/drive/chunk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Drive-Session': sessionUri,
        'X-Range-Start': String(start),
        'X-Range-Total': String(total),
      },
      body: buffer,
    })

    const isJson = res.headers.get('content-type')?.includes('application/json')
    const data = isJson ? await res.json() : null
    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)

    onProgress(Math.round((end / total) * 100))

    if (data.done) {
      return { id: data.id, webViewLink: data.webViewLink }
    }

    start = end
  }

  throw new Error('Upload ended without completion signal')
}

export function useUploadPipeline() {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_OPTIONS)
  const [session, setSession] = useState<SessionMetrics>(EMPTY_SESSION)
  const [memHistory, setMemHistory] = useState<MemorySnapshot[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const cancelledIds = useRef<Set<string>>(new Set())
  const memTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTime = useRef(0)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const queueRef = useRef<UploadFile[]>([])
  const runningRef = useRef(false)

  const uploadOne = useCallback(async (item: UploadFile) => {
    if (cancelledIds.current.has(item.id)) return
    const opts = optionsRef.current

    setFiles((prev) =>
      prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading', progress: 5 } : f)),
    )

    try {
      // Step 1: client-side compress
      const t0 = Date.now()
      const workerResult = await processWithWorker(item, opts)
      const resizeMs = Date.now() - t0
      if (cancelledIds.current.has(item.id)) return

      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, progress: 30 } : f)),
      )

      const { blob, width, height, metrics } = workerResult
      const mimeType = blob.type || `image/${opts.outputFormat}`
      const baseName = item.file.name.replace(/\.[^.]+$/, '')
      const ext = opts.outputFormat
      const fileName = `${baseName}.${ext}`

      // Step 2: get Drive resumable session URI
      const sessionUri = await getSessionUri(fileName, mimeType, blob.size)
      if (cancelledIds.current.has(item.id)) return

      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, progress: 40 } : f)),
      )

      // Step 3: upload directly to Drive
      const t1 = Date.now()
      const { id, webViewLink } = await uploadViaChunks(sessionUri, blob, (pct) => {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id ? { ...f, progress: 40 + Math.round(pct * 0.6) } : f,
          ),
        )
      })
      const uploadMs = Date.now() - t1

      if (cancelledIds.current.has(item.id)) return

      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id
            ? {
                ...f,
                status: 'done',
                progress: 100,
                driveId: id,
                webViewLink,
                serverMetrics: {
                  resizeMs,
                  uploadMs,
                  width,
                  height,
                  originalSize: metrics.originalSize,
                  resizedSize: metrics.processedSize,
                  usedOriginal: false,
                },
              }
            : f,
        ),
      )

      setSession((s) => {
        const n = s.processedFiles + 1
        const mem = getMemoryMB() ?? s.peakMemoryMB
        return {
          ...s,
          processedFiles: n,
          totalOriginalSize: s.totalOriginalSize + metrics.originalSize,
          totalResizedSize: s.totalResizedSize + metrics.processedSize,
          avgResizeMs: (s.avgResizeMs * s.processedFiles + resizeMs) / n,
          avgUploadMs: (s.avgUploadMs * s.processedFiles + uploadMs) / n,
          peakMemoryMB: Math.max(s.peakMemoryMB, mem),
          elapsedMs: Date.now() - startTime.current,
        }
      })
    } catch (err) {
      if (cancelledIds.current.has(item.id)) return
      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id ? { ...f, status: 'error', error: String(err) } : f,
        ),
      )
      setSession((s) => ({ ...s, failedFiles: s.failedFiles + 1, elapsedMs: Date.now() - startTime.current }))
    }
  }, [])

  const drainQueue = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    setIsRunning(true)

    if (!startTime.current) {
      startTime.current = Date.now()
      memTimer.current = setInterval(() => {
        const mb = getMemoryMB()
        if (mb !== null) {
          setMemHistory((prev) => [...prev, { t: prev.length, mb: parseFloat(mb.toFixed(1)) }])
        }
        setSession((s) => ({ ...s, elapsedMs: Date.now() - startTime.current }))
      }, 500)
    }

    while (queueRef.current.length > 0) {
      const item = queueRef.current.shift()!
      await uploadOne(item)
    }

    if (memTimer.current) { clearInterval(memTimer.current); memTimer.current = null }
    const finalElapsed = startTime.current ? Date.now() - startTime.current : 0
    startTime.current = 0
    runningRef.current = false
    setSession((s) => ({ ...s, elapsedMs: finalElapsed }))
    setIsRunning(false)
  }, [uploadOne])

  const addFiles = useCallback((incoming: File[]) => {
    const items: UploadFile[] = incoming.map((f) => ({
      id: generateId(),
      file: f,
      status: 'pending',
      progress: 0,
      preview: URL.createObjectURL(f),
    }))

    setFiles((prev) => {
      const next = [...prev, ...items]
      setSession((s) => ({
        ...s,
        totalFiles: s.totalFiles + items.length,
      }))
      return next
    })

    queueRef.current.push(...items)
    drainQueue()
  }, [drainQueue])

  const cancel = useCallback((id: string) => {
    cancelledIds.current.add(id)
    queueRef.current = queueRef.current.filter((f) => f.id !== id)
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id && (f.status === 'pending' || f.status === 'uploading')
          ? { ...f, status: 'cancelled' }
          : f,
      ),
    )
    setSession((s) => ({ ...s, totalFiles: Math.max(0, s.totalFiles - 1) }))
  }, [])

  const cancelAll = useCallback(() => {
    queueRef.current = []
    setFiles((prev) =>
      prev.map((f) => {
        if (f.status === 'pending' || f.status === 'uploading') {
          cancelledIds.current.add(f.id)
          return { ...f, status: 'cancelled' }
        }
        return f
      }),
    )
  }, [])

  const clearAll = useCallback(() => {
    queueRef.current = []
    cancelledIds.current.clear()
    if (memTimer.current) { clearInterval(memTimer.current); memTimer.current = null }
    startTime.current = 0
    runningRef.current = false
    setFiles((prev) => { prev.forEach((f) => URL.revokeObjectURL(f.preview)); return [] })
    setSession(EMPTY_SESSION)
    setMemHistory([])
    setIsRunning(false)
  }, [])

  return {
    files,
    options,
    session,
    memHistory,
    isRunning,
    addFiles,
    cancel,
    cancelAll,
    clearAll,
    setOptions,
  }
}
