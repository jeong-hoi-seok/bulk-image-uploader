import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { uploadToDrive } from '@/lib/googleDrive'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_WIDTH = 1000
const MAX_FILES = 50
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_FILE_SIZE = 20 * 1024 * 1024

interface UploadResult {
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

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function guardBot(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin')
  const referer = req.headers.get('referer')
  const contentType = req.headers.get('content-type') ?? ''
  const userAgent = req.headers.get('user-agent') ?? ''

  // Must be multipart form
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Must have browser-like user-agent
  if (!userAgent || /curl|python|wget|bot|spider|scrapy/i.test(userAgent)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // In production: origin must match host
  if (process.env.NODE_ENV === 'production') {
    const host = req.headers.get('host')
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
  // Bot guard
  const botBlock = guardBot(req)
  if (botBlock) return botBlock

  // Rate limit
  const ip = getIp(req)
  const { ok, retryAfter } = checkRateLimit(ip)
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
  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Max ${MAX_FILES} files per request` }, { status: 400 })
  }

  const results: UploadResult[] = []
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
      const meta = await image.metadata()

      const pipeline = (meta.width ?? 0) > MAX_WIDTH
        ? image.resize({ width: MAX_WIDTH, withoutEnlargement: true })
        : image

      const { data: resizedBuffer, info } = await pipeline
        .jpeg({ quality: 85, progressive: true })
        .toBuffer({ resolveWithObject: true })

      const resizeMs = Date.now() - t0

      const t1 = Date.now()
      const baseName = file.name.replace(/\.[^.]+$/, '')
      const { id, webViewLink } = await uploadToDrive(
        resizedBuffer,
        `${baseName}_${info.width}x${info.height}.jpg`,
        'image/jpeg',
      )
      const uploadMs = Date.now() - t1

      results.push({
        name: file.name,
        driveId: id,
        webViewLink,
        originalSize,
        resizedSize: resizedBuffer.length,
        width: info.width,
        height: info.height,
        resizeMs,
        uploadMs,
      })
    } catch (err) {
      errors.push({ name: file.name, error: String(err) })
    }
  }

  return NextResponse.json({ results, errors })
}
