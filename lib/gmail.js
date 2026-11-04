/**
 * Envio de e-mail via Gmail API (OAuth2).
 *
 * Suporta múltiplos conselhos tutelares:
 * - O CT XIII Narandiba utiliza as credenciais de conselho.narandiba@salvador.ba.gov.br.
 * - Outros conselhos podem ter suas credenciais configuradas via variáveis específicas:
 *     GMAIL_USER_CT_<NUM>, GMAIL_REFRESH_TOKEN_CT_<NUM> (ex: GMAIL_USER_CT_I, GMAIL_REFRESH_TOKEN_CT_I).
 * - Se um conselheiro de outro conselho tentar enviar e seu conselho ainda não tiver e-mail
 *   cadastrado, a solicitação é BLOQUEADA para não usar o e-mail de Narandiba indevidamente.
 */
const { google } = require('googleapis')

const ROMAN_MAP = {
  'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6,
  'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10, 'XI': 11, 'XII': 12,
  'XIII': 13, 'XIV': 14, 'XV': 15, 'XVI': 16, 'XVII': 17, 'XVIII': 18,
  'XIX': 19, 'XX': 20, 'XXI': 21, 'XXII': 22, 'XXIII': 23, 'XXIV': 24
}
const NUM_MAP = Object.fromEntries(Object.entries(ROMAN_MAP).map(([r, n]) => [String(n), r]))

function normalizeCouncil(val) {
  if (!val) return null
  const clean = String(val).toUpperCase().replace(/^CT[\s\-_–—]*/i, '').trim()
  if (ROMAN_MAP[clean]) return { roman: clean, num: ROMAN_MAP[clean] }
  if (NUM_MAP[clean]) return { roman: NUM_MAP[clean], num: parseInt(clean, 10) }
  return null
}

function getCredentialsForCouncil(councilVal, env = process.env) {
  const norm = normalizeCouncil(councilVal)
  const roman = norm ? norm.roman : null
  const num = norm ? norm.num : null

  // 1) Verifica se há credenciais específicas configuradas para este conselho
  if (roman && num) {
    const keys = [`CT_${roman}`, `CT${roman}`, roman, `CT_${num}`, `CT${num}`, String(num)]
    for (const k of keys) {
      const u = env[`GMAIL_USER_${k}`]
      const t = env[`GMAIL_REFRESH_TOKEN_${k}`]
      const cid = env[`GMAIL_CLIENT_ID_${k}`] || env.GMAIL_CLIENT_ID
      const sec = env[`GMAIL_CLIENT_SECRET_${k}`] || env.GMAIL_CLIENT_SECRET
      if (u && t && cid && sec) {
        return { user: u, refreshToken: t, clientId: cid, clientSecret: sec, council: roman }
      }
    }
  }

  // 2) Credenciais padrão do sistema (GMAIL_USER / GMAIL_REFRESH_TOKEN)
  const defaultUser = env.GMAIL_USER || ''
  const defaultToken = env.GMAIL_REFRESH_TOKEN || ''
  const defaultCid = env.GMAIL_CLIENT_ID || ''
  const defaultSec = env.GMAIL_CLIENT_SECRET || ''

  if (defaultUser && defaultToken && defaultCid && defaultSec) {
    const isNarandibaUser = defaultUser.toLowerCase().includes('narandiba')
    // Se o e-mail padrão configurado for do CT XIII Narandiba:
    // APENAS o CT XIII (ou num 13) tem permissão de usá-lo!
    if (isNarandibaUser) {
      if (roman === 'XIII' || num === 13) {
        return { user: defaultUser, refreshToken: defaultToken, clientId: defaultCid, clientSecret: defaultSec, council: 'XIII' }
      }
      // Qualquer outro conselho é expressamente impedido de usar o e-mail de Narandiba
      return null
    }

    // Se o defaultUser for de outro conselho mas coincidir com o conselho solicitado:
    if (roman === 'XIII' || num === 13) {
      return { user: defaultUser, refreshToken: defaultToken, clientId: defaultCid, clientSecret: defaultSec, council: 'XIII' }
    }
  }

  return null
}

function getGmailClient(creds) {
  const { clientId, clientSecret, refreshToken } = creds
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Credenciais do Gmail incompletas.')
  }
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob')
  oauth2Client.setCredentials({ refresh_token: refreshToken })
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
 *          attachment?: {filename:string, contentBase64:string, mimeType?:string},
 *          councilNum?: string|number, councilNome?: string}} opts
 */
async function enviarEmail({ to, cc, subject, body, replyTo, fromName, attachment, councilNum, councilNome }) {
  if (!to) throw new Error('Destinatário obrigatório.')
  if (!subject) throw new Error('Assunto obrigatório.')
  if (!body) throw new Error('Mensagem obrigatória.')

  // Se councilNum não veio na requisição (ex: página em cache antigo no navegador),
  // detecta automaticamente pelo texto da requisição, assunto ou e-mail de remetente
  let resolvedCouncil = councilNum
  if (!resolvedCouncil) {
    const textToCheck = `${subject || ''} ${body || ''} ${replyTo || ''} ${fromName || ''}`
    if (/Narandiba|CT\s*XIII\b|CT-XIII\b|Conselho Tutelar XIII/i.test(textToCheck)) {
      resolvedCouncil = 'XIII'
    }
  }

  const creds = getCredentialsForCouncil(resolvedCouncil)
  if (!creds) {
    const nomeCt = councilNome || (resolvedCouncil ? `CT ${resolvedCouncil}` : 'seu conselho')
    throw new Error(
      `O envio de e-mails para o ${nomeCt} ainda não está ativado no sistema. A conta cadastrada (conselho.narandiba@salvador.ba.gov.br) é de uso exclusivo do CT XIII Narandiba. Outros conselhos terão seus e-mails cadastrados em breve.`
    )
  }

  const from = creds.user

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

  const gmail = getGmailClient(creds)
  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } })
  return res.data
}

module.exports = { enviarEmail, getCredentialsForCouncil, normalizeCouncil }
