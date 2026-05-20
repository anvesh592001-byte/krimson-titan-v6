import { modes } from './modes'
import type { Message, ModeId } from '../types'

type OpenRouterMessage = {
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
    ? `\n\n**Live AI connection failed:** ${error}\n\nYour API key may be fine, but the backend could not complete the OpenRouter request.`
    : ''

  return `**${modes[mode].name} local fallback active.**\n${errorLine}\n\nFor your request:\n\n> ${input}\n\nTo get real AI responses, run \`npm run server\` from a normal Windows terminal that can access \`openrouter.ai\`.\n\n\`\`\`ts\nconst status = 'KRIMSON TITAN V6 READY'\nconsole.log(status)\n\`\`\`${imageLine}`
}

export async function requestTitanResponse(
  messages: Message[],
  mode: ModeId,
  options: { imageName?: string; maxContext?: number; simpleAnswers?: boolean } = {},
) {
  const latest = messages[messages.length - 1]?.content ?? ''
  const maxContext = options.maxContext ?? 12
  const payload: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `${modes[mode].prompt}${options.simpleAnswers ? ' Use simple language and keep the answer short unless the user asks for details.' : ''}`,
    },
    ...messages
      .filter((message) => !message.content.includes('local fallback active') && !message.content.includes('Live AI connection failed'))
      .slice(-maxContext)
      .map((message): OpenRouterMessage => {
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
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: payload }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'OpenRouter proxy failed' }))
      throw new Error(data.error || 'OpenRouter proxy failed')
    }
    const data = await response.json()
    return data.content || localResponse(latest, mode, options.imageName)
  } catch (error) {
    return localResponse(latest, mode, options.imageName, error instanceof Error ? error.message : 'Unknown connection error')
  }
}
