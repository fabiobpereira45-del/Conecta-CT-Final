/**
 * GET/POST /api/requisicoes/poll
 * Consulta a caixa de entrada do Gmail via API procurando respostas de cartórios
 * que façam referência a requisições pelo número de protocolo [REQ-YYYY/MM-NNN].
 * Registra as mensagens recebidas na tabela `requisicao_mensagens` (origem: 'cartorio', lida: false)
 * e atualiza o status para 'Respondida'.
 */
const { google } = require('googleapis')
const supabase = require('../../lib/supabase')
const cors = require('../../lib/cors')

const PROTOCOLO_RE = /REQ[-\s]?\d{4}\/\d{2}[-\s]\d{3}/gi

function normalizeProtocolo(proto) {
  if (!proto) return ''
  return proto.toUpperCase().trim().replace(/^REQ\s+/, 'REQ-').replace(/\/\s+/, '/').replace(/\s+(\d{3})$/, '-$1')
}

function decodeBase64(encoded) {
  try {
    return Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch(e) {
    return ''
  }
}

function extractBody(payload) {
  if (!payload) return ''
  if (payload.body?.data) return decodeBase64(payload.body.data)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64(part.body.data)
    }
    for (const part of payload.parts) {
      const body = extractBody(part)
      if (body) return body
    }
  }
  return ''
}

function getHeader(headers, name) {
  return (headers || []).find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

module.exports = async function handler(req, res) {
  if (cors(req, res)) return

  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  const user = process.env.GMAIL_USER || 'conselho.narandiba@salvador.ba.gov.br'

  if (!clientId || !clientSecret || !refreshToken) {
    return res.status(500).json({ error: 'Credenciais do Gmail não configuradas no servidor.' })
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob')
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  let novasRespostas = 0
  const detalhes = []

  try {
    // Busca mensagens que contenham "REQ-" no assunto
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'REQ-',
      maxResults: 30,
    })

    const mensagens = listRes.data.messages || []

    for (const msg of mensagens) {
      try {
        const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' })
        const headers = full.data.payload?.headers || []
        const assunto = getHeader(headers, 'subject')
        const remetente = getHeader(headers, 'from')
        const dataMsg = getHeader(headers, 'date')
        const corpo = extractBody(full.data.payload)

        // Se foi enviado pelo próprio conselho, ignora (não é resposta de cartório)
        if (remetente.toLowerCase().includes(user.toLowerCase())) {
          continue
        }

        // Extrai o protocolo
        const protocolos = assunto.match(PROTOCOLO_RE) || corpo.match(PROTOCOLO_RE) || []
        if (!protocolos.length) continue

        for (const rawProtocolo of protocolos) {
          const protoUpper = normalizeProtocolo(rawProtocolo)
          if (!protoUpper) continue

          const { data: reqItem, error: errReq } = await supabase
            .from('requisicoes')
            .select('id, protocolo, status')
            .eq('protocolo', protoUpper)
            .single()

          if (errReq || !reqItem) continue

          // Evita duplicar a mesma mensagem do Gmail
          const dedupKey = `gmail:${msg.id}`
          const { data: jaExiste } = await supabase
            .from('requisicao_mensagens')
            .select('id')
            .eq('requisicao_id', reqItem.id)
            .eq('assunto', dedupKey)
            .single()

          if (jaExiste) continue

          // Registra a resposta do cartório
          const { error: insErr } = await supabase.from('requisicao_mensagens').insert({
            requisicao_id: reqItem.id,
            origem: 'cartorio',
            assunto: dedupKey,
            corpo: `De: ${remetente}\nData: ${dataMsg}\nAssunto: ${assunto}\n\n${corpo}`,
            email_remetente: remetente,
            lida: false,
          })

          if (!insErr) {
            novasRespostas++
            detalhes.push({ protocolo: protoUpper, remetente, assunto })

            // Atualiza status para 'Respondida'
            if (['Enviada', 'Em andamento'].includes(reqItem.status)) {
              await supabase
                .from('requisicoes')
                .update({ status: 'Respondida' })
                .eq('id', reqItem.id)
            }
          }
        }
      } catch(errItem) {
        console.error('Erro ao processar item do Gmail:', errItem)
      }
    }

    return res.status(200).json({ ok: true, novasRespostas, detalhes })
  } catch (e) {
    console.error('Erro no polling Gmail:', e)
    return res.status(500).json({ error: 'Erro ao consultar Gmail: ' + e.message })
  }
}
