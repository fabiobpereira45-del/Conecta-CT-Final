/**
 * POST /api/send-email
 * Envia um e-mail oficial via Gmail API pelo e-mail do Conselho correspondente.
 * Se for o CT XIII Narandiba, usa conselho.narandiba@salvador.ba.gov.br.
 * Body: { to, cc?, subject, body, replyTo?, fromName?, attachment?, councilNum?, councilNome?, senderCt? }
 */
const cors = require('../lib/cors')
const { enviarEmail } = require('../lib/gmail')

module.exports = async function handler(req, res) {
  if (cors(req, res)) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const { to, cc, subject, body, replyTo, fromName, attachment, attachments, councilNum, councilNome, senderCt } = req.body || {}
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Informe destinatário (to), assunto (subject) e mensagem (body).' })
  }

  const listaAnexos = []
  if (Array.isArray(attachments)) {
    for (const a of attachments) {
      if (!a.filename || !a.contentBase64) {
        return res.status(400).json({ error: 'Anexo inválido: informe filename e contentBase64.' })
      }
      listaAnexos.push(a)
    }
  } else if (attachment) {
    if (!attachment.filename || !attachment.contentBase64) {
      return res.status(400).json({ error: 'Anexo inválido: informe filename e contentBase64.' })
    }
    listaAnexos.push(attachment)
  }

  const resolvedCouncil = councilNum || senderCt

  try {
    const data = await enviarEmail({
      to,
      cc,
      subject,
      body,
      replyTo,
      fromName,
      attachments: listaAnexos,
      councilNum: resolvedCouncil,
      councilNome
    })
    return res.status(200).json({ ok: true, id: data.id })
  } catch (e) {
    console.error('send-email error:', e)
    return res.status(502).json({ error: e.message || 'Falha ao enviar e-mail.' })
  }
}
