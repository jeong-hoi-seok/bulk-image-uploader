import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const CHUNK_LIMIT = 4 * 1024 * 1024 // 4 MB

export async function POST(req: NextRequest) {
  const sessionUri = req.headers.get('x-drive-session')
  const rangeStart = req.headers.get('x-range-start')
  const rangeTotal = req.headers.get('x-range-total')

  if (!sessionUri || rangeStart === null || rangeTotal === null) {
    return NextResponse.json({ error: 'Missing x-drive-session / x-range-start / x-range-total' }, { status: 400 })
  }

  if (!sessionUri.startsWith('https://www.googleapis.com/upload/drive/')) {
    return NextResponse.json({ error: 'Invalid session URI' }, { status: 400 })
  }

  const body = await req.arrayBuffer()
  if (body.byteLength > CHUNK_LIMIT) {
    return NextResponse.json({ error: 'Chunk too large (max 4 MB)' }, { status: 413 })
  }

  const start = Number(rangeStart)
  const total = Number(rangeTotal)
  const end = start + body.byteLength - 1

  const driveRes = await fetch(sessionUri, {
    method: 'PUT',
    headers: {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Type': 'application/octet-stream',
    },
    body: body,
  })

  // 308 = resume incomplete (more chunks needed)
  if (driveRes.status === 308) {
    return NextResponse.json({ done: false })
  }

  // 200 / 201 = upload complete
  if (driveRes.status === 200 || driveRes.status === 201) {
    const data = await driveRes.json()
    return NextResponse.json({ done: true, id: data.id, webViewLink: data.webViewLink ?? '' })
  }

  const text = await driveRes.text()
  return NextResponse.json({ error: `Drive error ${driveRes.status}: ${text}` }, { status: 502 })
}
