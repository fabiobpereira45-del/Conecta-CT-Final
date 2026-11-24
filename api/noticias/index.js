/**
 * GET /api/noticias?limit=12
 * Público: devolve só as notícias com status 'publicada' (últimos 30 dias), para o carrossel do portal.
 * Nunca expõe notícias pendentes ou rejeitadas.
 */
const supabase = require('../../lib/supabase')
const cors = require('../../lib/cors')

const MAX_POR_FONTE = 3   // evita que um único veículo domine o carrossel

module.exports = async function handler(req, res) {
  if (cors(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' })

  const limite = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 12))
  const desde = new Date(Date.now() - 30 * 86400000).toISOString()

  const { data, error } = await supabase
    .from('noticias')
    .select('id, titulo, resumo, fonte, fonte_tipo, categoria, escopo, publicada_em, url')
    .eq('status', 'publicada')
    .gte('publicada_em', desde)
    .order('publicada_em', { ascending: false })
    .limit(120)

  if (error) {
    console.error('noticias: falha ao consultar', error.code, error.message)
    return res.status(500).json({ error: 'Não foi possível carregar as notícias.', codigo: error.code || null })
  }

  const porFonte = {}
  const noticias = []
  for (const n of data || []) {
    porFonte[n.fonte] = (porFonte[n.fonte] || 0) + 1
    if (porFonte[n.fonte] > MAX_POR_FONTE) continue
    noticias.push(n)
    if (noticias.length >= limite) break
  }

  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600')
  return res.status(200).json({ noticias, atualizadoEm: new Date().toISOString() })
}
