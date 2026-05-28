import 'server-only'
import { google } from 'googleapis'
import { Readable } from 'stream'

function getAuth() {
  const credentials = {
    type: process.env.GOOGLE_TYPE,
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    // .env.local에서 \n이 이스케이프되므로 복원
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: process.env.GOOGLE_AUTH_URI,
    token_uri: process.env.GOOGLE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
    universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN ?? 'googleapis.com',
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google credentials env vars not set. Check .env.local')
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  })
}

export async function uploadToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{ id: string; webViewLink: string }> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID env not set')

  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id, webViewLink',
  })

  return {
    id: res.data.id!,
    webViewLink: res.data.webViewLink ?? '',
  }
}
