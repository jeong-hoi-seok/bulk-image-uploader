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

  // queue of pending ids waiting to be processed
  const queueRef = useRef<UploadFile[]>([])
  const runningRef = useRef(false)

  const uploadOne = useCallback(async (item: UploadFile) => {
    if (cancelledIds.current.has(item.id)) return
    const opts = optionsRef.current

    setFiles((prev) =>
      prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading', progress: 20 } : f)),
    )

    const formData = new FormData()
    formData.append('files', item.file)
    formData.append('quality', String(opts.quality))
    formData.append('outputFormat', opts.outputFormat)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (cancelledIds.current.has(item.id)) return

      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, progress: 80 } : f)),
      )

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      const result = data.results?.[0]
      const apiError = data.errors?.[0]
      if (apiError) throw new Error(apiError.error)
      if (!result) throw new Error('No result from server')

      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id
            ? {
                ...f,
                status: 'done',
                progress: 100,
                driveId: result.driveId,
                webViewLink: result.webViewLink,
                serverMetrics: {
                  resizeMs: result.resizeMs,
                  uploadMs: result.uploadMs,
                  width: result.width,
                  height: result.height,
                  originalSize: result.originalSize,
                  resizedSize: result.resizedSize,
                  usedOriginal: result.usedOriginal ?? false,
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
          totalOriginalSize: s.totalOriginalSize + result.originalSize,
          totalResizedSize: s.totalResizedSize + result.resizedSize,
          avgResizeMs: (s.avgResizeMs * s.processedFiles + result.resizeMs) / n,
          avgUploadMs: (s.avgUploadMs * s.processedFiles + result.uploadMs) / n,
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
      // update totalFiles in session
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
