/**
 * Moderação das notícias (somente usuários logados: master, coordenador, conselheiro).
 *
 * GET  /api/noticias/moderacao?status=pendente|publicada|rejeitada   → lista + contagens
 * POST /api/noticias/moderacao  { id, acao: 'publicar' | 'rejeitar' | 'pendente' }
 */
const supabase = require('../../lib/supabase')
const cors = require('../../lib/cors')
const { usuarioLogado, negarAcesso } = require('../../lib/auth')

const ROLES = ['master', 'coordenador', 'conselheiro']
const STATUS = ['pendente', 'publicada', 'rejeitada']
const ACAO_PARA_STATUS = { publicar: 'publicada', rejeitar: 'rejeitada', pendente: 'pendente' }

module.exports = async function handler(req, res) {
  if (cors(req, res)) return

  const usuario = await usuarioLogado(req, ROLES)
  if (!usuario) return negarAcesso(req, res)

  if (req.method === 'GET') {
    const status = STATUS.includes(req.query.status) ? req.query.status : 'pendente'
    const { data, error } = await supabase
      .from('noticias')
      .select('id, titulo, resumo, fonte, fonte_tipo, categoria, status, motivo, publicada_em, url, moderada_por, moderada_em')
      .eq('status', status)
      .order('publicada_em', { ascending: false })
      .limit(80)
    if (error) return res.status(500).json({ error: error.message })

    const contagem = {}
    for (const s of STATUS) {
      const { count } = await supabase.from('noticias').select('id', { count: 'exact', head: true }).eq('status', s)
      contagem[s] = count || 0
    }
    return res.status(200).json({ itens: data || [], contagem })
  }

  if (req.method === 'POST') {
    const { id, acao } = req.body || {}
    const novo = ACAO_PARA_STATUS[acao]
    if (!id || !novo) return res.status(400).json({ error: 'Informe id e acao (publicar, rejeitar ou pendente).' })

    const { data, error } = await supabase
      .from('noticias')
      .update({ status: novo, motivo: 'manual', moderada_por: usuario.nome, moderada_em: new Date().toISOString() })
      .eq('id', id)
      .select('id, status')
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Notícia não encontrada.' })
    return res.status(200).json(data)
  }

  return res.status(405).json({ error: 'Método não permitido.' })
}
