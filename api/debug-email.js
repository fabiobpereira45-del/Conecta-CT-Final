/**
 * Diagnóstico temporário: GET /api/debug-email?id=<id da mensagem>
 * Mostra os labels (SENT, INBOX, etc.) e metadados de uma mensagem enviada,
 * para confirmar se o Gmail realmente a registrou em "Enviados".
 */
const cors = require('../lib/cors')
const { google } = require('googleapis')

function getGmailClient() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env
  const oauth2Client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, 'urn:ietf:wg:oauth:2.0:oob')
  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN })
  return google.gmail({ version: 'v1', auth: oauth2Client })
}

module.exports = async function handler(req, res) {
  if (cors(req, res)) return
  const { id } = req.query
  try {
    const gmail = getGmailClient()
    const profile = await gmail.users.getProfile({ userId: 'me' })
    if (!id) {
      const list = await gmail.users.messages.list({ userId: 'me', maxResults: 5, labelIds: ['SENT'] })
      return res.status(200).json({ contaAutenticada: profile.data.emailAddress, ultimasEnviadas: list.data.messages || [] })
    }
    const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'To', 'From', 'Date'] })
    return res.status(200).json({
      contaAutenticada: profile.data.emailAddress,
      id: msg.data.id,
      threadId: msg.data.threadId,
      labelIds: msg.data.labelIds,
      headers: msg.data.payload.headers,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack })
  }
}
