export type OutputFormat = 'jpeg' | 'webp' | 'png'

export type FileStatus = 'pending' | 'uploading' | 'done' | 'error' | 'cancelled'

export interface ProcessingOptions {
  quality: number // 1 ~ 100 (integer)
  outputFormat: OutputFormat
}

export interface ServerMetrics {
  resizeMs: number
  uploadMs: number
  width: number
  height: number
  originalSize: number
  resizedSize: number
  usedOriginal: boolean
}

export interface UploadFile {
  id: string
  file: File
  status: FileStatus
  progress: number
  preview: string
  driveId?: string
  webViewLink?: string
  serverMetrics?: ServerMetrics
  error?: string
}

export interface SessionMetrics {
  totalFiles: number
  processedFiles: number
  failedFiles: number
  totalOriginalSize: number
  totalResizedSize: number
  avgResizeMs: number
  avgUploadMs: number
  peakMemoryMB: number
  elapsedMs: number
}

export interface MemorySnapshot {
  t: number
  mb: number
}
