/**
 * Helper CORS para Vercel Serverless Functions.
 * Chame no início de cada handler:
 *   if (cors(req, res)) return
 */
function cors(req, res) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim())
  const origin = req.headers.origin || ''

  const allow = allowedOrigins.includes('*') || allowedOrigins.includes(origin)
  res.setHeader('Access-Control-Allow-Origin', allow ? (origin || '*') : allowedOrigins[0])
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '86400')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true   // sinaliza que o handler deve encerrar
  }
  return false
}

module.exports = cors
