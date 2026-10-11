#!/usr/bin/env node
/**
 * Gera um novo GMAIL_REFRESH_TOKEN para a conta Gmail do Conselho.
 *
 * Uso:
 *   GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node scripts/gerar-refresh-token.js
 *
 * O fluxo antigo (urn:ietf:wg:oauth:2.0:oob) foi desativado pelo Google em 2023.
 * Este script usa o fluxo atual recomendado para "apps instalados": abre uma porta
 * local (loopback) para receber o código de autorização depois que você faz login
 * e autoriza no navegador.
 *
 * Se o seu Client ID no Google Cloud Console for do tipo "Desktop app", isto
 * funciona sem nenhuma configuração extra. Se for do tipo "Web application",
 * você precisa adicionar http://localhost:53682 em "Authorized redirect URIs"
 * desse client, em https://console.cloud.google.com/apis/credentials
 */
'use strict'

const http = require('http')
const { google } = require('googleapis')

const PORT = 53682
const REDIRECT_URI = `http://localhost:${PORT}`

const CLIENT_ID = process.env.GMAIL_CLIENT_ID
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Defina GMAIL_CLIENT_ID e GMAIL_CLIENT_SECRET como variáveis de ambiente antes de rodar.')
  console.error('   Exemplo (PowerShell):')
  console.error('   $env:GMAIL_CLIENT_ID="seu-client-id"; $env:GMAIL_CLIENT_SECRET="seu-client-secret"; node scripts/gerar-refresh-token.js')
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

console.log('\n1) Abra este link no navegador, usando a conta Gmail do Conselho:\n')
console.log(authUrl)
console.log('\n2) Faça login, aceite as permissões e aguarde esta janela do terminal.\n')

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

    console.log('\n✅ Novo GMAIL_REFRESH_TOKEN gerado:\n')
    console.log(tokens.refresh_token)
    console.log('\nCole esse valor no secret GMAIL_REFRESH_TOKEN (GitHub Actions) e na variável de')
    console.log('ambiente GMAIL_REFRESH_TOKEN (Vercel). Não compartilhe esse valor com mais ninguém.\n')
    process.exit(0)
  } catch (e) {
    console.error('❌ Erro ao trocar o código por tokens:', e.message)
    try { res.end('Erro — veja o terminal.') } catch (_) {}
    process.exit(1)
  }
})

server.listen(PORT, () => {})
