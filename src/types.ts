export type ModeId = 'titan' | 'krimson' | 'oracle' | 'chaos' | 'ghost'
export type ViewId = 'chat' | 'terminal' | 'memory' | 'settings' | 'landing'
export type Role = 'user' | 'assistant' | 'system'

export type Message = {
  id: string
  role: Role
  content: string
  createdAt: number
  image?: string
}

export type Conversation = {
  id: string
  title: string
  mode: ModeId
  createdAt: number
  updatedAt: number
  messages: Message[]
}

export type PreferenceMemory = {
  id: string
  label: string
  value: string
  updatedAt: number
}

export type TitanSettings = {
  simpleAnswers: boolean
  animations: boolean
  particles: boolean
  bootSequence: boolean
  compactMode: boolean
  imageQuality: number
  voiceRate: number
  maxContext: number
}
