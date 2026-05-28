import imageCompression from 'browser-image-compression'
import type { FileMetrics, OutputFormat } from '@/types/image'

export async function processImage(
  file: File,
  options: { maxWidthOrHeight: number; quality: number; outputFormat: OutputFormat },
  onProgress?: (p: number) => void,
): Promise<{ blob: Blob; metrics: FileMetrics }> {
  const originalSize = file.size
  const t0 = performance.now()

  onProgress?.(10)

  const compressed = await imageCompression(file, {
    maxWidthOrHeight: options.maxWidthOrHeight,
    useWebWorker: true,
    initialQuality: options.quality,
    fileType: `image/${options.outputFormat}`,
    onProgress: (p) => onProgress?.(10 + p * 0.6),
  })

  const t1 = performance.now()
  onProgress?.(70)

  let finalBlob: Blob

  if (options.outputFormat === 'webp' || options.outputFormat === 'png') {
    const bitmap = await createImageBitmap(compressed)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)

    finalBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        `image/${options.outputFormat}`,
        options.quality,
      )
    })
  } else {
    finalBlob = compressed
  }

  const t2 = performance.now()
  onProgress?.(100)

  return {
    blob: finalBlob,
    metrics: {
      compressTime: t1 - t0,
      resizeTime: t1 - t0,
      convertTime: t2 - t1,
      originalSize,
      processedSize: finalBlob.size,
    },
  }
}

export function getMemoryMB(): number | null {
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  if (!mem) return null
  return mem.usedJSHeapSize / 1024 / 1024
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function generateId(): string {
  return crypto.randomUUID()
}
