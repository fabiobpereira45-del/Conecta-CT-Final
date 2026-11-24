/**
 * Coleta e classificação de notícias sobre infância e adolescência.
 *
 * ESCOPO (definido pelo Conselho):
 *   - BAHIA: tudo sobre infância e adolescência no estado (campanhas, leis, políticas, violações...)
 *   - BRASIL: só ECA, Conanda e novas leis (federais). O resto do país é descartado.
 *
 * Fontes: Google Notícias (buscas por tema, que cobrem jornais, portais de TV e rádio, órgãos e
 * prefeituras), Agência Brasil e Agência Câmara. X/Instagram não entram: as APIs são fechadas.
 *
 * Direitos autorais: guardamos só título, um trecho curto e o link da fonte, sem imagem.
 *
 * Regra de publicação (versão com moderação):
 *   - violência/violação ........................ sempre 'pendente' (um conselheiro decide)
 *   - rede social ................................ sempre 'pendente'
 *   - Bahia: fonte oficial, lei ou campanha ....... 'publicada'; assunto geral da imprensa → 'pendente'
 *   - Bahia: prefeitura de outra cidade ........... 'pendente'
 *   - Brasil: ECA/Conanda/nova lei (oficial ou imprensa) ... 'publicada'
 */
const crypto = require('crypto')

const UA = 'Mozilla/5.0 (compatible; ConselhoTutelarSalvadorBot/1.0; +https://conecta-ct-final.vercel.app/site)'
const TIMEOUT_MS = 8000
const MAX_IDADE_DIAS = 7
const MAX_PENDENTES_POR_COLETA = 30   // a fila precisa caber no olho de um conselheiro

const gnews = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`

const FEEDS = [
  // ── Bahia: tudo sobre infância e adolescência ──
  { nome: 'Bahia · Conselho Tutelar', url: gnews('(Bahia OR Salvador) ("Conselho Tutelar" OR "Conselhos Tutelares" OR "conselheiros tutelares") when:7d'), google: true },
  { nome: 'Bahia · Crianças e adolescentes', url: gnews('(Bahia OR Salvador) (criança OR crianças OR adolescente OR adolescentes OR infância) (lei OR campanha OR programa OR secretaria OR governo OR prefeitura) when:7d'), google: true },
  { nome: 'Bahia · Violações de direitos', url: gnews('(Bahia OR Salvador) (violência OR abuso OR "maus-tratos" OR "trabalho infantil" OR "exploração sexual") (criança OR adolescente) when:7d'), google: true },
  { nome: 'Bahia · Direitos e ECA', url: gnews('(Bahia OR Salvador) ("direitos da criança" OR "direitos do adolescente" OR "Estatuto da Criança e do Adolescente" OR ECA) when:7d'), google: true },
  { nome: 'Bahia · Órgãos de justiça', url: gnews('("Ministério Público da Bahia" OR "Defensoria Pública da Bahia" OR "TJ-BA" OR "Tribunal de Justiça da Bahia") (criança OR adolescente) when:7d'), google: true },
  // ── Brasil: só ECA, Conanda e novas leis ──
  { nome: 'Brasil · ECA', url: gnews('"Estatuto da Criança e do Adolescente" OR "ECA" (lei OR sancionada OR altera OR aprova OR projeto) when:7d'), google: true },
  { nome: 'Brasil · Conanda', url: gnews('Conanda OR "Conselho Nacional dos Direitos da Criança e do Adolescente" when:7d'), google: true },
  { nome: 'Brasil · Novas leis', url: gnews('(sanciona OR sancionada OR "nova lei" OR "projeto de lei" OR resolução) (criança OR crianças OR adolescente OR adolescentes OR infância) when:7d'), google: true },
  { nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', fonte: 'Agência Brasil', host: 'agenciabrasil.ebc.com.br' },
  { nome: 'Agência Câmara', url: 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', fonte: 'Agência Câmara', host: 'camara.leg.br' },
]

// Domínios (e sufixos) tratados como fonte oficial.
const SUFIXOS_OFICIAIS = ['gov.br', '.gov.br', '.leg.br', '.jus.br', '.mp.br', '.def.br', '.ebc.com.br', 'unicef.org', 'unicef.org.br', 'camara.leg.br', 'senado.leg.br', 'planalto.gov.br']

const REDES_SOCIAIS = ['instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'threads.net', 'kwai.com', 'linkedin.com']
const UFS = 'ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to'

// Escopo Bahia: domínios do estado e veículos baianos...
const HOSTS_BAHIA = ['ba.gov.br', 'ba.leg.br', 'ba.def.br', 'ba.mp.br', 'mpba.mp.br', 'tjba.jus.br', 'atarde.com.br', 'bnews.com.br', 'bahianoticias.com.br', 'correio24horas.com.br', 'metro1.com.br', 'bahia.ba', 'alô.ba']
// ...e menções no texto ao estado, a Salvador e às maiores cidades baianas.
const RE_BAHIA = /\b(bahia|baiano|baiana|baianos|baianas|salvador|soteropolitano|soteropolitana|alba|feira de santana|vitoria da conquista|camacari|itabuna|juazeiro|lauro de freitas|ilheus|jequie|barreiras|teixeira de freitas|alagoinhas|porto seguro|simoes filho|paulo afonso|eunapolis|santo antonio de jesus|valenca|candeias|guanambi|jacobina|serrinha|senhor do bonfim|dias d.avila|luis eduardo magalhaes|irece|bom jesus da lapa|cruz das almas|itapetinga|caetite|brumado|conceicao do coite|ipiau|livramento de nossa senhora)\b/

// ───────────────────────── utilidades de texto ─────────────────────────
const normaliza = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function decodificaEntidades(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

function semHtml(s) {
  const texto = decodificaEntidades(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
  return decodificaEntidades(texto.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function tag(bloco, nome) {
  const m = bloco.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${nome}>`, 'i'))
  return m ? m[1] : ''
}

function ajustaCaixa(t) {
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, '')
  const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, '').length
  if (letras.length > 10 && maiusculas / letras.length > 0.7) {
    const baixo = t.toLowerCase()
    return baixo.charAt(0).toUpperCase() + baixo.slice(1)
  }
  return t
}

function trecho(texto, max = 240) {
  if (!texto || texto.length <= max) return texto || ''
  const corte = texto.slice(0, max)
  const ponto = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('! '), corte.lastIndexOf('? '))
  if (ponto > 90) return corte.slice(0, ponto + 1)
  return corte.slice(0, corte.lastIndexOf(' ')).replace(/[,;:\s-]+$/, '') + '…'
}

// ───────────────────────── RSS ─────────────────────────
function lerRss(xml, feed) {
  const itens = []
  for (const bloco of xml.match(/<item[\s>][\s\S]*?<\/item>/g) || []) {
    const titulo = semHtml(tag(bloco, 'title'))
    const link = semHtml(tag(bloco, 'link'))
    if (!titulo || !/^https?:\/\//.test(link)) continue

    let fonte = feed.fonte || ''
    let host = feed.host || ''
    let tituloLimpo = titulo
    if (feed.google) {
      const m = bloco.match(/<source\s+url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i)
      if (m) {
        fonte = semHtml(m[2])
        try { host = new URL(decodificaEntidades(m[1])).hostname.replace(/^www\./, '') } catch (e) { host = '' }
      }
      if (fonte && titulo.endsWith(` - ${fonte}`)) tituloLimpo = titulo.slice(0, -(fonte.length + 3)).trim()
    }
    if (!fonte) continue

    const data = new Date(semHtml(tag(bloco, 'pubDate')))
    // O resumo do Google Notícias só repete título e fonte; usamos resumo apenas de feeds que trazem <description> de verdade.
    const resumo = feed.google ? '' : trecho(semHtml(tag(bloco, 'description')))
    itens.push({ titulo: ajustaCaixa(tituloLimpo), url: link, fonte, host, resumo, data: isNaN(data) ? new Date() : data })
  }
  return itens
}

async function baixar(feed) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(feed.url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' }, signal: ctrl.signal, redirect: 'follow' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return lerRss(await r.text(), feed)
  } finally {
    clearTimeout(t)
  }
}

// ───────────────────────── classificação ─────────────────────────
const RE_INFANCIA = /\b(crianca|criancas|adolescente|adolescentes|infancia|infantil|infantis|menor de idade|menores de idade|estatuto da crianca|eca|conanda|conselho tutelar|conselhos tutelares|conselheir[oa]s? tutelar(es)?|primeira infancia|creche|creches)\b/
const RE_RUIDO = /\b(futebol|gol|gols|campeonato|copa|novela|filme|filmes|serie|series|desenho|animacao|jogo|jogos|game|games|show|musical|brinquedo|brinquedos|promocao|desconto|oferta|ofertas|black friday|horoscopo|receita|bbb|celebridade|famoso|famosa|ator|atriz|cantor|cantora|moda|beleza|sorteio|loteria)\b/
const RE_VIOLACAO = /(violencia|abus|estupr|maus[- ]tratos|assassin|homicidio|morte|morreu|morrem|morta|morto|espanc|agress|abandon|exploracao sexual|trabalho infantil|desaparec|sequestr|trafico|pedofil|pornografia infantil|aliciament|castigo fisico|tortur|bullying|suicidio|automutilacao|baleado|baleada|esfaque|feri(do|da|dos|das)|preso|presa|prisao|prisoes|apreendid|apreens|ato infracional)/
const RE_LEGISLACAO = /(\blei\b|\bleis\b|projeto de lei|\bpl \d|sancion|resolucao|decreto|portaria|constituicao|\bstf\b|\bstj\b|\bcnj\b|jurisprudencia|medida provisoria|\bcodigo\b|aprova|aprovou|aprovad|votacao|\bcomissao\b|camara dos deputados|senado|regulament|\bpec\b|maioridade penal|\bplenario\b|\bconanda\b)/
const RE_CAMPANHA = /(campanha|conferencia|semana|dia nacional|mobiliza|lancamento|lanca |programa)/
const RE_POLITICA = /(politica publica|vacin|matricula|merenda|bolsa familia|beneficio|investimento|orcamento|educacao|saude|assistencia social|protecao|direitos)/
// Brasil: o que conta como "novas leis" (norma federal ou proposta em tramitação) e ECA/Conanda
const RE_LEI_FORTE = /(sancion|promulg|\bnova lei\b|\bnovas leis\b|lei n|\blei \d|projeto de lei|\bpl \d|\bpec\b|medida provisoria|decreto|resolucao|aprova (o )?(projeto|lei|texto)|diario oficial|\bdou\b|\bstf\b|\bstj\b|emenda constitucional|altera (o )?(eca|estatuto|codigo|lei))/
const RE_ECA_CONANDA = /(estatuto da crianca|\beca\b|conanda|conselho nacional dos direitos da crianca)/
// Brasil: leis e notícias de câmaras municipais, assembleias e prefeituras de outros lugares não entram
// Brasil: palestras, seminários e eventos pontuais (de qualquer lugar) não são "nova lei"
const RE_EVENTO = /(palestra|seminario|audiencia publica|oficina|formacao|workshop|webinar|encontro|capacitacao|curso|entrevista|live |podcast)/
const RE_LOCAL_NAO_BAHIA = /(vereador|vereadora|camara municipal|municipal|prefeitura|prefeito|prefeita|assembleia legislativa|estadual|deputad[oa] estadual|governo do (estado|distrito))/

function ehOficial(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '')
  return SUFIXOS_OFICIAIS.some(s => (s.startsWith('.') ? h.endsWith(s) : h === s || h.endsWith('.' + s)))
}

function ehDaBahia(item) {
  const h = String(item.host || '').toLowerCase().replace(/^www\./, '')
  if (HOSTS_BAHIA.some(d => h === d || h.endsWith('.' + d))) return true
  return RE_BAHIA.test(normaliza(`${item.titulo} ${item.resumo} ${item.fonte}`))
}

/** Retorna null se a notícia está fora do escopo; senão { categoria, fonte_tipo, status, motivo, escopo }. */
function classificar(item) {
  const titulo = normaliza(item.titulo)
  const completo = normaliza(`${item.titulo} ${item.resumo}`)
  const oficial = ehOficial(item.host)
  const bahia = ehDaBahia(item)
  const social = ehRedeSocial(item.host)

  if (RE_RUIDO.test(titulo)) return null
  if (oficial ? !RE_INFANCIA.test(completo) : !RE_INFANCIA.test(titulo)) return null
  if (item.titulo.length < 20) return null

  // ── Brasil: só ECA, Conanda e novas leis ──
  if (!bahia) {
    if (RE_LOCAL_NAO_BAHIA.test(titulo) || ehMunicipalOuEstadualDeOutraUF(item.host)) return null
    const lei = RE_LEI_FORTE.test(titulo)
    if (!lei && RE_EVENTO.test(titulo)) return null
    const eca = RE_ECA_CONANDA.test(titulo) || (oficial && RE_ECA_CONANDA.test(completo))
    if (!lei && !eca) return null
    // notícia de crime que só cita o ECA não é "nova lei": só passa se o título trata de norma
    if (!lei && RE_VIOLACAO.test(titulo)) return null
    return {
      categoria: 'legislacao', fonte_tipo: oficial ? 'oficial' : 'imprensa', escopo: 'brasil',
      status: social ? 'pendente' : 'publicada', motivo: social ? 'rede-social' : (oficial ? 'auto-oficial' : 'auto-legislacao'),
    }
  }

  // ── Bahia: tudo sobre infância e adolescência ──
  let categoria = 'geral'
  if (RE_VIOLACAO.test(completo)) categoria = 'violacao'
  else if (RE_LEGISLACAO.test(completo)) categoria = 'legislacao'
  else if (RE_CAMPANHA.test(completo)) categoria = 'campanha'
  else if (RE_POLITICA.test(completo)) categoria = 'politica'

  let status = 'pendente'
  let motivo
  if (social) motivo = 'rede-social'
  else if (categoria === 'violacao') motivo = 'violacao'
  else if (ehMunicipalForaDeSalvador(item.host)) motivo = 'municipal'
  else if (oficial) { status = 'publicada'; motivo = 'auto-oficial' }
  else if (categoria === 'legislacao' || categoria === 'campanha') { status = 'publicada'; motivo = 'auto-' + categoria }
  else motivo = 'imprensa-geral'   // Bahia é pouco volume: o conselheiro decide

  return { categoria, fonte_tipo: oficial ? 'oficial' : 'imprensa', escopo: 'bahia', status, motivo }
}

function ehRedeSocial(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '')
  return REDES_SOCIAIS.some(d => h === d || h.endsWith('.' + d))
}

// Prefeitura de outra cidade (ex.: macae.rj.gov.br). Salvador e órgãos estaduais/federais não entram aqui.
function ehMunicipalForaDeSalvador(host) {
  const m = String(host || '').toLowerCase().match(new RegExp('([a-z0-9-]+)\\.(?:' + UFS + ')\\.gov\\.br$'))
  return !!m && m[1] !== 'salvador'
}

// Qualquer domínio .gov.br/.leg.br/.jus.br/.mp.br de município ou estado que NÃO seja a Bahia
function ehMunicipalOuEstadualDeOutraUF(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '')
  const uf = (h.match(new RegExp('(?:^|\\.)(' + UFS + ')\\.(?:gov|leg|jus|mp|def)\\.br$')) || [])[1]
  if (uf && uf !== 'ba') return true
  // Ministério Público e Tribunais de outros estados (ex.: mpsp.mp.br, tjrj.jus.br)
  const inst = h.match(new RegExp('^(?:mp|tj|tre|trt\d*|dp[e]?)(' + UFS + ')\.(?:mp|jus|def)\.br$'))
  return !!inst && inst[1] !== 'ba'
}

const chaveDe = titulo => crypto.createHash('sha1').update(normaliza(titulo).replace(/[^a-z0-9]/g, '').slice(0, 90)).digest('hex')

// ───────────────────────── coleta ─────────────────────────
async function coletar(supabase) {
  const limite = Date.now() - MAX_IDADE_DIAS * 86400000
  const resultados = await Promise.allSettled(FEEDS.map(baixar))

  const relatorio = { feeds: [], lidas: 0, relevantes: 0, novas: 0, publicadas: 0, pendentes: 0, descartadas: 0 }
  const porChave = new Map()

  resultados.forEach((r, i) => {
    const nome = FEEDS[i].nome
    if (r.status === 'rejected') { relatorio.feeds.push({ nome, erro: String(r.reason?.message || r.reason) }); return }
    relatorio.feeds.push({ nome, itens: r.value.length })
    for (const item of r.value) {
      relatorio.lidas++
      if (item.data.getTime() < limite) { relatorio.descartadas++; continue }
      const c = classificar(item)
      if (!c) { relatorio.descartadas++; continue }
      relatorio.relevantes++
      const chave = chaveDe(item.titulo)
      const atual = porChave.get(chave)
      // se a mesma notícia aparece mais de uma vez, prefere a de fonte oficial
      if (atual && (atual.fonte_tipo === 'oficial' || c.fonte_tipo !== 'oficial')) continue
      porChave.set(chave, {
        chave, url: item.url, titulo: item.titulo, resumo: item.resumo || null,
        fonte: item.fonte, publicada_em: item.data.toISOString(), ...c,
      })
    }
  })

  // descarta o que já está na base (publicado, na fila ou rejeitado) ANTES do teto da fila,
  // senão notícias antigas já gravadas ocupariam as vagas das novas
  const chaves = [...porChave.keys()]
  const existentes = new Set()
  for (let i = 0; i < chaves.length; i += 150) {
    const { data } = await supabase.from('noticias').select('chave').in('chave', chaves.slice(i, i + 150))
    ;(data || []).forEach(r => existentes.add(r.chave))
  }
  existentes.forEach(c => porChave.delete(c))
  relatorio.jaGravadas = existentes.size

  // fila de moderação com teto: fontes oficiais primeiro, depois as mais recentes
  const todas = [...porChave.values()]
  const publicadas = todas.filter(n => n.status === 'publicada')
  const pendentes = todas.filter(n => n.status === 'pendente')
    .sort((a, b) => (b.fonte_tipo === 'oficial') - (a.fonte_tipo === 'oficial') || b.publicada_em.localeCompare(a.publicada_em))
    .slice(0, MAX_PENDENTES_POR_COLETA)
  relatorio.cortadas = todas.length - publicadas.length - pendentes.length
  const linhas = [...publicadas, ...pendentes]
  if (linhas.length) {
    // ignoreDuplicates: notícias já coletadas (e possivelmente moderadas) não são sobrescritas
    const { data, error } = await supabase.from('noticias').upsert(linhas, { onConflict: 'chave', ignoreDuplicates: true }).select('status')
    if (error) throw new Error(error.message)
    relatorio.novas = (data || []).length
    relatorio.publicadas = (data || []).filter(n => n.status === 'publicada').length
    relatorio.pendentes = (data || []).filter(n => n.status === 'pendente').length
  }

  // limpeza: o que tem mais de 90 dias sai da base
  await supabase.from('noticias').delete().lt('coletada_em', new Date(Date.now() - 90 * 86400000).toISOString())
  return relatorio
}

module.exports = { FEEDS, classificar, lerRss, coletar, normaliza, ehOficial }
