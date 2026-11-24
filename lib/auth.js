/**
 * Verifica no servidor quem está chamando a API, a partir do token de sessão do Supabase Auth
 * (cabeçalho Authorization: Bearer <access_token>) e do papel em `usuarios`.
 * Retorna { nome, role } se o usuário está ativo e tem um dos papéis permitidos; senão null,
 * e deixa o motivo em req.authMotivo para a resposta de erro ser clara.
 */
const supabase = require('./supabase')

async function usuarioLogado(req, rolesPermitidos) {
  const cab = req.headers.authorization || ''
  const token = cab.startsWith('Bearer ') ? cab.slice(7).trim() : ''
  if (!token) { req.authMotivo = 'sem-token'; return null }

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) { req.authMotivo = 'token-invalido'; return null }

  const { data: u } = await supabase
    .from('usuarios')
    .select('nome, role, ativo')
    .eq('auth_id', data.user.id)
    .eq('ativo', true)
    .maybeSingle()

  if (!u) { req.authMotivo = 'sem-usuario'; return null }
  if (!rolesPermitidos.includes(u.role)) { req.authMotivo = 'sem-permissao'; return null }
  return { nome: u.nome, role: u.role }
}

// Resposta HTTP adequada ao motivo: 401 = entrar de novo; 403 = logado, mas sem permissão
function negarAcesso(req, res) {
  const m = req.authMotivo
  if (m === 'sem-permissao' || m === 'sem-usuario') {
    return res.status(403).json({ error: 'Seu usuário não tem permissão para moderar notícias.' })
  }
  return res.status(401).json({ error: 'Sessão expirada ou inválida. Saia e entre no sistema novamente.' })
}

module.exports = { usuarioLogado, negarAcesso }
