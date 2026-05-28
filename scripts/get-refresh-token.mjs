/**
 * One-time script to get a Google OAuth2 refresh token.
 * Run: node scripts/get-refresh-token.mjs
 *
 * Prerequisites:
 * 1. Google Cloud Console → APIs & Services → Credentials
 * 2. Create "OAuth 2.0 Client ID" (type: Web application)
 * 3. Add authorized redirect URI: http://localhost:4321/callback
 * 4. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env
 */

import { createServer } from 'http'
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env manually (no dotenv needed)
const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const CLIENT_ID = env.GOOGLE_OAUTH_CLIENT_ID
const CLIENT_SECRET = env.GOOGLE_OAUTH_CLIENT_SECRET
const REDIRECT_URI = 'http://localhost:4321/callback'

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌  GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not set in .env')
  process.exit(1)
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive.file'],
})

console.log('\n1. 아래 URL을 브라우저에서 열어 Google 계정으로 로그인:\n')
console.log(authUrl)
console.log('\n2. 로그인 완료 후 자동으로 refresh token 출력됩니다...\n')

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:4321')
  const code = url.searchParams.get('code')

  if (!code) {
    res.end('No code received')
    return
  }

  try {
    const { tokens } = await oauth2.getToken(code)
    res.end('<h2>✅ 완료! 터미널을 확인하세요.</h2>')

    console.log('\n✅ 발급 완료! 아래 값을 .env에 추가하세요:\n')
    console.log(`GOOGLE_OAUTH_CLIENT_ID=${CLIENT_ID}`)
    console.log(`GOOGLE_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`)
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`)
    console.log()
  } catch (err) {
    res.end('Error: ' + err.message)
    console.error(err)
  } finally {
    server.close()
  }
})

server.listen(4321)
