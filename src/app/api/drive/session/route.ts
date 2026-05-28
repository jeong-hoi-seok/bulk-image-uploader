import { NextRequest, NextResponse } from 'next/server'
import { createResumableUploadSession } from '@/lib/googleDrive'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

export async function POST(req: NextRequest) {
  const { ok, retryAfter } = checkRateLimit(getIp(req))
  if (!ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  let body: { name: string; mimeType: string; size: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, mimeType, size } = body
  if (!name || !mimeType || !size) {
    return NextResponse.json({ error: 'name, mimeType, size required' }, { status: 400 })
  }

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return NextResponse.json({ error: `Unsupported type: ${mimeType}` }, { status: 400 })
  }

  try {
    const sessionUri = await createResumableUploadSession(name, mimeType, size)
    return NextResponse.json({ sessionUri })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
