'use client'

import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { formatBytes } from '@/lib/imageProcessor'
import type { UploadFile } from '@/types/image'

const STATUS: Record<
  UploadFile['status'],
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: '대기', variant: 'secondary' },
  uploading: { label: '업로드 중', variant: 'default' },
  done: { label: '완료', variant: 'default' },
  error: { label: '오류', variant: 'destructive' },
  cancelled: { label: '취소', variant: 'secondary' },
}

interface FileCardProps {
  file: UploadFile
  onCancel?: (id: string) => void
}

export function FileCard({ file, onCancel }: FileCardProps) {
  const s = STATUS[file.status]
  const m = file.serverMetrics

  return (
    <div className="flex gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
      <div className="relative w-14 h-14 flex-shrink-0 rounded overflow-hidden bg-zinc-800">
        {file.preview && (
          <Image src={file.preview} alt={file.file.name} fill className="object-cover" unoptimized />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-white truncate">{file.file.name}</p>
          {file.status === 'done' ? (
            <span className="shrink-0 text-xs text-emerald-400">완료</span>
          ) : (
            <Badge variant={s.variant} className="shrink-0 text-xs">{s.label}</Badge>
          )}
        </div>

        {m ? (
          <>
            <p className="text-xs text-zinc-500">
              {m.width}×{m.height}px · {formatBytes(m.originalSize)}
              {m.usedOriginal ? (
                <span className="text-zinc-500"> · 원본 최적</span>
              ) : (
                <>
                  {' → '}
                  <span className="text-emerald-400">{formatBytes(m.resizedSize)}</span>
                  {' '}
                  <span className="text-zinc-600">
                    ({((1 - m.resizedSize / m.originalSize) * 100).toFixed(1)}% 감소)
                  </span>
                </>
              )}
            </p>
            <p className="text-xs text-zinc-600 mt-0.5">
              리사이즈 {m.resizeMs}ms · Drive 업로드 {m.uploadMs}ms
            </p>
          </>
        ) : (
          <p className="text-xs text-zinc-600">{formatBytes(file.file.size)}</p>
        )}

        {file.status === 'uploading' && (
          <Progress value={file.progress} className="h-1 mt-2" />
        )}
        {file.error && <p className="text-xs text-red-400 mt-1">{file.error}</p>}
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {(file.status === 'pending' || file.status === 'uploading') && onCancel && (
          <button
            onClick={() => onCancel(file.id)}
            className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
          >
            취소
          </button>
        )}
        {file.status === 'done' && file.webViewLink && (
          <a
            href={file.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Drive →
          </a>
        )}
      </div>
    </div>
  )
}
