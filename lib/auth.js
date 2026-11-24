/**
 * Verifica no servidor quem está chamando a API, a partir do token de sessão do Supabase Auth
 * (cabeçalho Authorization: Bearer <access_token>) e do papel em `usuarios`.
 * Retorna { nome, role } se o usuário está ativo e tem um dos papéis permitidos; senão null.
 */
const supabase = require('./supabase')

async function usuarioLogado(req, rolesPermitidos) {
  const cab = req.headers.authorization || ''
  const token = cab.startsWith('Bearer ') ? cab.slice(7).trim() : ''
  if (!token) return null

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return null

  const { data: u } = await supabase
    .from('usuarios')
    .select('nome, role, ativo')
    .eq('auth_id', data.user.id)
    .eq('ativo', true)
    .maybeSingle()

  if (!u || !rolesPermitidos.includes(u.role)) return null
  return { nome: u.nome, role: u.role }
}

module.exports = { usuarioLogado }
