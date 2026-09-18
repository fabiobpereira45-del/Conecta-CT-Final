/**
 * GET   /api/requisicoes/:id            → detalhes + mensagens
 * PATCH /api/requisicoes/:id            → atualizar status
 * GET   /api/requisicoes/:id/mensagens  → listar mensagens
 * POST  /api/requisicoes/:id/mensagens  → adicionar mensagem (leitura manual)
 */
const supabase = require('../../lib/supabase')
const cors     = require('../../lib/cors')

module.exports = async function handler(req, res) {
  if (cors(req, res)) return

  const { id } = req.query
  const subpath = req.url.split(`/${id}/`)[1] || ''

  // ── GET /api/requisicoes/:id ────────────────────────────────────────────
  if (req.method === 'GET' && !subpath) {
    const { data, error } = await supabase
      .from('requisicoes')
      .select('*, mensagens:requisicao_mensagens(*)')
      .eq('id', id)
      .single()

    if (error) return res.status(404).json({ error: 'Requisição não encontrada' })
    return res.status(200).json(data)
  }

  // ── PATCH /api/requisicoes/:id ──────────────────────────────────────────
  if (req.method === 'PATCH' && !subpath) {
    const STATUS_VALIDOS = ['Enviada','Em andamento','Concluída','Cancelada','Respondida']
    const { status, observacao } = req.body

    if (status && !STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}` })
    }

    const update = {}
    if (status) update.status = status

    const { data, error } = await supabase
      .from('requisicoes')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })

    // Se veio observação, registrar como mensagem do conselheiro
    if (observacao) {
      await supabase.from('requisicao_mensagens').insert({
        requisicao_id: id,
        origem: 'conselheiro',
        corpo: observacao,
        lida: true,
      })
    }

    return res.status(200).json(data)
  }

  // ── GET /api/requisicoes/:id/mensagens ──────────────────────────────────
  if (req.method === 'GET' && subpath === 'mensagens') {
    const { data, error } = await supabase
      .from('requisicao_mensagens')
      .select('*')
      .eq('requisicao_id', id)
      .order('created_at', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })

    // Marcar mensagens do cartório como lidas
    const naoLidas = (data || []).filter(m => !m.lida && m.origem === 'cartorio').map(m => m.id)
    if (naoLidas.length) {
      await supabase
        .from('requisicao_mensagens')
        .update({ lida: true })
        .in('id', naoLidas)
    }

    return res.status(200).json(data || [])
  }

  // ── POST /api/requisicoes/:id/mensagens ─────────────────────────────────
  if (req.method === 'POST' && subpath === 'mensagens') {
    const { origem, corpo, assunto, email_remetente } = req.body
    if (!corpo) return res.status(400).json({ error: '`corpo` é obrigatório' })

    const { data, error } = await supabase
      .from('requisicao_mensagens')
      .insert({
        requisicao_id: id,
        origem: origem || 'conselheiro',
        assunto: assunto || null,
        corpo,
        email_remetente: email_remetente || null,
        lida: origem === 'conselheiro',
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  res.setHeader('Allow', 'GET, PATCH, POST')
  return res.status(405).json({ error: 'Método não permitido' })
}
