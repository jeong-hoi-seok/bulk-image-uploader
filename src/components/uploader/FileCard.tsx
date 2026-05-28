'use client'

import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { formatBytes } from '@/lib/imageProcessor'
import type { UploadFile } from '@/types/image'

const STATUS_LABEL: Record<UploadFile['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '대기', variant: 'secondary' },
  processing: { label: '처리중', variant: 'default' },
  done: { label: '완료', variant: 'outline' },
  error: { label: '오류', variant: 'destructive' },
  cancelled: { label: '취소', variant: 'secondary' },
}

interface FileCardProps {
  file: UploadFile
  onCancel?: (id: string) => void
  onDownload?: (id: string) => void
}

export function FileCard({ file, onCancel, onDownload }: FileCardProps) {
  const s = STATUS_LABEL[file.status]

  return (
    <div className="flex gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
      <div className="relative w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-zinc-800">
        {file.preview && (
          <Image src={file.preview} alt={file.file.name} fill className="object-cover" unoptimized />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-white truncate">{file.file.name}</p>
          <Badge variant={s.variant} className="flex-shrink-0 text-xs">{s.label}</Badge>
        </div>

        <p className="text-xs text-zinc-500 mb-2">
          {formatBytes(file.file.size)}
          {file.metrics && (
            <>
              {' → '}
              <span className="text-emerald-400">{formatBytes(file.metrics.processedSize)}</span>
              {' '}
              <span className="text-zinc-600">
                ({((1 - file.metrics.processedSize / file.metrics.originalSize) * 100).toFixed(1)}% 감소)
              </span>
            </>
          )}
        </p>

        {(file.status === 'processing' || file.status === 'pending') && (
          <Progress value={file.progress} className="h-1" />
        )}

        {file.metrics && (
          <p className="text-xs text-zinc-600 mt-1">
            압축 {file.metrics.compressTime.toFixed(0)}ms · 변환 {file.metrics.convertTime.toFixed(0)}ms
          </p>
        )}

        {file.error && <p className="text-xs text-red-400 mt-1">{file.error}</p>}
      </div>

      <div className="flex flex-col gap-1 flex-shrink-0">
        {(file.status === 'pending' || file.status === 'processing') && onCancel && (
          <button
            onClick={() => onCancel(file.id)}
            className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
          >
            취소
          </button>
        )}
        {file.status === 'done' && file.processedUrl && onDownload && (
          <button
            onClick={() => onDownload(file.id)}
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            저장
          </button>
        )}
      </div>
    </div>
  )
}
