#!/usr/bin/env node
/**
 * Gera um novo GMAIL_REFRESH_TOKEN para a conta Gmail do Conselho.
 *
 * Uso:
 *   node scripts/gerar-refresh-token.js
 * (Lê automaticamente de client_secret.json ou das variáveis de ambiente GMAIL_CLIENT_ID / SECRET)
 */
'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')
const { google } = require('googleapis')

const PORT = 53682
const REDIRECT_URI = `http://localhost:${PORT}`

let CLIENT_ID = process.env.GMAIL_CLIENT_ID
let CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET

// Tenta ler do arquivo JSON se não estiver definido ou se for valor manual
const jsonCandidates = [
  path.join(__dirname, '..', 'client_secret.json'),
  path.join(__dirname, '..', 'client_secret.json.json')
]
for (const f of jsonCandidates) {
  if (fs.existsSync(f)) {
    try {
      const data = JSON.parse(fs.readFileSync(f, 'utf8'))
      const creds = data.web || data.installed
      if (creds && creds.client_id && creds.client_secret) {
        CLIENT_ID = creds.client_id
        CLIENT_SECRET = creds.client_secret
        console.log(`📁 Credenciais carregadas automaticamente do arquivo: ${path.basename(f)}`)
        break
      }
    } catch (_) {}
  }
}

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Defina GMAIL_CLIENT_ID e GMAIL_CLIENT_SECRET como variáveis de ambiente ou coloque o arquivo client_secret.json na raiz.')
  process.exit(1)
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

// gmail.send → enviar; gmail.modify → ler/marcar como lido (usado no polling de respostas)
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
]

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // obrigatório para receber refresh_token
  prompt: 'consent',      // força a tela de consentimento, garantindo um refresh_token novo
  scope: SCOPES,
})

console.log('\n======================================================')
console.log('📌 Dados das Credenciais Detectados:')
console.log(`• GMAIL_CLIENT_ID:     ${CLIENT_ID}`)
console.log(`• GMAIL_CLIENT_SECRET: ${CLIENT_SECRET}`)
console.log('======================================================')
console.log('\n1) Abra este link no navegador, usando a conta Gmail do Conselho:\n')
console.log(authUrl)
console.log('\n2) Faça login com conselho.narandiba@salvador.ba.gov.br, aceite as permissões e aguarde.')

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT_URI)
    const code = url.searchParams.get('code')
    const erro = url.searchParams.get('error')

    if (erro) {
      res.end('Autorização recusada. Pode fechar esta aba e tentar de novo.')
      console.error('❌ Autorização recusada:', erro)
      server.close()
      process.exit(1)
    }
    if (!code) { res.end('Aguardando...'); return }

    res.end('✅ Autorizado! Pode fechar esta aba e voltar ao terminal.')
    server.close()

    const { tokens } = await oauth2Client.getToken(code)
    if (!tokens.refresh_token) {
      console.error('\n⚠️  O Google não devolveu um refresh_token desta vez.')
      console.error('   Isso acontece quando essa conta já autorizou este app antes.')
      console.error('   Vá em https://myaccount.google.com/permissions, remova o acesso')
      console.error('   deste app ("Conecta-CT" ou nome parecido) e rode o script de novo.')
      process.exit(1)
    }

    console.log('\n======================================================')
    console.log('✅ SUCESSO! Novo GMAIL_REFRESH_TOKEN gerado:')
    console.log('======================================================\n')
    console.log(tokens.refresh_token)
    console.log('\nCopie esse valor e configure na Vercel:')
    console.log(`• GMAIL_USER: conselho.narandiba@salvador.ba.gov.br`)
    console.log(`• GMAIL_CLIENT_ID: ${CLIENT_ID}`)
    console.log(`• GMAIL_CLIENT_SECRET: ${CLIENT_SECRET}`)
    console.log(`• GMAIL_REFRESH_TOKEN: ${tokens.refresh_token}`)
    console.log('======================================================\n')
    process.exit(0)
  } catch (e) {
    console.error('❌ Erro ao trocar o código por tokens:', e.message)
    try { res.end('Erro — veja o terminal.') } catch (_) {}
    process.exit(1)
  }
})

server.listen(PORT, () => {})
