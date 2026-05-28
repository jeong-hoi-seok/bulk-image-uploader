export type OutputFormat = 'jpeg' | 'webp' | 'png'

export type FileStatus = 'pending' | 'processing' | 'done' | 'error' | 'cancelled'

export interface ProcessingOptions {
  maxWidthOrHeight: number
  quality: number // 0.1 ~ 1.0
  outputFormat: OutputFormat
  concurrency: number
}

export interface FileMetrics {
  compressTime: number
  resizeTime: number
  convertTime: number
  originalSize: number
  processedSize: number
}

export interface UploadFile {
  id: string
  file: File
  status: FileStatus
  progress: number
  preview: string
  processedBlob?: Blob
  processedUrl?: string
  metrics?: FileMetrics
  error?: string
}

export interface SessionMetrics {
  totalFiles: number
  processedFiles: number
  failedFiles: number
  totalOriginalSize: number
  totalProcessedSize: number
  avgCompressTime: number
  avgResizeTime: number
  peakMemoryMB: number
  startTime: number
  endTime?: number
}

export interface MemorySnapshot {
  timestamp: number
  usedMB: number
  totalMB: number
}
