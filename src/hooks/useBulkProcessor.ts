'use client'

import { useCallback, useRef, useState } from 'react'
import { processImage, getMemoryMB, generateId } from '@/lib/imageProcessor'
import type {
  MemorySnapshot,
  ProcessingOptions,
  SessionMetrics,
  UploadFile,
} from '@/types/image'

const DEFAULT_OPTIONS: ProcessingOptions = {
  maxWidthOrHeight: 1920,
  quality: 0.8,
  outputFormat: 'webp',
  concurrency: 3,
}

const DEFAULT_SESSION: SessionMetrics = {
  totalFiles: 0,
  processedFiles: 0,
  failedFiles: 0,
  totalOriginalSize: 0,
  totalProcessedSize: 0,
  avgCompressTime: 0,
  avgResizeTime: 0,
  peakMemoryMB: 0,
  startTime: 0,
}

export function useBulkProcessor() {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_OPTIONS)
  const [session, setSession] = useState<SessionMetrics>(DEFAULT_SESSION)
  const [memoryHistory, setMemoryHistory] = useState<MemorySnapshot[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const cancelledIds = useRef<Set<string>>(new Set())
  const memoryTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const addFiles = useCallback((incoming: File[]) => {
    const newItems: UploadFile[] = incoming.map((f) => ({
      id: generateId(),
      file: f,
      status: 'pending',
      progress: 0,
      preview: URL.createObjectURL(f),
    }))
    setFiles((prev) => [...prev, ...newItems])
  }, [])

  const cancel = useCallback((id: string) => {
    cancelledIds.current.add(id)
    setFiles((prev) =>
      prev.map((f) => (f.id === id && f.status !== 'done' ? { ...f, status: 'cancelled' } : f)),
    )
  }, [])

  const cancelAll = useCallback(() => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.status === 'pending' || f.status === 'processing') {
          cancelledIds.current.add(f.id)
          return { ...f, status: 'cancelled' }
        }
        return f
      }),
    )
  }, [])

  const download = useCallback((id: string) => {
    setFiles((prev) => {
      const f = prev.find((x) => x.id === id)
      if (!f?.processedUrl) return prev
      const a = document.createElement('a')
      a.href = f.processedUrl
      a.download = `${f.file.name.replace(/\.[^.]+$/, '')}.${options.outputFormat}`
      a.click()
      return prev
    })
  }, [options.outputFormat])

  const processQueue = useCallback(async (queue: UploadFile[], opts: ProcessingOptions) => {
    const semaphore = {
      count: 0,
      max: opts.concurrency,
      waiters: [] as (() => void)[],
      async acquire() {
        if (this.count < this.max) { this.count++; return }
        await new Promise<void>((r) => this.waiters.push(r))
        this.count++
      },
      release() {
        this.count--
        this.waiters.shift()?.()
      },
    }

    const compressTimes: number[] = []

    const processOne = async (item: UploadFile) => {
      await semaphore.acquire()

      if (cancelledIds.current.has(item.id)) {
        semaphore.release()
        return
      }

      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: 'processing', progress: 0 } : f)),
      )

      try {
        const { blob, metrics } = await processImage(item.file, opts, (p) => {
          if (cancelledIds.current.has(item.id)) return
          setFiles((prev) =>
            prev.map((f) => (f.id === item.id ? { ...f, progress: p } : f)),
          )
        })

        if (cancelledIds.current.has(item.id)) {
          semaphore.release()
          return
        }

        const url = URL.createObjectURL(blob)
        compressTimes.push(metrics.compressTime)

        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: 'done', progress: 100, processedBlob: blob, processedUrl: url, metrics }
              : f,
          ),
        )

        setSession((s) => {
          const processed = s.processedFiles + 1
          const totalCompressTime = s.avgCompressTime * s.processedFiles + metrics.compressTime
          const mem = getMemoryMB() ?? s.peakMemoryMB
          return {
            ...s,
            processedFiles: processed,
            totalProcessedSize: s.totalProcessedSize + metrics.processedSize,
            avgCompressTime: totalCompressTime / processed,
            peakMemoryMB: Math.max(s.peakMemoryMB, mem),
          }
        })
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id ? { ...f, status: 'error', error: String(err) } : f,
          ),
        )
        setSession((s) => ({ ...s, failedFiles: s.failedFiles + 1 }))
      } finally {
        semaphore.release()
      }
    }

    await Promise.all(queue.map(processOne))
  }, [])

  const startProcessing = useCallback(async () => {
    const pending = files.filter((f) => f.status === 'pending')
    if (!pending.length || isRunning) return

    cancelledIds.current.clear()
    setIsRunning(true)

    const totalOriginalSize = pending.reduce((sum, f) => sum + f.file.size, 0)
    setSession({
      ...DEFAULT_SESSION,
      totalFiles: pending.length,
      totalOriginalSize,
      startTime: Date.now(),
    })
    setMemoryHistory([])

    memoryTimer.current = setInterval(() => {
      const mb = getMemoryMB()
      if (mb !== null) {
        setMemoryHistory((prev) => [...prev, { timestamp: Date.now(), usedMB: mb, totalMB: mb }])
      }
    }, 500)

    await processQueue(pending, options)

    if (memoryTimer.current) clearInterval(memoryTimer.current)
    setSession((s) => ({ ...s, endTime: Date.now() }))
    setIsRunning(false)
  }, [files, isRunning, options, processQueue])

  const clearAll = useCallback(() => {
    files.forEach((f) => {
      URL.revokeObjectURL(f.preview)
      if (f.processedUrl) URL.revokeObjectURL(f.processedUrl)
    })
    setFiles([])
    setSession(DEFAULT_SESSION)
    setMemoryHistory([])
    cancelledIds.current.clear()
  }, [files])

  return {
    files,
    options,
    session,
    memoryHistory,
    isRunning,
    addFiles,
    cancel,
    cancelAll,
    download,
    startProcessing,
    clearAll,
    setOptions,
  }
}
