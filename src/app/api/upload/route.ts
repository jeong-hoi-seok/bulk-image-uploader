import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { uploadToDrive } from '@/lib/googleDrive'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_FILES = 50
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_FILE_SIZE = 20 * 1024 * 1024

export interface FileResult {
  name: string
  driveId: string
  webViewLink: string
  originalSize: number
  resizedSize: number
  width: number
  height: number
  resizeMs: number
  uploadMs: number
  usedOriginal: boolean
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function guardBot(req: NextRequest): NextResponse | null {
  const contentType = req.headers.get('content-type') ?? ''
  const userAgent = req.headers.get('user-agent') ?? ''

  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!userAgent || /curl|python|wget|bot|spider|scrapy/i.test(userAgent)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (process.env.NODE_ENV === 'production') {
    const host = req.headers.get('host')
    const origin = req.headers.get('origin')
    const referer = req.headers.get('referer')
    const expectedOrigins = host ? [`https://${host}`, `http://${host}`] : []
    if (origin && !expectedOrigins.some((o) => origin.startsWith(o))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!origin && !referer) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  return null
}

export async function POST(req: NextRequest) {
  const botBlock = guardBot(req)
  if (botBlock) return botBlock

  const { ok, retryAfter } = checkRateLimit(getIp(req))
  if (!ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const files = formData.getAll('files') as File[]
  if (!files.length) return NextResponse.json({ error: 'No files' }, { status: 400 })
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Max ${MAX_FILES} files` }, { status: 400 })

  const quality = Math.min(Math.max(Math.round(Number(formData.get('quality') ?? 85)), 1), 100)
  const rawFormat = formData.get('outputFormat') ?? 'jpeg'
  const outputFormat = ['jpeg', 'webp', 'png'].includes(String(rawFormat))
    ? (String(rawFormat) as 'jpeg' | 'webp' | 'png')
    : 'jpeg'

  const results: FileResult[] = []
  const errors: { name: string; error: string }[] = []

  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      errors.push({ name: file.name, error: `Unsupported type: ${file.type}` })
      continue
    }
    if (file.size > MAX_FILE_SIZE) {
      errors.push({ name: file.name, error: `Too large: ${(file.size / 1024 / 1024).toFixed(1)}MB` })
      continue
    }

    try {
      const inputBuffer = Buffer.from(await file.arrayBuffer())
      const originalSize = inputBuffer.length

      const t0 = Date.now()
      const image = sharp(inputBuffer)
      let pipeline: sharp.Sharp

      if (outputFormat === 'webp') {
        pipeline = image.webp({ quality })
      } else if (outputFormat === 'png') {
        pipeline = image.png({ quality, compressionLevel: 9 })
      } else {
        pipeline = image.jpeg({ quality, progressive: true })
      }

      const { data: convertedBuffer, info } = await pipeline
        .toBuffer({ resolveWithObject: true })
      const resizeMs = Date.now() - t0

      // use original if conversion made it larger
      const useOriginal = convertedBuffer.length >= originalSize
      const finalBuffer = useOriginal ? inputBuffer : convertedBuffer
      const finalMime = useOriginal ? file.type : `image/${outputFormat}`
      const finalExt = useOriginal ? file.name.split('.').pop() ?? 'jpg' : outputFormat

      const t1 = Date.now()
      const baseName = file.name.replace(/\.[^.]+$/, '')
      const { id, webViewLink } = await uploadToDrive(
        finalBuffer,
        `${baseName}_${info.width}x${info.height}.${finalExt}`,
        finalMime,
      )
      const uploadMs = Date.now() - t1

      results.push({
        name: file.name,
        driveId: id,
        webViewLink,
        originalSize,
        resizedSize: finalBuffer.length,
        width: info.width,
        height: info.height,
        resizeMs,
        uploadMs,
        usedOriginal: useOriginal,
      })
    } catch (err) {
      errors.push({ name: file.name, error: String(err) })
    }
  }

  return NextResponse.json({ results, errors })
}
