import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Conversation, Message, ModeId, PreferenceMemory, TitanSettings, ViewId } from '../types'

type TitanState = {
  conversations: Conversation[]
  activeId: string
  mode: ModeId
  view: ViewId
  memories: PreferenceMemory[]
  settings: TitanSettings
  voiceOutput: boolean
  booted: boolean
  createConversation: () => void
  setActive: (id: string) => void
  deleteConversation: (id: string) => void
  clearConversations: () => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, content: string) => void
  setMode: (mode: ModeId) => void
  setView: (view: ViewId) => void
  remember: (label: string, value: string) => void
  updateSettings: (settings: Partial<TitanSettings>) => void
  setVoiceOutput: (enabled: boolean) => void
  setBooted: () => void
}

const now = Date.now()
const seedId = crypto.randomUUID()
export const defaultSettings: TitanSettings = {
  simpleAnswers: true,
  animations: true,
  particles: true,
  bootSequence: true,
  compactMode: false,
  imageQuality: 0.82,
  voiceRate: 0.95,
  maxContext: 12,
}

const createSeed = (): Conversation => ({
  id: seedId,
  title: 'Titan initialization',
  mode: 'titan',
  createdAt: now,
  updatedAt: now,
  messages: [
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      createdAt: now,
      content:
        '**KRIMSON TITAN V6 initialized.**\n\nChoose a personality mode, speak, upload an image, or enter terminal diagnostics. Memory is persisted locally in this browser.',
    },
  ],
})

const isFailedFallbackMessage = (message: Message) =>
  message.role === 'assistant' &&
  (message.content.includes('local fallback active') ||
    message.content.includes('Live AI connection failed') ||
    message.content.includes('No endpoints found for deepseek'))

const removeFailedFallbackMessages = (conversations: Conversation[]) =>
  conversations
    .map((conversation) => ({
      ...conversation,
      messages: conversation.messages.filter((message) => !isFailedFallbackMessage(message)),
    }))
    .filter((conversation) => conversation.messages.length > 0)

export const useTitanStore = create<TitanState>()(
  persist(
    (set, get) => ({
      conversations: [createSeed()],
      activeId: seedId,
      mode: 'titan',
      view: 'chat',
      settings: defaultSettings,
      memories: [
        { id: crypto.randomUUID(), label: 'Interface', value: 'Crimson cinematic OS', updatedAt: now },
        { id: crypto.randomUUID(), label: 'AI provider', value: 'Provider bridge ready', updatedAt: now },
      ],
      voiceOutput: false,
      booted: false,
      createConversation: () => {
        const id = crypto.randomUUID()
        const conversation: Conversation = {
          id,
          title: 'New operation',
          mode: get().mode,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
        }
        set((state) => ({ conversations: [conversation, ...state.conversations], activeId: id, view: 'chat' }))
      },
      setActive: (id) => set({ activeId: id, view: 'chat' }),
      deleteConversation: (id) =>
        set((state) => {
          const conversations = state.conversations.filter((conversation) => conversation.id !== id)
          const fallback = conversations[0] ?? createSeed()
          return { conversations: conversations.length ? conversations : [fallback], activeId: fallback.id }
        }),
      clearConversations: () => {
        const seed = createSeed()
        set({ conversations: [seed], activeId: seed.id, view: 'chat' })
      },
      addMessage: (message) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === state.activeId
              ? {
                  ...conversation,
                  title:
                    conversation.messages.length === 0 && message.role === 'user'
                      ? message.content.slice(0, 42) || 'Image analysis'
                      : conversation.title,
                  mode: state.mode,
                  updatedAt: Date.now(),
                  messages: [...conversation.messages, message],
                }
              : conversation,
          ),
        })),
      updateMessage: (id, content) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === state.activeId
              ? {
                  ...conversation,
                  updatedAt: Date.now(),
                  messages: conversation.messages.map((message) => (message.id === id ? { ...message, content } : message)),
                }
              : conversation,
          ),
        })),
      setMode: (mode) => set({ mode }),
      setView: (view) => set({ view }),
      remember: (label, value) =>
        set((state) => ({
          memories: [{ id: crypto.randomUUID(), label, value, updatedAt: Date.now() }, ...state.memories].slice(0, 30),
        })),
      updateSettings: (nextSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...nextSettings },
        })),
      setVoiceOutput: (voiceOutput) => set({ voiceOutput }),
      setBooted: () => set({ booted: true }),
    }),
    {
      name: 'krimson-titan-v6-memory',
      version: 3,
      migrate: (persisted) => {
        if (!persisted || typeof persisted !== 'object') return persisted
        const state = persisted as TitanState
        const conversations = removeFailedFallbackMessages(state.conversations ?? [])
        const fallback = conversations[0] ?? createSeed()
        return {
          ...state,
          settings: { ...defaultSettings, ...(state.settings ?? {}) },
          conversations: conversations.length ? conversations : [fallback],
          activeId: conversations.some((conversation) => conversation.id === state.activeId) ? state.activeId : fallback.id,
        }
      },
    },
  ),
)

export const selectActiveConversation = (state: TitanState) =>
  state.conversations.find((conversation) => conversation.id === state.activeId) ?? state.conversations[0]
