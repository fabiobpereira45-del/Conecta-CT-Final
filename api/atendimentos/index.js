/**
 * GET  /api/atendimentos        → listar
 * POST /api/atendimentos        → gerar protocolo de atendimento
 */
const supabase           = require('../../lib/supabase')
const { gerarProtocolo } = require('../../lib/protocolo')
const cors               = require('../../lib/cors')

module.exports = async function handler(req, res) {
  if (cors(req, res)) return

  if (req.method === 'GET') {
    const { ct, conselheiro } = req.query
    let query = supabase
      .from('atendimentos')
      .select('*')
      .order('created_at', { ascending: false })

    if (ct)          query = query.eq('ct', ct)
    if (conselheiro) query = query.eq('conselheiro', conselheiro)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data || [])
  }

  if (req.method === 'POST') {
    const { conselheiro, ct } = req.body
    if (!conselheiro || !ct) {
      return res.status(400).json({ error: 'Campos obrigatórios: conselheiro, ct' })
    }

    let protocolo
    try {
      protocolo = await gerarProtocolo('atendimento')
    } catch (e) {
      return res.status(500).json({ error: 'Falha ao gerar protocolo: ' + e.message })
    }

    const { data, error } = await supabase
      .from('atendimentos')
      .insert({ protocolo, conselheiro, ct })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Método não permitido' })
}
