/**
 * Coleta e classificação de notícias sobre infância e adolescência.
 *
 * Fontes: Google Notícias (buscas por tema, que cobrem jornais, portais de TV e rádio, órgãos e
 * prefeituras), Agência Brasil e Agência Câmara. X/Instagram não entram: as APIs são fechadas.
 *
 * Direitos autorais: guardamos só título, um trecho curto e o link da fonte, sem imagem.
 *
 * Regra de publicação (versão com moderação):
 *   - violência/violação ........................ sempre 'pendente' (um conselheiro decide)
 *   - fonte oficial (gov, leg, jus, mp, unicef...) ... 'publicada'
 *   - imprensa com lei/resolução/campanha ......... 'publicada'
 *   - imprensa com assunto geral/política ......... 'pendente'
 */
const crypto = require('crypto')

const UA = 'Mozilla/5.0 (compatible; ConselhoTutelarSalvadorBot/1.0; +https://conecta-ct-final.vercel.app/site)'
const TIMEOUT_MS = 8000
const MAX_IDADE_DIAS = 7
const MAX_PENDENTES_POR_COLETA = 30   // a fila precisa caber no olho de um conselheiro

const gnews = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`

const FEEDS = [
  { nome: 'Google Notícias · ECA', url: gnews('"Estatuto da Criança e do Adolescente" OR "ECA" criança when:2d'), google: true },
  { nome: 'Google Notícias · Conselho Tutelar', url: gnews('Conanda OR "Conselho Tutelar" OR "Conselhos Tutelares" when:2d'), google: true },
  { nome: 'Google Notícias · Leis', url: gnews('(lei OR resolução OR decreto OR "projeto de lei" OR sancionada) (criança OR adolescente OR infância) when:2d'), google: true },
  { nome: 'Google Notícias · Violações', url: gnews('(violência OR abuso OR "maus-tratos" OR "exploração sexual" OR abandono) (criança OR adolescente) when:1d'), google: true },
  { nome: 'Google Notícias · Trabalho infantil', url: gnews('"trabalho infantil" OR "exploração infantil" OR "violência sexual contra crianças" when:3d'), google: true },
  { nome: 'Google Notícias · Direitos', url: gnews('"direitos da criança" OR "direitos das crianças" OR "direitos do adolescente" when:3d'), google: true },
  { nome: 'Google Notícias · Políticas', url: gnews('(campanha OR programa OR "política pública") (infância OR adolescência OR crianças) when:2d'), google: true },
  { nome: 'Google Notícias · Salvador', url: gnews('Salvador (criança OR adolescente OR "Conselho Tutelar") when:3d'), google: true },
  { nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', fonte: 'Agência Brasil', host: 'agenciabrasil.ebc.com.br' },
  { nome: 'Agência Câmara', url: 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', fonte: 'Agência Câmara', host: 'camara.leg.br' },
]

// Domínios (e sufixos) tratados como fonte oficial.
const SUFIXOS_OFICIAIS = ['gov.br', '.gov.br', '.leg.br', '.jus.br', '.mp.br', '.def.br', '.ebc.com.br', 'unicef.org', 'unicef.org.br', 'camara.leg.br', 'senado.leg.br', 'planalto.gov.br']

const REDES_SOCIAIS = ['instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'threads.net', 'kwai.com', 'linkedin.com']
const UFS = 'ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to'

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
const RE_VIOLACAO = /(violencia|abuso|estupr|maus[- ]tratos|assassin|homicidio|morte|morreu|morrem|morta|morto|espanc|agress|abandon|exploracao sexual|trabalho infantil|desaparec|sequestr|trafico|pedofil|pornografia infantil|aliciament|castigo fisico|tortur|bullying|suicidio|automutilacao|baleado|baleada|esfaque|feri(do|da|dos|das)|preso|presa|prisao|apreendid)/
const RE_LEGISLACAO = /(\blei\b|\bleis\b|projeto de lei|\bpl \d|sancion|resolucao|decreto|portaria|constituicao|\bstf\b|\bstj\b|\bcnj\b|jurisprudencia|medida provisoria|\bcodigo\b|aprova|aprovou|aprovad|votacao|\bcomissao\b|camara dos deputados|senado|regulament|\bpec\b|maioridade penal|\bplenario\b|\bconanda\b)/
const RE_CAMPANHA = /(campanha|conferencia|semana|dia nacional|mobiliza|lancamento|lanca |programa)/
const RE_POLITICA = /(politica publica|vacin|matricula|merenda|bolsa familia|beneficio|investimento|orcamento|educacao|saude|assistencia social|protecao|direitos)/

function ehOficial(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '')
  return SUFIXOS_OFICIAIS.some(s => (s.startsWith('.') ? h.endsWith(s) : h === s || h.endsWith('.' + s)))
}

/** Retorna null se a notícia não é relevante; senão { categoria, fonte_tipo, status, motivo }. */
function classificar(item) {
  const titulo = normaliza(item.titulo)
  const completo = normaliza(`${item.titulo} ${item.resumo}`)
  const oficial = ehOficial(item.host)

  if (RE_RUIDO.test(titulo)) return null
  if (oficial ? !RE_INFANCIA.test(completo) : !RE_INFANCIA.test(titulo)) return null
  if (item.titulo.length < 20) return null

  let categoria = 'geral'
  if (RE_VIOLACAO.test(completo)) categoria = 'violacao'
  else if (RE_LEGISLACAO.test(completo)) categoria = 'legislacao'
  else if (RE_CAMPANHA.test(completo)) categoria = 'campanha'
  else if (RE_POLITICA.test(completo)) categoria = 'politica'

  let status = 'pendente'
  let motivo
  if (ehRedeSocial(item.host)) motivo = 'rede-social'
  else if (categoria === 'violacao') motivo = 'violacao'
  else if (ehMunicipalForaDeSalvador(item.host)) motivo = 'municipal'
  else if (oficial) { status = 'publicada'; motivo = 'auto-oficial' }
  else if (categoria === 'legislacao' || categoria === 'campanha') { status = 'publicada'; motivo = 'auto-' + categoria }
  else return null   // imprensa com assunto geral/política: ruído demais, descartada

  return { categoria, fonte_tipo: oficial ? 'oficial' : 'imprensa', status, motivo }
}

function ehRedeSocial(host) {
  const h = String(host || '').toLowerCase().replace(/^www./, '')
  return REDES_SOCIAIS.some(d => h === d || h.endsWith('.' + d))
}

// Prefeitura de outra cidade (ex.: macae.rj.gov.br). Salvador e órgãos estaduais/federais não entram aqui.
function ehMunicipalForaDeSalvador(host) {
  const m = String(host || '').toLowerCase().match(new RegExp('([a-z0-9-]+)\.(?:' + UFS + ')\.gov\.br$'))
  return !!m && m[1] !== 'salvador'
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
