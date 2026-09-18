/**
 * GET  /api/requisicoes        → listar (com filtros opcionais)
 * POST /api/requisicoes        → criar nova requisição
 */
const supabase      = require('../../lib/supabase')
const { gerarProtocolo } = require('../../lib/protocolo')
const cors          = require('../../lib/cors')

module.exports = async function handler(req, res) {
  if (cors(req, res)) return

  // ── GET ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { solicitante, status, ct, search } = req.query

    let query = supabase
      .from('requisicoes')
      .select(`
        *,
        mensagens:requisicao_mensagens(id, lida, origem, created_at)
      `)
      .order('created_at', { ascending: false })

    if (solicitante) query = query.eq('solicitante', solicitante)
    if (status)      query = query.eq('status', status)
    if (ct)          query = query.eq('solicitante_ct', ct)
    if (search) {
      query = query.or(
        `protocolo.ilike.%${search}%,solicitante.ilike.%${search}%,cartorio.ilike.%${search}%,tipo.ilike.%${search}%`
      )
    }

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    // Adiciona flag `tem_mensagem_nao_lida` em cada requisição
    const result = (data || []).map(r => ({
      ...r,
      tem_mensagem_nao_lida: (r.mensagens || []).some(m => !m.lida && m.origem === 'cartorio'),
    }))

    return res.status(200).json(result)
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { solicitante, solicitante_ct, cartorio, subdistrito, email_destino, tipo } = req.body

    if (!solicitante || !cartorio || !email_destino || !tipo) {
      return res.status(400).json({ error: 'Campos obrigatórios: solicitante, cartorio, email_destino, tipo' })
    }

    let protocolo
    try {
      protocolo = await gerarProtocolo('requisicao')
    } catch (e) {
      return res.status(500).json({ error: 'Falha ao gerar protocolo: ' + e.message })
    }

    const { data, error } = await supabase
      .from('requisicoes')
      .insert({
        protocolo,
        solicitante,
        solicitante_ct: solicitante_ct || '',
        cartorio,
        subdistrito: subdistrito || null,
        email_destino,
        tipo,
        status: 'Enviada',
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })

    // Registrar mensagem inicial de sistema
    await supabase.from('requisicao_mensagens').insert({
      requisicao_id:   data.id,
      origem:          'sistema',
      assunto:         `Requisição ${protocolo} enviada`,
      corpo:           `Requisição de Certidão de ${tipo} enviada ao cartório ${cartorio} em ${new Date().toLocaleString('pt-BR')}.`,
      email_remetente: null,
      lida:            true,
    })

    return res.status(201).json(data)
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Método não permitido' })
}
