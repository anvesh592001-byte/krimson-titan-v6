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
const provider = (process.env.AI_PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : process.env.XAI_API_KEY ? 'xai' : 'openrouter')).toLowerCase()
const isXai = provider === 'xai' || provider === 'grok'
const isGroq = provider === 'groq'
const model = isXai
  ? process.env.XAI_MODEL || 'grok-4.3'
  : isGroq
    ? process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    : process.env.OPENROUTER_MODEL || 'openrouter/free'
const apiKey = isXai ? process.env.XAI_API_KEY : isGroq ? process.env.GROQ_API_KEY : process.env.OPENROUTER_API_KEY
const apiBaseUrl = isXai ? 'https://api.x.ai/v1' : isGroq ? 'https://api.groq.com/openai/v1' : 'https://openrouter.ai/api/v1'
const hfApiKey = process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY
const hfImageModel = process.env.HF_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell'
const hfImageEndpoints = [
  `https://router.huggingface.co/hf-inference/models/${hfImageModel}`,
  `https://api-inference.huggingface.co/models/${hfImageModel}`,
]
const fallbackModels = isXai || isGroq
  ? Array.from(new Set([model]))
  : Array.from(new Set([model, 'openrouter/free', 'qwen/qwen3-coder:free', 'qwen/qwen3-32b:free']))
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
  let aiReachable = false
  let networkError = ''
  const providerName = isXai ? 'xAI' : isGroq ? 'GroqCloud' : 'OpenRouter'

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4500)
    const response = await fetch(`${apiBaseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    aiReachable = response.ok
    if (!response.ok) networkError = `${providerName} health check returned ${response.status}`
  } catch (error) {
    networkError =
      error?.cause?.code === 'EACCES'
        ? 'Network blocked for this Node process'
        : error instanceof Error
          ? error.message
          : `${providerName} is unreachable`
  }

  res.json({
    ok: true,
    provider: isXai ? 'xai' : isGroq ? 'groq' : 'openrouter',
    model,
    hasKey: Boolean(apiKey),
    accessCodeEnabled: Boolean(publicAccessCode),
    aiReachable,
    openRouterReachable: aiReachable,
    networkError,
  })
})

app.post('/api/chat', async (req, res) => {
  if (!apiKey) {
    res.json({
      fallback: true,
      content:
        `Local simulation active. Add ${isXai ? 'XAI_API_KEY' : isGroq ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY'} to .env and run npm run server for live AI responses.`,
    })
    return
  }

  try {
    const errors = []
    const hasImage = JSON.stringify(req.body.messages || []).includes('"image_url"')
    const modelCandidates = hasImage && !isXai && !isGroq ? Array.from(new Set([...visionModels, ...fallbackModels])) : fallbackModels

    for (const candidateModel of modelCandidates) {
      const response = await fetch(`${apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(!isXai && !isGroq && {
            'HTTP-Referer': 'http://localhost:5173',
            'X-Title': 'KRIMSON TITAN V6',
          }),
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

    res.status(502).json({ error: `No ${isXai ? 'Grok' : isGroq ? 'Groq' : 'OpenRouter'} model returned content. ${errors.join(' | ')}` })
  } catch (error) {
    const causeCode = error?.cause?.code
    const message =
      causeCode === 'EACCES'
        ? `Network access is blocked for this Node process. Run npm run server from your normal Windows terminal, or allow outbound access to ${isXai ? 'api.x.ai' : isGroq ? 'api.groq.com' : 'openrouter.ai'}.`
        : error instanceof Error
          ? error.message
          : 'Unknown server error'
    res.status(500).json({ error: message, code: causeCode })
  }
})

app.post('/api/images', async (req, res) => {
  const prompt = String(req.body.prompt || '').trim()

  if (!prompt) {
    res.status(400).json({ error: 'Image prompt is required.' })
    return
  }

  if (!hfApiKey) {
    res.status(400).json({ error: 'Add HF_API_KEY to .env to enable image generation.' })
    return
  }

  try {
    const errors = []

    for (const endpoint of hfImageEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${hfApiKey}`,
            'Content-Type': 'application/json',
            Accept: 'image/png',
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              num_inference_steps: 4,
              guidance_scale: 0,
            },
            options: {
              wait_for_model: true,
            },
          }),
        })

        const contentType = response.headers.get('content-type') || 'image/png'
        const buffer = Buffer.from(await response.arrayBuffer())

        if (!response.ok) {
          errors.push(`${endpoint}: ${buffer.toString('utf8') || response.status}`)
          continue
        }

        if (!contentType.startsWith('image/')) {
          errors.push(`${endpoint}: ${buffer.toString('utf8') || 'Hugging Face did not return an image.'}`)
          continue
        }

        res.json({
          image: `data:${contentType};base64,${buffer.toString('base64')}`,
          model: hfImageModel,
          prompt,
        })
        return
      } catch (error) {
        const code = error?.cause?.code
        errors.push(`${endpoint}: ${code ? `${code} - ` : ''}${error instanceof Error ? error.message : 'fetch failed'}`)
      }
    }

    res.status(502).json({
      error: `Hugging Face image generation failed. ${errors.join(' | ')}`,
    })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Image generation failed.' })
  }
})

app.use(express.static(distPath))

app.get('*splat', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(port, () => {
  console.log(`KRIMSON TITAN proxy listening on http://localhost:${port}`)
})
