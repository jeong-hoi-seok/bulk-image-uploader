'use client'

import { useCallback, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { formatBytes } from '@/lib/imageProcessor'

interface DriveResult {
  name: string
  driveId: string
  webViewLink: string
  originalSize: number
  resizedSize: number
  width: number
  height: number
  resizeMs: number
  uploadMs: number
}

interface DriveError {
  name: string
  error: string
}

type UploadState = 'idle' | 'uploading' | 'done' | 'error'

export function DriveUploader() {
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<DriveResult[]>([])
  const [errors, setErrors] = useState<DriveError[]>([])
  const [selectedCount, setSelectedCount] = useState(0)
  const filesRef = useRef<File[]>([])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    filesRef.current = files
    setSelectedCount(files.length)
    setState('idle')
    setResults([])
    setErrors([])
  }, [])

  const handleUpload = useCallback(async () => {
    const files = filesRef.current
    if (!files.length) return

    setState('uploading')
    setProgress(10)

    const formData = new FormData()
    files.forEach((f) => formData.append('files', f))

    try {
      setProgress(30)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      setProgress(90)

      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg)
      }

      const data = await res.json()
      setResults(data.results ?? [])
      setErrors(data.errors ?? [])
      setState('done')
    } catch (err) {
      setErrors([{ name: 'request', error: String(err) }])
      setState('error')
    } finally {
      setProgress(100)
    }
  }, [])

  const ratio = (r: DriveResult) =>
    ((1 - r.resizedSize / r.originalSize) * 100).toFixed(1)

  return (
    <div className="space-y-4">
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4 space-y-4">
          <div>
            <p className="text-xs text-zinc-400 mb-2">이미지 선택 (복수)</p>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              disabled={state === 'uploading'}
              className="text-sm text-zinc-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs hover:file:bg-zinc-600 file:cursor-pointer disabled:opacity-50"
            />
            {selectedCount > 0 && (
              <p className="text-xs text-zinc-500 mt-1">{selectedCount}개 선택됨</p>
            )}
          </div>

          <button
            onClick={handleUpload}
            disabled={!selectedCount || state === 'uploading'}
            className="w-full px-4 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {state === 'uploading' ? '업로드 중...' : `Google Drive 업로드 (서버 리사이즈 → 1000px)`}
          </button>

          {state === 'uploading' && (
            <Progress value={progress} className="h-1" />
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-400">{results.length}개 업로드 완료</p>
          {results.map((r) => (
            <Card key={r.driveId} className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{r.name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {r.width}×{r.height}px ·{' '}
                      <span className="text-zinc-400">{formatBytes(r.originalSize)}</span>
                      {' → '}
                      <span className="text-emerald-400">{formatBytes(r.resizedSize)}</span>
                      {' '}
                      <span className="text-zinc-600">({ratio(r)}% 감소)</span>
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      리사이즈 {r.resizeMs}ms · 업로드 {r.uploadMs}ms
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-800">Drive</Badge>
                    <a
                      href={r.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      열기 →
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-400">
              {e.name}: {e.error}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
