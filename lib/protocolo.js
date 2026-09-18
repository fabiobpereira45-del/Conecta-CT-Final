const supabase = require('./supabase')

/**
 * Gera próximo protocolo de forma atômica usando a tabela `sequencias`.
 * @param {'requisicao'|'atendimento'} tipo
 * @returns {Promise<string>}  Ex: "REQ-2026/09-001" | "2026/09/001"
 */
async function gerarProtocolo(tipo) {
  // Incrementa atomicamente via RPC (função SQL)
  const { data, error } = await supabase.rpc('incrementar_sequencia', { p_chave: tipo })
  if (error) throw error

  const seq = String(data).padStart(3, '0')
  const now = new Date()
  const yy  = now.getFullYear()
  const mm  = String(now.getMonth() + 1).padStart(2, '0')

  if (tipo === 'requisicao') return `REQ-${yy}/${mm}-${seq}`
  return `${yy}/${mm}/${seq}`
}

module.exports = { gerarProtocolo }
