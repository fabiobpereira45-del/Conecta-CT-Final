const express = require('express')
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const app = express()
app.use(express.json({ limit: '15mb' }))

const SECRET = process.env.CONVERT_SECRET

app.get('/health', (req, res) => res.send('ok'))

app.post('/convert', (req, res) => {
  const auth = req.headers.authorization || ''
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { html, filename } = req.body || {}
  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'missing html' })
  }

  const id = crypto.randomBytes(8).toString('hex')
  const dir = path.join(os.tmpdir(), id)
  fs.mkdirSync(dir, { recursive: true })
  const htmlPath = path.join(dir, 'doc.html')
  fs.writeFileSync(htmlPath, html, 'utf8')

  execFile(
    'soffice',
    ['--headless', '--convert-to', 'docx:MS Word 2007 XML', '--outdir', dir, htmlPath],
    { timeout: 55000, env: { ...process.env, HOME: dir } },
    (err, stdout, stderr) => {
      const docxPath = path.join(dir, 'doc.docx')
      if (err || !fs.existsSync(docxPath)) {
        console.error('conversao falhou', JSON.stringify({ err: err && err.message, stdout, stderr, listagem: fs.readdirSync(dir) }))
        cleanup(dir)
        return res.status(500).json({ error: 'conversion failed', stdout, stderr })
      }
      const buf = fs.readFileSync(docxPath)
      const safeName = (filename || 'formulario').replace(/[^a-zA-Z0-9._ -]/g, '_')
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`)
      res.send(buf)
      cleanup(dir)
    }
  )
})

function cleanup(dir) {
  fs.rm(dir, { recursive: true, force: true }, () => {})
}

const port = process.env.PORT || 8080
app.listen(port, () => console.log('conversor rodando na porta', port))
