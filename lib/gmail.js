/**
 * Envio de e-mail via Gmail API (OAuth2), usando as mesmas credenciais do polling
 * (scripts/gmail-polling.js). Usa a conta GMAIL_USER como remetente real.
 */
const { google } = require('googleapis')

function getGmailClient() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error('Credenciais do Gmail não configuradas (GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN).')
  }
  const oauth2Client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, 'urn:ietf:wg:oauth:2.0:oob')
  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN })
  return google.gmail({ version: 'v1', auth: oauth2Client })
}

// RFC 2047: necessário para acentos em cabeçalhos (From/Subject)
function encodeHeader(str) {
  return '=?UTF-8?B?' + Buffer.from(String(str), 'utf8').toString('base64') + '?='
}

function wrapBase64(b64) {
  return b64.match(/.{1,76}/g).join('\r\n')
}

function base64Body(str) {
  return wrapBase64(Buffer.from(String(str), 'utf8').toString('base64'))
}

/**
 * @param {{to:string, cc?:string, subject:string, body:string, replyTo?:string, fromName?:string,
 *          attachment?: {filename:string, contentBase64:string, mimeType?:string}}} opts
 */
async function enviarEmail({ to, cc, subject, body, replyTo, fromName, attachment }) {
  if (!to) throw new Error('Destinatário obrigatório.')
  if (!subject) throw new Error('Assunto obrigatório.')
  if (!body) throw new Error('Mensagem obrigatória.')

  const from = process.env.GMAIL_USER
  if (!from) throw new Error('GMAIL_USER não configurado.')

  if (attachment) {
    const tamanhoBytes = Buffer.byteLength(attachment.contentBase64, 'base64')
    if (tamanhoBytes > 10 * 1024 * 1024) throw new Error('Anexo maior que 10 MB.')
  }

  const cabecalho = [
    `From: ${encodeHeader(fromName || 'Conecta-CT')} <${from}>`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    replyTo && replyTo !== from ? `Reply-To: ${replyTo}` : null,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
  ].filter(Boolean)

  let raw
  if (attachment) {
    const boundary = 'conectaCT_' + Date.now().toString(36) + Math.random().toString(36).slice(2)
    const nomeLimpo = String(attachment.filename || 'documento.pdf').replace(/"/g, '')
    raw = cabecalho.concat([`Content-Type: multipart/mixed; boundary="${boundary}"`]).join('\r\n') + '\r\n\r\n' +
      `--${boundary}\r\n` +
      'Content-Type: text/plain; charset="UTF-8"\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64Body(body) + '\r\n\r\n' +
      `--${boundary}\r\n` +
      `Content-Type: ${attachment.mimeType || 'application/pdf'}; name="${nomeLimpo}"\r\n` +
      `Content-Disposition: attachment; filename="${nomeLimpo}"\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      wrapBase64(attachment.contentBase64) + '\r\n\r\n' +
      `--${boundary}--`
  } else {
    raw = cabecalho.concat(['Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64']).join('\r\n') +
      '\r\n\r\n' + base64Body(body)
  }

  const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const gmail = getGmailClient()
  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } })
  return res.data
}

module.exports = { enviarEmail }
