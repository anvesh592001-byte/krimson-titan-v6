import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config()

const app = express()
const port = process.env.PORT || 8787
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '..', 'dist')
const model = process.env.OPENROUTER_MODEL || 'openrouter/free'
const fallbackModels = Array.from(new Set([model, 'openrouter/free', 'qwen/qwen3-coder:free', 'qwen/qwen3-32b:free']))
const visionModels = ['qwen/qwen2.5-vl-72b-instruct:free', 'google/gemini-2.0-flash-exp:free', 'meta-llama/llama-3.2-11b-vision-instruct:free']
const publicAccessCode = process.env.PUBLIC_ACCESS_CODE?.trim()
const requestLog = new Map()

app.use(cors())
app.use(express.json({ limit: '16mb' }))

app.use('/api', (req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const windowMs = 60_000
  const limit = 30
  const record = requestLog.get(ip) ?? { count: 0, resetAt: now + windowMs }

  if (record.resetAt < now) {
    record.count = 0
    record.resetAt = now + windowMs
  }

  record.count += 1
  requestLog.set(ip, record)

  if (record.count > limit) {
    res.status(429).json({ error: 'Rate limit reached. Try again in a minute.' })
    return
  }

  if (publicAccessCode && req.headers['x-access-code'] !== publicAccessCode) {
    res.status(401).json({ error: 'Access code required.' })
    return
  }

  next()
})

app.get('/api/health', async (_req, res) => {
  let openRouterReachable = false
  let networkError = ''

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4500)
    const response = await fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal })
    clearTimeout(timeout)
    openRouterReachable = response.ok
    if (!response.ok) networkError = `OpenRouter health check returned ${response.status}`
  } catch (error) {
    networkError =
      error?.cause?.code === 'EACCES'
        ? 'Network blocked for this Node process'
        : error instanceof Error
          ? error.message
          : 'OpenRouter is unreachable'
  }

  res.json({
    ok: true,
    model,
    hasKey: Boolean(process.env.OPENROUTER_API_KEY),
    accessCodeEnabled: Boolean(publicAccessCode),
    openRouterReachable,
    networkError,
  })
})

app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    res.json({
      fallback: true,
      content:
        'Local simulation active. Add OPENROUTER_API_KEY to .env and run npm run server for live free-model responses.',
    })
    return
  }

  try {
    const errors = []
    const hasImage = JSON.stringify(req.body.messages || []).includes('"image_url"')
    const modelCandidates = hasImage ? Array.from(new Set([...visionModels, ...fallbackModels])) : fallbackModels

    for (const candidateModel of modelCandidates) {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'KRIMSON TITAN V6',
        },
        body: JSON.stringify({
          model: candidateModel,
          messages: req.body.messages,
          temperature: req.body.temperature ?? 0.75,
          stream: false,
        }),
      })

      const text = await response.text()

      if (!response.ok) {
        errors.push(`${candidateModel}: ${text}`)
        continue
      }

      const data = JSON.parse(text)
      const content = data.choices?.[0]?.message?.content
      if (content) {
        res.json({ content, model: data.model || candidateModel })
        return
      }

      errors.push(`${candidateModel}: empty response`)
    }

    res.status(502).json({ error: `No OpenRouter model returned content. ${errors.join(' | ')}` })
  } catch (error) {
    const causeCode = error?.cause?.code
    const message =
      causeCode === 'EACCES'
        ? 'Network access is blocked for this Node process. Run npm run server from your normal Windows terminal, or allow outbound access to openrouter.ai.'
        : error instanceof Error
          ? error.message
          : 'Unknown server error'
    res.status(500).json({ error: message, code: causeCode })
  }
})

app.use(express.static(distPath))

app.get('*splat', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(port, () => {
  console.log(`KRIMSON TITAN proxy listening on http://localhost:${port}`)
})
