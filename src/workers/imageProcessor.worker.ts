import imageCompression from 'browser-image-compression'
import type { OutputFormat } from '@/types/image'

interface WorkerMessage {
  id: string
  file: File
  maxWidthOrHeight?: number
  quality: number
  outputFormat: OutputFormat
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

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { id, file, maxWidthOrHeight, quality, outputFormat } = e.data

  try {
    const originalSize = file.size
    const t0 = performance.now()

    // Resize + compress
    const compressed = await imageCompression(file, {
      ...(maxWidthOrHeight ? { maxWidthOrHeight } : {}),
      useWebWorker: false, // already in worker
      initialQuality: quality,
      fileType: `image/${outputFormat}`,
    })
    const t1 = performance.now()

    // Format convert via canvas if needed
    let finalBlob: Blob
    let width: number
    let height: number
    if (outputFormat === 'webp' || outputFormat === 'png') {
      const bitmap = await createImageBitmap(compressed)
      width = bitmap.width
      height = bitmap.height
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      finalBlob = await canvas.convertToBlob({ type: `image/${outputFormat}`, quality })
    } else {
      const bitmap = await createImageBitmap(compressed)
      width = bitmap.width
      height = bitmap.height
      finalBlob = compressed
    }
    const t2 = performance.now()

    const result: WorkerResult = {
      id,
      blob: finalBlob,
      width,
      height,
      metrics: {
        compressTime: t1 - t0,
        resizeTime: t1 - t0,
        convertTime: t2 - t1,
        originalSize,
        processedSize: finalBlob.size,
      },
    }

    self.postMessage({ type: 'done', ...result })
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err) })
  }
}
