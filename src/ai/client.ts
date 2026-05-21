import { modes } from './modes'
import type { Message, ModeId } from '../types'

type AiMessage = {
  role: 'system' | 'user' | 'assistant'
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >
}

const localResponse = (input: string, mode: ModeId, imageText?: string, error?: string) => {
  const imageLine = imageText ? `\n\nImage channel: ${imageText.slice(0, 180)}` : ''
  const errorLine = error
    ? `\n\nLive AI connection issue: ${error}`
    : ''

  return `${modes[mode].name} is in offline mode.${errorLine}\n\nTry again in a moment, or check that the server is running with the same provider shown in /api/health.${imageLine}\n\nYour message: ${input}`
}

const isLocalBrowser =
  typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)

const chatEndpoints = isLocalBrowser
  ? ['http://127.0.0.1:8787/api/chat', '/api/chat']
  : ['/api/chat']

const fetchTitanChat = async (body: string) => {
  let lastError = 'AI server did not respond'

  for (const endpoint of chatEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        cache: 'no-store',
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'AI request failed' }))
        lastError = data.error || 'AI request failed'
        continue
      }

      return response.json()
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown connection error'
    }
  }

  throw new Error(lastError)
}

export async function requestTitanResponse(
  messages: Message[],
  mode: ModeId,
  options: { imageName?: string; maxContext?: number; simpleAnswers?: boolean } = {},
) {
  const latest = messages[messages.length - 1]?.content ?? ''
  const maxContext = options.maxContext ?? 12
  const payload: AiMessage[] = [
    {
      role: 'system',
      content: `${modes[mode].prompt}${options.simpleAnswers ? ' Use simple language and keep the answer short unless the user asks for details.' : ''}`,
    },
    ...messages
      .filter((message) => !message.content.includes('local fallback active') && !message.content.includes('Live AI connection failed'))
      .slice(-maxContext)
      .map((message): AiMessage => {
        const role = message.role === 'assistant' ? 'assistant' : 'user'
        if (!message.image) return { role, content: message.content }

        return {
          role: 'user',
          content: [
            { type: 'text', text: `${message.content}\n\nAnalyze the attached image carefully. Describe visible objects, text, layout, and any useful conclusions.` },
            { type: 'image_url', image_url: { url: message.image } },
          ],
        }
      }),
  ]

  try {
    const data = await fetchTitanChat(JSON.stringify({ messages: payload }))
    return data.content || localResponse(latest, mode, options.imageName)
  } catch (error) {
    return localResponse(latest, mode, options.imageName, error instanceof Error ? error.message : 'Unknown connection error')
  }
}
