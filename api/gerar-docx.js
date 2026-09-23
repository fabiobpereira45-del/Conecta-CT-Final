/**
 * POST /api/gerar-docx
 * Repassa o HTML do formulário para o conversor (LibreOffice, hospedado à parte no
 * Fly.io) e devolve o .docx pronto. As credenciais do conversor (URL e segredo)
 * ficam só aqui, em variáveis de ambiente do servidor — nunca no navegador.
 */
const cors = require('../lib/cors')

module.exports = async function handler(req, res) {
  if (cors(req, res)) return
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const url = process.env.DOCX_CONVERTER_URL
  const secret = process.env.DOCX_CONVERTER_SECRET
  if (!url || !secret) {
    res.status(500).json({ error: 'conversor não configurado (DOCX_CONVERTER_URL/DOCX_CONVERTER_SECRET ausentes)' })
    return
  }

  const { html, filename } = req.body || {}
  if (!html || typeof html !== 'string') {
    res.status(400).json({ error: 'campo html é obrigatório' })
    return
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ html, filename }),
    })
    if (!r.ok) {
      const detalhe = await r.text().catch(() => '')
      res.status(502).json({ error: 'falha no conversor', status: r.status, detalhe })
      return
    }
    const buf = Buffer.from(await r.arrayBuffer())
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', r.headers.get('content-disposition') || 'attachment; filename="formulario.docx"')
    res.status(200).send(buf)
  } catch (e) {
    res.status(502).json({ error: 'não foi possível contatar o conversor', detalhe: e.message })
  }
}
