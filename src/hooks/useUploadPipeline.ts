'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { generateId, getMemoryMB } from '@/lib/imageProcessor'
import { createThumbnail } from '@/lib/thumbnail'
import {
  clearUploadRecords,
  createFileFingerprint,
  getUploadRecords,
  patchUploadRecord,
  saveUploadRecord,
} from '@/lib/uploadPersistence'
import type { PersistedUploadRecord } from '@/lib/uploadPersistence'
import type { MemorySnapshot, ProcessingOptions, SessionMetrics, UploadFile } from '@/types/image'

export { formatBytes } from '@/lib/imageProcessor'

const DEFAULT_OPTIONS: ProcessingOptions = {
  quality: 50,
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

async function getDriveUploadedBytes(
  sessionUri: string,
  total: number,
): Promise<{ uploadedBytes: number; done: boolean; id?: string; webViewLink?: string }> {
  const res = await fetch('/api/drive/chunk', {
    method: 'POST',
    headers: {
      'X-Drive-Session': sessionUri,
      'X-Range-Total': String(total),
      'X-Check-Offset': '1',
    },
  })

  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json() : null
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)

  return {
    uploadedBytes: Number(data.uploadedBytes ?? 0),
    done: Boolean(data.done),
    id: data.id,
    webViewLink: data.webViewLink,
  }
}

async function uploadViaChunks(
  sessionUri: string,
  blob: Blob,
  startByte: number,
  onProgress: (uploadedBytes: number, pct: number) => void,
): Promise<{ id: string; webViewLink: string }> {
  const total = blob.size
  let start = Math.min(Math.max(startByte, 0), total)

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

    if (data.done) {
      return { id: data.id, webViewLink: data.webViewLink }
    }

    const uploadedBytes = Math.min(Number(data.uploadedBytes ?? end), total)
    onProgress(uploadedBytes, Math.round((uploadedBytes / total) * 100))

    if (uploadedBytes <= start) {
      throw new Error('Drive did not advance the resumable upload offset')
    }

    start = uploadedBytes
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
  // 같은 배치로 추가된 파일이 동일한 createdAt를 갖지 않도록 단조 증가시키는 정렬 키
  const orderRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    getUploadRecords().then(async (records) => {
      if (cancelled || records.length === 0) return

      const toDoneFile = (record: PersistedUploadRecord, override?: Partial<UploadFile>): UploadFile => ({
        id: record.id,
        file: record.file,
        status: 'done',
        progress: 100,
        preview: record.preview,
        fingerprint: record.fingerprint,
        options: { quality: record.quality, outputFormat: record.outputFormat },
        fileName: record.fileName,
        mimeType: record.mimeType,
        totalBytes: record.totalBytes,
        driveId: record.driveId,
        webViewLink: record.webViewLink,
        serverMetrics: record.serverMetrics,
        ...override,
      })

      const toPausedFile = (record: PersistedUploadRecord): UploadFile => {
        const totalBytes = record.totalBytes ?? record.processedBlob?.size ?? record.file.size
        const uploadPct = totalBytes > 0
          ? Math.round(((record.uploadedBytes ?? 0) / totalBytes) * 60)
          : 0

        return {
          id: record.id,
          file: record.file,
          status: 'paused',
          progress: record.processedBlob ? Math.min(99, 40 + uploadPct) : 0,
          preview: record.preview,
          fingerprint: record.fingerprint,
          options: {
            quality: record.quality,
            outputFormat: record.outputFormat,
          },
          fileName: record.fileName,
          mimeType: record.mimeType,
          processedBlob: record.processedBlob,
          // sessionUri가 만료된 경우 undefined로 초기화되어 있음
          sessionUri: record.sessionUri,
          uploadedBytes: record.uploadedBytes,
          totalBytes,
          driveId: record.driveId,
          webViewLink: record.webViewLink,
          serverMetrics: record.serverMetrics,
          error: record.error,
        }
      }

      // createdAt 순으로 정렬된 레코드를 그대로 순회하며 단일 배열에 복원해 추가 순서를 보존한다.
      const restored: UploadFile[] = []
      let doneCount = 0
      let errorCount = 0

      for (const record of records) {
        const totalBytes = record.totalBytes ?? record.processedBlob?.size
        const isAlreadyComplete =
          record.status === 'done' ||
          Boolean(record.driveId) ||
          (Boolean(totalBytes) && record.uploadedBytes >= totalBytes!)

        if (isAlreadyComplete) {
          // 완료 레코드는 삭제하지 않고 done으로 복원 → 여러 번 새로고침해도 유지됨
          restored.push(toDoneFile(record))
          doneCount++
          continue
        }

        if (record.sessionUri && totalBytes) {
          try {
            const offset = await getDriveUploadedBytes(record.sessionUri, totalBytes)
            if (offset.done) {
              // Drive에서 완료 확인 → done으로 복원하고 레코드도 done으로 갱신
              patchUploadRecord(record.id, {
                status: 'done',
                driveId: offset.id,
                webViewLink: offset.webViewLink,
                processedBlob: undefined,
                sessionUri: undefined,
              }).catch(() => {})
              restored.push(
                toDoneFile(record, { driveId: offset.id, webViewLink: offset.webViewLink ?? '' }),
              )
              doneCount++
              continue
            }
            record.uploadedBytes = offset.uploadedBytes
            patchUploadRecord(record.id, { uploadedBytes: offset.uploadedBytes }).catch(() => {})
          } catch {
            // 세션 만료/네트워크 오류 → sessionUri를 초기화해서 재시작 시 새 세션을 얻도록 함
            record.sessionUri = undefined
            patchUploadRecord(record.id, { sessionUri: undefined }).catch(() => {})
          }
        }

        restored.push(toPausedFile(record))
        if (record.status === 'error') errorCount++
      }

      if (cancelled || restored.length === 0) return

      setFiles(restored)
      setSession((s) => ({
        ...s,
        totalFiles: restored.length,
        processedFiles: doneCount,
        // paused 파일은 아직 실패가 아니므로 failedFiles에 포함하지 않음
        failedFiles: errorCount,
      }))
    }).catch(() => {
      // IndexedDB를 사용할 수 없는 환경에서는 새 세션처럼 동작한다.
    })

    return () => {
      cancelled = true
    }
  }, [])

  const uploadOne = useCallback(async (item: UploadFile) => {
    if (cancelledIds.current.has(item.id)) return
    const opts = item.options ?? optionsRef.current

    setFiles((prev) =>
      prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading', progress: 5 } : f)),
    )

    try {
      // Step 1: client-side compress
      let blob = item.processedBlob
      let width = item.serverMetrics?.width ?? 0
      let height = item.serverMetrics?.height ?? 0
      let metrics = {
        compressTime: 0,
        resizeTime: item.serverMetrics?.resizeMs ?? 0,
        convertTime: 0,
        originalSize: item.serverMetrics?.originalSize ?? item.file.size,
        processedSize: item.serverMetrics?.resizedSize ?? item.processedBlob?.size ?? item.file.size,
      }
      let resizeMs = item.serverMetrics?.resizeMs ?? 0

      if (!blob) {
        const t0 = Date.now()
        const workerResult = await processWithWorker(item, opts)
        resizeMs = Date.now() - t0
        if (cancelledIds.current.has(item.id)) return

        blob = workerResult.blob
        width = workerResult.width
        height = workerResult.height
        metrics = workerResult.metrics

        const mimeType = blob.type || `image/${opts.outputFormat}`
        const baseName = item.file.name.replace(/\.[^.]+$/, '')
        const ext = opts.outputFormat
        const fileName = `${baseName}.${ext}`

        await patchUploadRecord(item.id, {
          processedBlob: blob,
          fileName,
          mimeType,
          totalBytes: blob.size,
          serverMetrics: {
            resizeMs,
            uploadMs: 0,
            width,
            height,
            originalSize: metrics.originalSize,
            resizedSize: metrics.processedSize,
            usedOriginal: false,
          },
          status: 'uploading',
          error: undefined,
        })

        item = { ...item, processedBlob: blob, fileName, mimeType, totalBytes: blob.size }
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id
            ? {
                ...f,
                progress: 30,
                processedBlob: blob,
                totalBytes: blob.size,
                fileName: item.fileName,
                mimeType: item.mimeType,
                error: undefined,
              }
            : f,
        ),
      )

      const mimeType = item.mimeType ?? blob.type ?? `image/${opts.outputFormat}`
      const baseName = item.file.name.replace(/\.[^.]+$/, '')
      const ext = opts.outputFormat
      const fileName = item.fileName ?? `${baseName}.${ext}`

      // Step 2: get Drive resumable session URI
      const sessionUri = item.sessionUri ?? await getSessionUri(fileName, mimeType, blob.size)
      if (cancelledIds.current.has(item.id)) return

      if (!item.sessionUri) {
        await patchUploadRecord(item.id, {
          sessionUri,
          fileName,
          mimeType,
          totalBytes: blob.size,
          status: 'uploading',
          error: undefined,
        })
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id
            ? { ...f, sessionUri, fileName, mimeType, progress: 40 }
            : f,
        ),
      )

      // Step 3: upload directly to Drive
      const t1 = Date.now()
      const offset = await getDriveUploadedBytes(sessionUri, blob.size)
      if (offset.done && offset.id) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? {
                  ...f,
                  status: 'done',
                  progress: 100,
                  driveId: offset.id,
                  webViewLink: offset.webViewLink ?? '',
                  error: undefined,
                }
              : f,
          ),
        )
        // 완료 레코드는 삭제하지 않고 done으로 보존 (새로고침 후 복원용). 무거운 blob/세션은 비움.
        await patchUploadRecord(item.id, {
          status: 'done',
          driveId: offset.id,
          webViewLink: offset.webViewLink ?? '',
          processedBlob: undefined,
          sessionUri: undefined,
          error: undefined,
        })
        return
      }

      await patchUploadRecord(item.id, { uploadedBytes: offset.uploadedBytes, status: 'uploading' })

      const { id, webViewLink } = await uploadViaChunks(sessionUri, blob, offset.uploadedBytes, (uploadedBytes, pct) => {
        patchUploadRecord(item.id, {
          uploadedBytes,
          status: 'uploading',
          error: undefined,
        }).catch(() => {})
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? {
                  ...f,
                  uploadedBytes,
                  totalBytes: blob.size,
                  progress: 40 + Math.round(pct * 0.6),
                }
              : f,
          ),
        )
      })
      const uploadMs = Date.now() - t1

      if (cancelledIds.current.has(item.id)) return

      const finalServerMetrics = {
        resizeMs,
        uploadMs,
        width,
        height,
        originalSize: metrics.originalSize,
        resizedSize: metrics.processedSize,
        usedOriginal: false,
      }

      // 완료 레코드는 삭제하지 않고 done으로 보존 (새로고침 후 복원용). 무거운 blob/세션은 비움.
      await patchUploadRecord(item.id, {
        status: 'done',
        driveId: id,
        webViewLink,
        serverMetrics: finalServerMetrics,
        processedBlob: undefined,
        sessionUri: undefined,
        error: undefined,
      })

      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id
            ? {
                ...f,
                status: 'done',
                progress: 100,
                driveId: id,
                webViewLink,
                error: undefined,
                serverMetrics: finalServerMetrics,
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
      await patchUploadRecord(item.id, {
        status: 'paused',
        error: String(err),
      })
      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id ? { ...f, status: 'paused', error: String(err) } : f,
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
    // 일단 preview 없이 추가해서 즉시 렌더링
    const items: UploadFile[] = incoming.map((f) => ({
      id: generateId(),
      file: f,
      status: 'pending',
      progress: 0,
      preview: '',
      fingerprint: createFileFingerprint(f, optionsRef.current.quality, optionsRef.current.outputFormat),
      options: {
        quality: optionsRef.current.quality,
        outputFormat: optionsRef.current.outputFormat,
      },
      uploadedBytes: 0,
    }))

    // 배치 내 파일마다 고유하고 증가하는 createdAt를 부여해 추가 순서를 보존한다.
    // 새로고침 복원 후에도 기존 레코드(epoch ms)보다 항상 큰 값이 되도록 max로 보정한다.
    const baseOrder = Math.max(Date.now(), orderRef.current + 1)
    orderRef.current = baseOrder + items.length

    setFiles((prev) => {
      const next = [...prev, ...items]
      setSession((s) => ({
        ...s,
        totalFiles: s.totalFiles + items.length,
      }))
      return next
    })

    // 비동기로 저해상도 썸네일 생성 (원본 objectURL 즉시 해제)
    items.forEach((item) => {
      createThumbnail(item.file, 80, 0.5).then((dataUrl) => {
        patchUploadRecord(item.id, { preview: dataUrl }).catch(() => {})
        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, preview: dataUrl } : f)),
        )
      }).catch(() => { /* 썸네일 실패 시 빈 상태 유지 */ })
    })

    Promise.allSettled(items.map((item, index) =>
      saveUploadRecord({
        id: item.id,
        fingerprint: item.fingerprint!,
        file: item.file,
        preview: item.preview,
        outputFormat: item.options!.outputFormat,
        quality: item.options!.quality,
        uploadedBytes: 0,
        status: 'pending',
        createdAt: baseOrder + index,
        updatedAt: baseOrder + index,
      }),
    )).finally(() => {
      queueRef.current.push(...items)
      drainQueue()
    })
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
    patchUploadRecord(id, { status: 'cancelled' }).catch(() => {})
    setSession((s) => ({ ...s, totalFiles: Math.max(0, s.totalFiles - 1) }))
  }, [])

  const cancelAll = useCallback(() => {
    queueRef.current = []
    setFiles((prev) =>
      prev.map((f) => {
        if (f.status === 'pending' || f.status === 'uploading') {
          cancelledIds.current.add(f.id)
          patchUploadRecord(f.id, { status: 'cancelled' }).catch(() => {})
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
    // preview는 DataURL이므로 revokeObjectURL 불필요
    setFiles([])
    setSession(EMPTY_SESSION)
    setMemHistory([])
    setIsRunning(false)
    clearUploadRecords().catch(() => {})
  }, [])

  const retry = useCallback((id: string) => {
    let target: UploadFile | undefined
    let wasCancelled = false
    let wasError = false

    setFiles((prev) =>
      prev.map((f) => {
        if (f.id === id && (f.status === 'error' || f.status === 'cancelled' || f.status === 'paused')) {
          wasCancelled = f.status === 'cancelled'
          wasError = f.status === 'error'
          target = {
            ...f,
            status: 'pending',
            progress: f.status === 'paused' ? f.progress : 0,
            error: undefined,
          }
          return target
        }
        return f
      }),
    )

    if (!target) return

    // 취소 플래그 제거
    cancelledIds.current.delete(id)
    patchUploadRecord(id, {
      status: 'pending',
      error: undefined,
    }).catch(() => {})

    // 세션 카운터 보정: paused는 failedFiles에 포함되지 않으므로 감소시키지 않음
    setSession((s) => ({
      ...s,
      totalFiles: wasCancelled ? s.totalFiles + 1 : s.totalFiles,
      failedFiles: wasError ? Math.max(0, s.failedFiles - 1) : s.failedFiles,
    }))

    queueRef.current.push(target)
    drainQueue()
  }, [drainQueue])

  const resumePaused = useCallback(() => {
    let targets: UploadFile[] = []

    setFiles((prev) =>
      prev.map((f) => {
        if (f.status !== 'paused') return f

        const target = {
          ...f,
          status: 'pending' as const,
          error: undefined,
        }
        targets = [...targets, target]
        return target
      }),
    )

    if (targets.length === 0) return

    targets.forEach((target) => {
      cancelledIds.current.delete(target.id)
      patchUploadRecord(target.id, {
        status: 'pending',
        error: undefined,
      }).catch(() => {})
    })

    // paused 파일은 failedFiles 카운터에 포함되지 않으므로 감소시키지 않음
    // setSession은 totalFiles 등 변경 없이 그대로 유지

    queueRef.current.push(...targets)
    drainQueue()
  }, [drainQueue])

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
    retry,
    resumePaused,
    setOptions,
  }
}
