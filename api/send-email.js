/**
 * POST /api/send-email
 * Envia um e-mail de verdade pela conta Gmail do Conselho (GMAIL_USER), via Gmail API.
 * Body: { to, cc?, subject, body, replyTo? }
 */
const cors = require('../lib/cors')
const { enviarEmail } = require('../lib/gmail')

module.exports = async function handler(req, res) {
  if (cors(req, res)) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const { to, cc, subject, body, replyTo, fromName, attachment } = req.body || {}
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Informe destinatário (to), assunto (subject) e mensagem (body).' })
  }
  if (attachment && (!attachment.filename || !attachment.contentBase64)) {
    return res.status(400).json({ error: 'Anexo inválido: informe filename e contentBase64.' })
  }

  try {
    const data = await enviarEmail({ to, cc, subject, body, replyTo, fromName, attachment })
    return res.status(200).json({ ok: true, id: data.id })
  } catch (e) {
    console.error('send-email error:', e)
    return res.status(502).json({ error: e.message || 'Falha ao enviar e-mail.' })
  }
}
