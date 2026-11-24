/**
 * GET/POST /api/noticias/coletar
 * Busca as notícias nas fontes (RSS), classifica e grava em `noticias`.
 *
 * Quem pode chamar:
 *   - o cron da Vercel (cabeçalho Authorization: Bearer $CRON_SECRET)
 *   - um usuário logado (master, coordenador ou conselheiro), pelo botão "Coletar agora"
 * Chamadas automáticas (cron) são ignoradas se já houve coleta nos últimos 30 minutos.
 */
const supabase = require('../../lib/supabase')
const cors = require('../../lib/cors')
const { usuarioLogado, negarAcesso } = require('../../lib/auth')
const { coletar } = require('../../lib/noticias')

const ROLES = ['master', 'coordenador', 'conselheiro']

module.exports = async function handler(req, res) {
  if (cors(req, res)) return

  const cab = req.headers.authorization || ''
  const segredo = process.env.CRON_SECRET
  const viaCron = !!segredo && cab === `Bearer ${segredo}`
  // Sem CRON_SECRET configurado, aceita a chamada identificada do cron da Vercel (coleta é idempotente e tem limite de frequência).
  const viaCronSemSegredo = !segredo && /^vercel-cron\//.test(req.headers['user-agent'] || '')
  const usuario = viaCron || viaCronSemSegredo ? null : await usuarioLogado(req, ROLES)

  if (!viaCron && !viaCronSemSegredo && !usuario) {
    return negarAcesso(req, res)
  }

  try {
    if (!usuario) {
      const { data: ultima } = await supabase.from('noticias').select('coletada_em').order('coletada_em', { ascending: false }).limit(1)
      const t = ultima?.[0]?.coletada_em ? new Date(ultima[0].coletada_em).getTime() : 0
      if (Date.now() - t < 30 * 60 * 1000) return res.status(200).json({ ok: true, ignorado: 'coleta recente' })
    }
    const relatorio = await coletar(supabase)
    return res.status(200).json({ ok: true, ...relatorio })
  } catch (e) {
    console.error('Erro na coleta de notícias:', e)
    return res.status(500).json({ error: 'Falha na coleta: ' + (e.message || e) })
  }
}
