#!/usr/bin/env node
// Gera o SEO estático do portal público (/site) a partir dos dados que já estão em public/site/index.html:
//   - JSON-LD (organização, página, FAQ e os 24 conselhos como GovernmentOffice)
//   - bloco <noscript> com a lista dos conselhos (para robôs que não executam JavaScript)
//   - data "Atualizado em" visível no rodapé
//   - public/robots.txt e public/sitemap.xml
//
// Uso:  node scripts/gerar-seo-site.js
// Rode de novo sempre que mudar os conselhos, as perguntas frequentes ou o domínio.

const fs = require('fs')
const path = require('path')

const BASE = process.env.SITE_BASE || 'https://conecta-ct-final.vercel.app'   // troque aqui (ou via SITE_BASE) se o domínio mudar
const ARQ = path.join(__dirname, '..', 'public', 'site', 'index.html')
const PUBLIC = path.join(__dirname, '..', 'public')

let html = fs.readFileSync(ARQ, 'utf8')
const eol = html.includes('\r\n') ? '\r\n' : '\n'
html = html.replace(/\r\n/g, '\n')

// ── extrai os dados do próprio HTML ──
function bloco(nome) {
  const ini = html.indexOf(`const ${nome} = [`)
  if (ini < 0) throw new Error(`const ${nome} não encontrado no portal`)
  const fim = html.indexOf('\n]', ini) + 2
  return new Function(`${html.slice(ini, fim)}; return ${nome}`)()
}
const CONSELHOS = bloco('CONSELHOS_BAIRROS')
const FAQ = bloco('FAQ')

const hoje = new Date()
const iso = hoje.toISOString().slice(0, 10)
const br = hoje.toLocaleDateString('pt-BR')
const titulo = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || 'Conselho Tutelar de Salvador'
const descricao = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || ''
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// ── telefones no formato internacional (+55 71 ...) ──
function telefones(c) {
  const lista = []
  for (const bruto of [c.telefone, c.celular]) {
    for (const parte of String(bruto || '').split('/')) {
      let d = parte.replace(/\D/g, '')
      if (d.length >= 10 && d.startsWith('71')) d = d.slice(2)
      if (d.length !== 8 && d.length !== 9) continue
      const num = d.length === 9 ? `${d.slice(0, 5)}-${d.slice(5)}` : `${d.slice(0, 4)}-${d.slice(4)}`
      lista.push(`+55 71 ${num}`)
    }
  }
  return [...new Set(lista)]
}

// ── JSON-LD ──
const ORG = `${BASE}/site#organizacao`
const grafo = [
  {
    '@type': 'GovernmentOrganization',
    '@id': ORG,
    name: 'Conselhos Tutelares de Salvador',
    alternateName: 'Conselho Tutelar de Salvador',
    url: `${BASE}/site`,
    logo: { '@type': 'ImageObject', url: `${BASE}/icons/icon-512.png`, width: 512, height: 512 },
    description: 'Órgãos permanentes e autônomos, não jurisdicionais, encarregados pela sociedade de zelar pelo cumprimento dos direitos da criança e do adolescente (Art. 131 do ECA).',
    areaServed: { '@type': 'City', name: 'Salvador', containedInPlace: { '@type': 'AdministrativeArea', name: 'Bahia' } },
    knowsAbout: ['Estatuto da Criança e do Adolescente', 'Proteção à infância', 'Direitos da criança e do adolescente'],
    subOrganization: CONSELHOS.map(c => ({ '@id': `${BASE}/site#ct-${c.num}` })),
  },
  { '@type': 'WebSite', '@id': `${BASE}/site#website`, url: `${BASE}/site`, name: 'Conselho Tutelar de Salvador', inLanguage: 'pt-BR', publisher: { '@id': ORG } },
  { '@type': 'WebPage', '@id': `${BASE}/site#pagina`, url: `${BASE}/site`, name: titulo, description: descricao, inLanguage: 'pt-BR', dateModified: iso, isPartOf: { '@id': `${BASE}/site#website` }, about: { '@id': ORG } },
  {
    '@type': 'FAQPage',
    '@id': `${BASE}/site#faq`,
    isPartOf: { '@id': `${BASE}/site#pagina` },
    mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.p, acceptedAnswer: { '@type': 'Answer', text: f.r } })),
  },
  ...CONSELHOS.map(c => {
    const o = {
      '@type': 'GovernmentOffice',
      '@id': `${BASE}/site#ct-${c.num}`,
      name: c.nome,
      parentOrganization: { '@id': ORG },
      areaServed: (c.bairros || []).map(b => ({ '@type': 'Place', name: `${b}, Salvador` })),
    }
    const tels = telefones(c)
    if (tels.length) o.telephone = tels.length === 1 ? tels[0] : tels
    if (c.email) o.email = c.email.toLowerCase()
    const endereco = c.endereco && !/a confirmar/i.test(c.endereco) ? c.endereco : null
    o.address = { '@type': 'PostalAddress', ...(endereco ? { streetAddress: endereco } : {}), addressLocality: 'Salvador', addressRegion: 'BA', addressCountry: 'BR' }
    return o
  }),
]
const jsonld = `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@graph': grafo }, null, 1).replace(/</g, '\\u003c')}\n</script>`

// ── conteúdo estático para quem não executa JavaScript ──
const noscript = `<noscript>
<section aria-label="Lista dos Conselhos Tutelares de Salvador" style="max-width:1100px;margin:0 auto;padding:40px 22px">
<h2>Os ${CONSELHOS.length} Conselhos Tutelares de Salvador</h2>
<p>Atendimento gratuito. Para denunciar violência contra criança ou adolescente, ligue 100 (24 horas, anônimo) ou procure o Conselho do seu bairro.</p>
<ul>
${CONSELHOS.map(c => {
  const tels = telefones(c).join(', ')
  const partes = [
    c.endereco && !/a confirmar/i.test(c.endereco) ? `Endereço: ${esc(c.endereco)}, Salvador/BA.` : '',
    tels ? `Telefones: ${esc(tels)}.` : '',
    c.email ? `E-mail: ${esc(c.email)}.` : '',
    (c.bairros || []).length ? `Bairros atendidos: ${esc((c.bairros || []).join(', '))}.` : '',
  ].filter(Boolean).join(' ')
  return `<li><strong>${esc(c.nome)}</strong> (${esc(c.regiao || '')}). ${partes}</li>`
}).join('\n')}
</ul>
</section>
</noscript>`

// ── injeta nos marcadores ──
function injeta(marca, conteudo) {
  const re = new RegExp(`(<!--SEO:${marca}-->)[\\s\\S]*?(<!--/SEO:${marca}-->)`)
  if (!re.test(html)) throw new Error(`Marcador SEO:${marca} não encontrado em public/site/index.html`)
  html = html.replace(re, (_, a, b) => `${a}\n${conteudo}\n${b}`)
}
injeta('JSONLD', jsonld)
injeta('NOSCRIPT', noscript)
html = html.replace(/<time id="atualizado" datetime="[^"]*">[^<]*<\/time>/, `<time id="atualizado" datetime="${iso}">${br}</time>`)

fs.writeFileSync(ARQ, html.replace(/\n/g, eol))

// ── robots.txt e sitemap.xml ──
fs.writeFileSync(path.join(PUBLIC, 'robots.txt'),
`# Portal público: /site. O sistema interno (Conecta-CT) fica na raiz e não é indexado (meta noindex).
User-agent: *
Allow: /site
Allow: /icons/
Disallow: /api/

Sitemap: ${BASE}/sitemap.xml
`)
fs.writeFileSync(path.join(PUBLIC, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE}/site</loc>
    <lastmod>${iso}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`)

console.log(`SEO gerado: ${CONSELHOS.length} conselhos, ${FAQ.length} perguntas, base ${BASE}, atualizado em ${br}`)
