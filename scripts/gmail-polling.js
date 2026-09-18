#!/usr/bin/env node
/**
 * Conecta-CT – Gmail Polling
 * ─────────────────────────────────────────────────────────────────────────────
 * Roda via GitHub Actions (cron a cada 5 min).
 * Lê e-mails não lidos na caixa do Conselho Tutelar, detecta protocolos
 * REQ-YYYY/MM-NNN no assunto e registra a resposta na tabela
 * `requisicao_mensagens`, atualizando o status da requisição para "Respondida".
 *
 * Variáveis de ambiente necessárias (GitHub Actions Secrets):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   API_BASE_URL            – URL da API Vercel  ex: https://conecta-ct.vercel.app
 *   GMAIL_CLIENT_ID
 *   GMAIL_CLIENT_SECRET
 *   GMAIL_REFRESH_TOKEN
 *   GMAIL_USER              – e-mail do Conselho  ex: ct01salvador@gmail.com
 */

'use strict'

const { google }  = require('googleapis')
const { createClient } = require('@supabase/supabase-js')

// ── Config ────────────────────────────────────────────────────────────────
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  GMAIL_USER,
} = process.env

;[
  'SUPABASE_URL','SUPABASE_SERVICE_KEY',
  'GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN','GMAIL_USER',
].forEach(k => { if (!process.env[k]) { console.error(`❌ Variável ${k} não definida.`); process.exit(1) } })

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Regex para detectar protocolo no assunto do e-mail
const PROTOCOLO_RE = /REQ-\d{4}\/\d{2}-\d{3}/gi

// ── Gmail OAuth2 ──────────────────────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'      // não precisa de redirect URL para refresh
)
oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN })
const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

// ── Helpers ────────────────────────────────────────────────────────────────
function decodeBase64(encoded) {
  return Buffer.from(encoded.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8')
}

function extractBody(payload) {
  if (!payload) return ''
  if (payload.body?.data) return decodeBase64(payload.body.data)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64(part.body.data)
    }
    for (const part of payload.parts) {
      const body = extractBody(part)
      if (body) return body
    }
  }
  return ''
}

function getHeader(headers, name) {
  return (headers || []).find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

// ── Core ───────────────────────────────────────────────────────────────────
async function processar() {
  console.log(`\n[${new Date().toISOString()}] Iniciando polling Gmail (${GMAIL_USER})…`)

  // Busca e-mails não lidos que contenham padrão REQ- no assunto
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread subject:REQ-',
    maxResults: 20,
  })

  const mensagens = listRes.data.messages || []
  console.log(`  → ${mensagens.length} e-mail(s) não lido(s) com protocolo encontrado(s).`)

  for (const msg of mensagens) {
    try {
      const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' })
      const headers = full.data.payload?.headers || []
      const assunto = getHeader(headers, 'subject')
      const remetente = getHeader(headers, 'from')
      const corpo = extractBody(full.data.payload)

      // Extrair todos os protocolos citados no assunto
      const protocolos = assunto.match(PROTOCOLO_RE) || []
      if (!protocolos.length) {
        console.log(`  → Ignorado (sem protocolo): "${assunto}"`)
        // Marcar como lido para não re-processar
        await gmail.users.messages.modify({
          userId: 'me', id: msg.id,
          resource: { removeLabelIds: ['UNREAD'] },
        })
        continue
      }

      for (const protocolo of protocolos) {
        // Buscar requisição pelo protocolo
        const { data: req, error } = await supabase
          .from('requisicoes')
          .select('id, status')
          .eq('protocolo', protocolo.toUpperCase())
          .single()

        if (error || !req) {
          console.log(`  → Protocolo ${protocolo} não encontrado no banco.`)
          continue
        }

        // Verificar se já registramos esta mensagem (pelo id do Gmail)
        const { data: jaExiste } = await supabase
          .from('requisicao_mensagens')
          .select('id')
          .eq('requisicao_id', req.id)
          .eq('assunto', `gmail:${msg.id}`)
          .single()

        if (jaExiste) {
          console.log(`  → Mensagem ${msg.id} já registrada. Pulando.`)
          continue
        }

        // Inserir mensagem
        await supabase.from('requisicao_mensagens').insert({
          requisicao_id: req.id,
          origem: 'cartorio',
          assunto: `gmail:${msg.id}`,           // usado como dedup key
          corpo: `De: ${remetente}\nAssunto: ${assunto}\n\n${corpo}`,
          email_remetente: remetente,
          lida: false,
        })

        // Atualizar status para "Respondida" (só se ainda estava em Enviada/Em andamento)
        if (['Enviada','Em andamento'].includes(req.status)) {
          await supabase
            .from('requisicoes')
            .update({ status: 'Respondida' })
            .eq('id', req.id)
          console.log(`  ✅ Requisição ${protocolo} → status "Respondida"`)
        } else {
          console.log(`  ℹ️  Requisição ${protocolo} já estava com status "${req.status}"`)
        }
      }

      // Marcar e-mail como lido no Gmail
      await gmail.users.messages.modify({
        userId: 'me', id: msg.id,
        resource: { removeLabelIds: ['UNREAD'] },
      })
    } catch (err) {
      console.error(`  ❌ Erro ao processar mensagem ${msg.id}:`, err.message)
    }
  }

  console.log(`[${new Date().toISOString()}] Polling concluído.\n`)
}

processar().catch(err => { console.error(err); process.exit(1) })
