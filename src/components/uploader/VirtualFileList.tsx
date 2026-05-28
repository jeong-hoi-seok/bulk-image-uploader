'use client'

import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { FileCard } from './FileCard'
import type { UploadFile } from '@/types/image'

interface VirtualFileListProps {
  files: UploadFile[]
  onCancel?: (id: string) => void
  onRetry?: (id: string) => void
}

export function VirtualFileList({ files, onCancel, onRetry }: VirtualFileListProps) {
  const virtualizer = useWindowVirtualizer({
    count: files.length,
    estimateSize: () => 88, // FileCard 예상 높이 + gap
    overscan: 5,
    gap: 8,
  })

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {virtualItems.map((vItem) => {
        const file = files[vItem.index]
        return (
          <div
            key={file.id}
            data-index={vItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${vItem.start}px)`,
            }}
          >
            <FileCard file={file} onCancel={onCancel} onRetry={onRetry} />
          </div>
        )
      })}
    </div>
  )
}
