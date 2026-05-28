'use client'

import { useCallback } from 'react'
import { cn } from '@/lib/utils'

interface DropZoneProps {
  onFiles: (files: File[]) => void
  disabled?: boolean
}

export function DropZone({ onFiles, disabled }: DropZoneProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (disabled) return
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/'),
      )
      if (files.length) onFiles(files)
    },
    [onFiles, disabled],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      if (files.length) onFiles(files)
      e.target.value = ''
    },
    [onFiles],
  )

  return (
    <label
      className={cn(
        'flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-colors',
        'border-zinc-600 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-400',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="flex flex-col items-center gap-2 pointer-events-none">
        <svg
          className="w-10 h-10 text-zinc-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="text-zinc-400 text-sm">
          드래그 앤 드롭 또는 <span className="text-white font-medium">클릭</span>하여 이미지 선택
        </p>
        <p className="text-zinc-600 text-xs">PNG, JPG, WEBP, GIF 지원 · 복수 선택 가능</p>
      </div>
      <input
        type="file"
        className="hidden"
        accept="image/*"
        multiple
        onChange={handleChange}
        disabled={disabled}
      />
    </label>
  )
}
