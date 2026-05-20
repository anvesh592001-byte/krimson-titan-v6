/* eslint-disable react-hooks/refs */
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot,
  Brain,
  ChevronLeft,
  CircleStop,
  Copy,
  Cpu,
  Eye,
  EyeOff,
  ImagePlus,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Menu,
  Mic,
  Monitor,
  Orbit,
  Plus,
  Radar,
  RefreshCcw,
  Search,
  Send,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  Trash2,
  User,
  UserPlus,
  Volume2,
  VolumeX,
  Wifi,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import ReactMarkdown from 'react-markdown'
import { requestTitanResponse } from './ai/client'
import { modes } from './ai/modes'
import { defaultSettings, selectActiveConversation, useTitanStore } from './store/useTitanStore'
import type { Message, ModeId, TitanSettings, ViewId } from './types'

const quickPromptsByMode: Record<ModeId, string[]> = {
  titan: ['Summarize this clearly.', 'Make a step-by-step plan.', 'Help me build this feature.'],
  krimson: ['Write a dark realistic scene.', 'Create intense dialogue.', 'Turn this idea into a short script.'],
  oracle: ['Solve this step by step.', 'Explain this formula simply.', 'Check my answer.'],
  chaos: ['Give me 10 wild ideas.', 'Create names and hooks.', 'Make this concept more unique.'],
  ghost: ['Debug this error fast.', 'Make a security checklist.', 'Give me the shortest fix.'],
}

const bootLines = [
  'KRIMSON TITAN V6 kernel handshake',
  'Local memory lattice mounted',
  'Voice bridge listening for browser APIs',
  'OpenRouter free-model proxy armed',
  'Crimson particle grid calibrated',
]

const authUsersKey = 'krimson-titan-v6-auth-users'
const authSessionKey = 'krimson-titan-v6-auth-session'
const sessionMs = 1000 * 60 * 60 * 8
const lockoutMs = 1000 * 60 * 5
const recoveryMs = 1000 * 60 * 10

type AuthUserRecord = {
  id: string
  name: string
  email: string
  salt: string
  passwordHash: string
  createdAt: number
  failedAttempts: number
  lockedUntil?: number
}

type AuthSession = {
  userId: string
  expiresAt: number
}

type AuthVariant = 'login' | 'register' | 'reset'

type AiLink = {
  checked: boolean
  online: boolean
  hasKey: boolean
  openRouterReachable: boolean
  networkError?: string
  model?: string
}

function App() {
  const active = useTitanStore(selectActiveConversation)
  const conversations = useTitanStore((state) => state.conversations)
  const mode = useTitanStore((state) => state.mode)
  const view = useTitanStore((state) => state.view)
  const memories = useTitanStore((state) => state.memories)
  const settings = useTitanStore((state) => state.settings ?? defaultSettings)
  const voiceOutput = useTitanStore((state) => state.voiceOutput)
  const booted = useTitanStore((state) => state.booted)
  const addMessage = useTitanStore((state) => state.addMessage)
  const updateMessage = useTitanStore((state) => state.updateMessage)
  const createConversation = useTitanStore((state) => state.createConversation)
  const setActive = useTitanStore((state) => state.setActive)
  const deleteConversation = useTitanStore((state) => state.deleteConversation)
  const clearConversations = useTitanStore((state) => state.clearConversations)
  const setMode = useTitanStore((state) => state.setMode)
  const setView = useTitanStore((state) => state.setView)
  const remember = useTitanStore((state) => state.remember)
  const updateSettings = useTitanStore((state) => state.updateSettings)
  const setVoiceOutput = useTitanStore((state) => state.setVoiceOutput)
  const setBooted = useTitanStore((state) => state.setBooted)

  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [imagePreview, setImagePreview] = useState<string>()
  const [imageName, setImageName] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [authUser, setAuthUser] = useState<AuthUserRecord | null>(() => getSavedAuthUser())
  const [aiLink, setAiLink] = useState<AiLink>({ checked: false, online: false, hasKey: false, openRouterReachable: false })

  const filteredConversations = useMemo(
    () =>
      conversations.filter((conversation) =>
        `${conversation.title} ${conversation.messages.map((message) => message.content).join(' ')}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [conversations, search],
  )

  useEffect(() => {
    const timeout = window.setTimeout(setBooted, 2400)
    return () => window.clearTimeout(timeout)
  }, [setBooted])

  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then((response) => response.json())
      .then((data: { ok?: boolean; hasKey?: boolean; openRouterReachable?: boolean; networkError?: string; model?: string }) => {
        if (!cancelled) {
          setAiLink({
            checked: true,
            online: Boolean(data.ok),
            hasKey: Boolean(data.hasKey),
            openRouterReachable: Boolean(data.openRouterReachable),
            networkError: data.networkError,
            model: data.model,
          })
        }
      })
      .catch(() => {
        if (!cancelled) setAiLink({ checked: true, online: false, hasKey: false, openRouterReachable: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [active?.messages.length, isThinking])

  const speak = (text: string) => {
    if (!voiceOutput || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text.replace(/[`*_>#-]/g, ''))
    utterance.rate = settings.voiceRate
    utterance.pitch = mode === 'oracle' ? 0.85 : 1
    window.speechSynthesis.speak(utterance)
  }

  const streamAssistant = async (content: string, assistantId: string) => {
    let output = ''
    const chunks = content.match(/.{1,7}/g) ?? [content]
    for (const chunk of chunks) {
      output += chunk
      updateMessage(assistantId, output)
      await new Promise((resolve) => window.setTimeout(resolve, 16))
    }
  }

  const submitPrompt = async (override?: string) => {
    const content = (override ?? input).trim()
    if (!content && !imagePreview) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content || `Analyze uploaded image: ${imageName}`,
      createdAt: Date.now(),
      image: imagePreview,
    }
    addMessage(userMessage)
    remember('Recent activity', `${modes[mode].name}: ${userMessage.content.slice(0, 72)}`)
    setInput('')
    setImagePreview(undefined)
    setImageName('')
    setIsThinking(true)

    const assistantId = crypto.randomUUID()
    addMessage({ id: assistantId, role: 'assistant', content: '', createdAt: Date.now() })
    const response = await requestTitanResponse([...(active?.messages ?? []), userMessage], mode, {
      imageName,
      maxContext: settings.maxContext,
      simpleAnswers: settings.simpleAnswers,
    })
    await streamAssistant(response, assistantId)
    speak(response)
    setIsThinking(false)
  }

  const regenerate = async () => {
    const lastUser = [...(active?.messages ?? [])].reverse().find((message) => message.role === 'user')
    if (lastUser) await submitPrompt(lastUser.content)
  }

  const shareConversation = async () => {
    const conversation = active
    if (!conversation) return
    const transcript = conversation.messages
      .map((message) => `${message.role === 'assistant' ? 'TITAN' : 'OPERATOR'}: ${message.content}`)
      .join('\n\n')
    const text = `KRIMSON TITAN V6 - ${conversation.title}\n\n${transcript}`

    if (navigator.share) {
      await navigator.share({ title: conversation.title, text }).catch(() => undefined)
      return
    }

    await navigator.clipboard.writeText(text)
    remember('Share', `Copied transcript: ${conversation.title}`)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submitPrompt()
  }

  const onImage = async (file?: File) => {
    if (!file) return
    const image = await resizeImage(file, settings.imageQuality)
    setImagePreview(image)
    setImageName(file.name)
    remember('Image intake', file.name)
  }

  const resizeImage = (file: File, quality: number) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Could not read image'))
      reader.onload = () => {
        const image = new Image()
        image.onerror = () => reject(new Error('Could not load image'))
        image.onload = () => {
          const maxSide = 1280
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(image.width * scale))
          canvas.height = Math.max(1, Math.round(image.height * scale))
          const context = canvas.getContext('2d')
          if (!context) {
            reject(new Error('Could not prepare image'))
            return
          }
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', quality))
        }
        image.src = String(reader.result)
      }
      reader.readAsDataURL(file)
    })

  const toggleMic = () => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) {
      setInput((value) => `${value} Voice recognition is not available in this browser.`.trim())
      return
    }

    const recognition = new Recognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript)
        .join(' ')
      setInput((value) => `${value} ${transcript}`.trim())
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognitionRef.current = recognition
    setIsListening(true)
    recognition.start()
  }

  if (!authUser) {
    return (
      <div className="min-h-screen overflow-hidden bg-[#050505] text-white">
        <AmbientSystem mode="krimson" />
        <AuthGate onAuthenticated={setAuthUser} />
      </div>
    )
  }

  return (
    <div className={`min-h-screen overflow-hidden bg-[#050505] text-white ${settings.compactMode ? 'compact-mode' : ''}`}>
      <AmbientSystem mode={mode} particles={settings.particles} animations={settings.animations} />
      <AnimatePresence>{settings.bootSequence && !booted && <BootSequence />}</AnimatePresence>

      <div className="relative z-10 flex min-h-screen">
        <Sidebar
          activeId={active?.id}
          conversations={filteredConversations}
          mode={mode}
          search={search}
          open={sidebarOpen}
          onSearch={setSearch}
          onCreate={createConversation}
          onClear={clearConversations}
          onSelect={(id) => {
            setActive(id)
            setSidebarOpen(false)
          }}
          onDelete={deleteConversation}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="flex min-h-screen flex-1 flex-col">
          <Topbar
            mode={mode}
            view={view}
            voiceOutput={voiceOutput}
            userName={authUser.name}
            aiLink={aiLink}
            onMenu={() => setSidebarOpen(true)}
            onMode={setMode}
            onView={setView}
            onVoice={() => {
              window.speechSynthesis?.cancel()
              setVoiceOutput(!voiceOutput)
            }}
            onLogout={() => {
              window.speechSynthesis?.cancel()
              localStorage.removeItem(authSessionKey)
              setAuthUser(null)
            }}
          />

          <AnimatePresence mode="wait">
            {view === 'chat' && (
              <ChatView
                key="chat"
                messages={active?.messages ?? []}
                input={input}
                imageName={imageName}
                imagePreview={imagePreview}
                isThinking={isThinking}
                isListening={isListening}
                mode={mode}
                scrollRef={scrollRef}
                onInput={setInput}
                onSubmit={onSubmit}
                onImage={onImage}
                onRemoveImage={() => {
                  setImagePreview(undefined)
                  setImageName('')
                }}
                onMic={toggleMic}
                onStopVoice={() => window.speechSynthesis?.cancel()}
                onRegenerate={regenerate}
                onShare={shareConversation}
                onQuick={submitPrompt}
              />
            )}
            {view === 'terminal' && <TerminalView key="terminal" />}
            {view === 'memory' && <MemoryView key="memory" memories={memories} />}
            {view === 'settings' && (
              <SettingsView
                key="settings"
                settings={settings}
                voiceOutput={voiceOutput}
                onSettings={updateSettings}
                onVoiceOutput={setVoiceOutput}
                onClear={clearConversations}
              />
            )}
            {view === 'landing' && <LandingView key="landing" aiLink={aiLink} onStart={() => setView('chat')} />}
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

function AmbientSystem({ animations = true, mode, particles = true }: { animations?: boolean; mode: ModeId; particles?: boolean }) {
  const aura = modes[mode].aura

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(220,20,60,0.22),transparent_32%),linear-gradient(180deg,#080607,#050505_45%,#090203)]" />
      <div className="absolute inset-0 titan-grid opacity-45" />
      {particles && Array.from({ length: 34 }).map((_, index) => (
        <motion.span
          key={index}
          className="absolute h-1 w-1 rounded-full bg-rose-400 shadow-[0_0_16px_rgba(220,20,60,0.95)]"
          style={{ left: `${(index * 29) % 100}%`, top: `${(index * 47) % 100}%` }}
          animate={animations ? { y: [-20, 40, -20], opacity: [0.2, 0.9, 0.2], scale: [1, 1.8, 1] } : { opacity: 0.35 }}
          transition={{ duration: 4 + (index % 5), repeat: Infinity, delay: index * 0.08 }}
        />
      ))}
      <motion.div
        className="absolute -right-36 top-24 h-96 w-96 rounded-full blur-3xl"
        style={{ backgroundColor: aura }}
        animate={animations ? { opacity: [0.13, 0.32, 0.13], scale: [1, 1.12, 1] } : { opacity: 0.18 }}
        transition={{ duration: 5, repeat: Infinity }}
      />
    </div>
  )
}

function readUsers(): AuthUserRecord[] {
  try {
    return JSON.parse(localStorage.getItem(authUsersKey) ?? '[]') as AuthUserRecord[]
  } catch {
    return []
  }
}

function writeUsers(users: AuthUserRecord[]) {
  localStorage.setItem(authUsersKey, JSON.stringify(users))
}

function readSession(): AuthSession | null {
  try {
    return JSON.parse(localStorage.getItem(authSessionKey) ?? 'null') as AuthSession | null
  } catch {
    return null
  }
}

function getSavedAuthUser() {
  const session = readSession()
  if (!session || session.expiresAt < Date.now()) {
    localStorage.removeItem(authSessionKey)
    return null
  }
  return readUsers().find((record) => record.id === session.userId) ?? null
}

function writeSession(userId: string) {
  localStorage.setItem(authSessionKey, JSON.stringify({ userId, expiresAt: Date.now() + sessionMs }))
}

async function hashPassword(password: string, salt: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64ToBytes(salt),
      iterations: 210000,
    },
    key,
    256,
  )
  return bytesToBase64(new Uint8Array(bits))
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

function getPasswordStrength(password: string) {
  const checks = [
    { label: '12+ characters', ok: password.length >= 12 },
    { label: 'uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'lowercase letter', ok: /[a-z]/.test(password) },
    { label: 'number', ok: /\d/.test(password) },
    { label: 'symbol', ok: /[^A-Za-z0-9]/.test(password) },
  ]
  return { checks, score: checks.filter((check) => check.ok).length }
}

function generateRecoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

function AuthGate({ onAuthenticated }: { onAuthenticated: (user: AuthUserRecord) => void }) {
  const [variant, setVariant] = useState<AuthVariant>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('')
  const [recovery, setRecovery] = useState<{
    email: string
    codePreview: string
    salt: string
    hash: string
    expiresAt: number
  } | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const strength = getPasswordStrength(password)
  const isRegister = variant === 'register'
  const isReset = variant === 'reset'

  const switchVariant = (next: AuthVariant) => {
    setVariant(next)
    setMessage('')
    setPassword('')
    setConfirm('')
    setRecoveryCodeInput('')
    if (next !== 'reset') setRecovery(null)
  }

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    setBusy(true)

    try {
      const normalizedEmail = email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        setMessage('Enter a valid email address.')
        return
      }

      if (isReset) {
        const users = readUsers()
        const user = users.find((record) => record.email === normalizedEmail)
        if (!user) {
          setMessage('No secure vault found for that email.')
          return
        }

        if (!recovery || recovery.email !== normalizedEmail) {
          const code = generateRecoveryCode()
          const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)))
          const hash = await hashPassword(code, salt)
          setRecovery({ email: normalizedEmail, codePreview: code, salt, hash, expiresAt: Date.now() + recoveryMs })
          setMessage('Recovery code generated. Enter it below with a new strong password.')
          return
        }

        if (recovery.expiresAt < Date.now()) {
          setRecovery(null)
          setMessage('Recovery code expired. Generate a new code.')
          return
        }
        const attemptedCodeHash = await hashPassword(recoveryCodeInput.trim().toUpperCase(), recovery.salt)
        if (attemptedCodeHash !== recovery.hash) {
          setMessage('Recovery code is incorrect.')
          return
        }
        if (strength.score < 5) {
          setMessage('Use a stronger password before resetting the vault.')
          return
        }
        if (password !== confirm) {
          setMessage('Password confirmation does not match.')
          return
        }

        const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)))
        const passwordHash = await hashPassword(password, salt)
        writeUsers(
          users.map((record) =>
            record.id === user.id ? { ...record, salt, passwordHash, failedAttempts: 0, lockedUntil: undefined } : record,
          ),
        )
        setRecovery(null)
        setRecoveryCodeInput('')
        setPassword('')
        setConfirm('')
        setVariant('login')
        setMessage('Password reset complete. Log in with your new password.')
        return
      }

      if (isRegister) {
        if (name.trim().length < 2) {
          setMessage('Enter your operator name.')
          return
        }
        if (strength.score < 5) {
          setMessage('Use a stronger password before creating the vault.')
          return
        }
        if (password !== confirm) {
          setMessage('Password confirmation does not match.')
          return
        }
        const users = readUsers()
        if (users.some((user) => user.email === normalizedEmail)) {
          setMessage('That email already has a Titan vault.')
          return
        }

        const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)))
        const passwordHash = await hashPassword(password, salt)
        const user: AuthUserRecord = {
          id: crypto.randomUUID(),
          name: name.trim(),
          email: normalizedEmail,
          salt,
          passwordHash,
          createdAt: Date.now(),
          failedAttempts: 0,
        }
        writeUsers([user, ...users])
        writeSession(user.id)
        onAuthenticated(user)
        return
      }

      const users = readUsers()
      const user = users.find((record) => record.email === normalizedEmail)
      if (!user) {
        setMessage('No secure vault found for that email.')
        return
      }
      if (user.lockedUntil && user.lockedUntil > Date.now()) {
        const minutes = Math.ceil((user.lockedUntil - Date.now()) / 60000)
        setMessage(`Vault temporarily sealed. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`)
        return
      }

      const attemptedHash = await hashPassword(password, user.salt)
      if (attemptedHash !== user.passwordHash) {
        const failedAttempts = user.failedAttempts + 1
        const lockedUntil = failedAttempts >= 5 ? Date.now() + lockoutMs : undefined
        writeUsers(
          users.map((record) =>
            record.id === user.id ? { ...record, failedAttempts, lockedUntil } : record,
          ),
        )
        setMessage(lockedUntil ? 'Too many failed attempts. Vault sealed for 5 minutes.' : 'Invalid credentials.')
        return
      }

      const unlockedUser = { ...user, failedAttempts: 0, lockedUntil: undefined }
      writeUsers(users.map((record) => (record.id === user.id ? unlockedUser : record)))
      writeSession(user.id)
      onAuthenticated(unlockedUser)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="relative z-10 grid min-h-screen place-items-center px-4 py-8">
      <motion.section
        className="auth-shell grid w-full max-w-6xl overflow-hidden lg:grid-cols-[0.95fr_1.05fr]"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
      >
        <div className="auth-hero">
          <div className="mb-8 inline-grid h-16 w-16 place-items-center rounded border border-rose-400/40 bg-rose-500/10 shadow-[0_0_48px_rgba(220,20,60,0.42)]">
            <Lock className="h-8 w-8 text-rose-300" />
          </div>
          <p className="font-['Orbitron'] text-sm uppercase tracking-[0.34em] text-rose-300">Secure access</p>
          <h1 className="mt-4 font-['Orbitron'] text-4xl uppercase leading-tight tracking-[0.08em] md:text-6xl">
            Titan vault gateway
          </h1>
          <p className="mt-5 max-w-xl text-zinc-300">
            Credentials are salted, hashed in-browser, rate-limited after failed attempts, and session-scoped.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-zinc-300">
            {['PBKDF2-SHA256 password vault', '5-attempt temporary lockout', '8-hour local secure session'].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded border border-white/10 bg-white/[0.04] p-3">
                <KeyRound className="h-4 w-4 text-rose-300" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <form className="auth-panel" onSubmit={(event) => void submitAuth(event)}>
          <div className="mb-6 flex rounded border border-white/10 bg-black/30 p-1">
            <button
              type="button"
              className={`auth-tab ${variant === 'login' ? 'active' : ''}`}
              onClick={() => switchVariant('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={`auth-tab ${variant === 'register' ? 'active' : ''}`}
              onClick={() => switchVariant('register')}
            >
              Register
            </button>
            <button
              type="button"
              className={`auth-tab ${variant === 'reset' ? 'active' : ''}`}
              onClick={() => switchVariant('reset')}
            >
              Reset
            </button>
          </div>

          <h2 className="font-['Orbitron'] text-2xl uppercase tracking-[0.16em]">
            {isReset ? 'Recover vault' : isRegister ? 'Create operator' : 'Authenticate'}
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            {isReset
              ? 'Generate a local recovery code and set a new strong password.'
              : isRegister
                ? 'Build a local encrypted identity for this browser.'
                : 'Unlock your local Titan command shell.'}
          </p>

          <div className="mt-7 grid gap-4">
            {isRegister && (
              <label className="auth-field">
                <User size={18} />
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Operator name" autoComplete="name" />
              </label>
            )}
            <label className="auth-field">
              <Mail size={18} />
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" autoComplete="email" />
            </label>
            {recovery && isReset && (
              <div className="rounded border border-rose-400/30 bg-rose-500/10 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-rose-200">Recovery code</p>
                <p className="mt-2 font-mono text-2xl tracking-[0.22em] text-white">{recovery.codePreview}</p>
                <p className="mt-2 text-xs text-zinc-400">Valid for 10 minutes in this local prototype.</p>
              </div>
            )}
            {isReset && recovery && (
              <label className="auth-field">
                <KeyRound size={18} />
                <input
                  value={recoveryCodeInput}
                  onChange={(event) => setRecoveryCodeInput(event.target.value.toUpperCase())}
                  placeholder="Recovery code"
                  autoComplete="one-time-code"
                />
              </label>
            )}
            {(!isReset || recovery) && (
              <label className="auth-field">
                <KeyRound size={18} />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isReset ? 'New password' : 'Password'}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegister || isReset ? 'new-password' : 'current-password'}
                />
                <button type="button" className="text-zinc-500 hover:text-rose-300" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </label>
            )}
            {(isRegister || (isReset && recovery)) && (
              <>
                <label className="auth-field">
                  <Lock size={18} />
                  <input
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder={isReset ? 'Confirm new password' : 'Confirm password'}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                  />
                </label>
                <PasswordMeter score={strength.score} checks={strength.checks} />
              </>
            )}
          </div>

          {message && <p className="mt-4 rounded border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{message}</p>}

          <button className="neon-button mt-6 w-full justify-center" disabled={busy} type="submit">
            {isRegister ? <UserPlus size={18} /> : <Lock size={18} />}
            {busy
              ? 'Securing...'
              : isReset
                ? recovery
                  ? 'Reset password'
                  : 'Generate recovery code'
                : isRegister
                  ? 'Create secure vault'
                  : 'Unlock Titan'}
          </button>
        </form>
      </motion.section>
    </main>
  )
}

function PasswordMeter({ score, checks }: { score: number; checks: { label: string; ok: boolean }[] }) {
  return (
    <div className="rounded border border-white/10 bg-black/25 p-3">
      <div className="mb-3 flex gap-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className={`h-1.5 flex-1 rounded ${index < score ? 'bg-rose-400' : 'bg-white/10'}`} />
        ))}
      </div>
      <div className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
        {checks.map((check) => (
          <span key={check.label} className={check.ok ? 'text-rose-200' : ''}>
            {check.ok ? 'OK' : '--'} {check.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function BootSequence() {
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-[#050505]"
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.7 }}
    >
      <div className="w-[min(620px,88vw)] rounded border border-rose-500/30 bg-black/80 p-6 shadow-[0_0_80px_rgba(220,20,60,0.35)]">
        <div className="mb-5 flex items-center gap-3 font-['Orbitron'] text-sm uppercase tracking-[0.28em] text-rose-300">
          <Orbit className="h-5 w-5 animate-spin" /> booting titan core
        </div>
        <div className="space-y-3 font-mono text-sm text-zinc-300">
          {bootLines.map((line, index) => (
            <motion.div
              key={line}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.34 }}
              className="flex items-center justify-between border-b border-white/10 pb-2"
            >
              <span>{line}</span>
              <span className="text-rose-400">OK</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function Sidebar(props: {
  activeId?: string
  conversations: ReturnType<typeof useTitanStore.getState>['conversations']
  mode: ModeId
  search: string
  open: boolean
  onSearch: (value: string) => void
  onCreate: () => void
  onClear: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  return (
    <>
      <div className={`fixed inset-0 z-30 bg-black/70 md:hidden ${props.open ? 'block' : 'hidden'}`} onClick={props.onClose} />
      <aside
        className={`sidebar-shell fixed inset-y-0 left-0 z-40 w-[min(360px,90vw)] p-4 transition-transform duration-300 md:static md:translate-x-0 ${
          props.open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="sidebar-core mb-5 flex items-center justify-between">
          <div>
            <p className="font-['Orbitron'] text-sm uppercase tracking-[0.24em] text-rose-300">Krimson Titan</p>
            <p className="text-xs text-zinc-500">{modes[props.mode].function}</p>
          </div>
          <button className="icon-button md:hidden" onClick={props.onClose} aria-label="Close sidebar">
            <ChevronLeft size={18} />
          </button>
        </div>
        <button className="neon-button mb-4 w-full justify-center" onClick={props.onCreate}>
          <Plus size={16} /> New operation
        </button>
        <button className="sidebar-ghost-button mb-4" onClick={props.onClear}>
          <Trash2 size={15} /> Clear old failed chats
        </button>
        <label className="glass-input mb-4 flex items-center gap-2">
          <Search size={16} />
          <input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Search memory" />
        </label>
        <div className="sidebar-mode-card mb-4">
          <p className="text-xs uppercase tracking-[0.18em] text-rose-200">{modes[props.mode].name}</p>
          <p className="mt-2 text-sm text-zinc-300">{modes[props.mode].specialty}</p>
        </div>
        <div className="space-y-2 overflow-y-auto pr-1 md:max-h-[calc(100vh-190px)]">
          {props.conversations.map((conversation) => (
            <motion.div
              key={conversation.id}
              layout
              className={`sidebar-chat-card group ${
                conversation.id === props.activeId
                  ? 'active'
                  : ''
              }`}
            >
              <button className="w-full text-left" onClick={() => props.onSelect(conversation.id)}>
                <p className="truncate text-sm font-semibold text-white">{conversation.title}</p>
                <p className="mt-1 text-xs text-zinc-500">{conversation.messages.length} transmissions</p>
              </button>
              <button
                className="mt-2 flex items-center gap-1 text-xs text-zinc-500 opacity-0 transition hover:text-rose-300 group-hover:opacity-100"
                onClick={() => props.onDelete(conversation.id)}
              >
                <Trash2 size={12} /> Delete
              </button>
            </motion.div>
          ))}
        </div>
      </aside>
    </>
  )
}

function Topbar(props: {
  mode: ModeId
  view: ViewId
  voiceOutput: boolean
  userName: string
  aiLink: AiLink
  onMenu: () => void
  onMode: (mode: ModeId) => void
  onView: (view: ViewId) => void
  onVoice: () => void
  onLogout: () => void
}) {
  const views: { id: ViewId; icon: typeof Bot; label: string }[] = [
    { id: 'chat', icon: Bot, label: 'Chat' },
    { id: 'terminal', icon: TerminalSquare, label: 'Terminal' },
    { id: 'memory', icon: Brain, label: 'Memory' },
    { id: 'settings', icon: Settings, label: 'Settings' },
    { id: 'landing', icon: Sparkles, label: 'Showcase' },
  ]

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-black/45 px-3 py-3 backdrop-blur-2xl md:px-5">
      <div className="flex flex-wrap items-center gap-3">
        <button className="icon-button md:hidden" onClick={props.onMenu} aria-label="Open sidebar">
          <Menu size={18} />
        </button>
        <div className="mr-auto flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded border border-rose-400/40 bg-rose-500/10 shadow-[0_0_28px_rgba(220,20,60,0.35)]">
            <Cpu className="h-5 w-5 text-rose-300" />
          </div>
          <div>
            <p className="font-['Orbitron'] text-sm uppercase tracking-[0.2em] text-white">{modes[props.mode].name}</p>
            <p className="text-xs text-rose-200">{modes[props.mode].function}</p>
            <p className="text-xs text-zinc-500">
              {props.aiLink.hasKey && props.aiLink.openRouterReachable
                ? `live AI: ${props.aiLink.model}`
                : props.aiLink.hasKey
                  ? props.aiLink.networkError || 'key loaded, OpenRouter unreachable'
                  : 'local simulation until OpenRouter key is added'}
            </p>
          </div>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded border border-white/10 bg-white/[0.04] p-1">
          {views.map((item) => (
            <button
              key={item.id}
              className={`dock-button ${props.view === item.id ? 'active' : ''}`}
              onClick={() => props.onView(item.id)}
              title={item.label}
            >
              <item.icon size={16} />
            </button>
          ))}
        </div>
        <ModeSwitcher mode={props.mode} onMode={props.onMode} />
        <button className="icon-button" onClick={props.onVoice} title="Toggle voice output">
          {props.voiceOutput ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <div
          className={`hidden items-center gap-2 rounded border px-3 py-2 text-xs sm:flex ${
            props.aiLink.hasKey && props.aiLink.openRouterReachable
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
              : 'border-amber-400/30 bg-amber-500/10 text-amber-100'
          }`}
        >
          <Wifi size={14} />
          {props.aiLink.hasKey && props.aiLink.openRouterReachable ? 'Live AI' : props.aiLink.hasKey ? 'Blocked' : 'Needs key'}
        </div>
        <div className="hidden items-center gap-2 rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-300 sm:flex">
          <Lock size={14} className="text-rose-300" />
          <span className="max-w-28 truncate">{props.userName}</span>
        </div>
        <button className="icon-button" onClick={props.onLogout} title="Lock session">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}

function ModeSwitcher({ mode, onMode }: { mode: ModeId; onMode: (mode: ModeId) => void }) {
  const current = modes[mode]

  return (
    <div className="mode-switcher">
      <button className="mode-trigger" type="button" aria-label="AI mode selector">
        <span className="mode-orb" style={{ backgroundColor: current.aura }} />
        <span className="min-w-0">
          <span className="block truncate font-['Orbitron'] text-xs uppercase tracking-[0.16em]">{current.name}</span>
          <span className="block truncate text-[11px] text-zinc-400">{current.function}</span>
        </span>
      </button>
      <div className="mode-menu">
        {Object.entries(modes).map(([id, item]) => (
          <button
            key={id}
            className={`mode-option ${mode === id ? 'active' : ''}`}
            onClick={() => onMode(id as ModeId)}
            type="button"
          >
            <span className="mode-option-orb" style={{ backgroundColor: item.aura }} />
            <span className="min-w-0 flex-1 text-left">
              <span className="block font-['Orbitron'] text-xs uppercase tracking-[0.14em] text-white">{item.name}</span>
              <span className="mt-1 block text-xs text-zinc-400">{item.function}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ChatView(props: {
  messages: Message[]
  input: string
  imageName: string
  imagePreview?: string
  isThinking: boolean
  isListening: boolean
  mode: ModeId
  scrollRef: RefObject<HTMLDivElement | null>
  onInput: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onImage: (file?: File) => void | Promise<void>
  onRemoveImage: () => void
  onMic: () => void
  onStopVoice: () => void
  onRegenerate: () => void
  onShare: () => void
  onQuick: (value: string) => void
}) {
  const quickPrompts = quickPromptsByMode[props.mode]

  return (
    <motion.section className="grid flex-1 grid-rows-[1fr_auto]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div ref={props.scrollRef} className="overflow-y-auto px-3 py-5 md:px-6">
        <div className="mx-auto grid max-w-5xl gap-5">
          {props.messages.length === 0 && (
            <div className="grid min-h-[45vh] place-items-center text-center">
              <div>
                <VoiceOrb active={props.isListening || props.isThinking} mode={props.mode} />
                <h1 className="mt-6 font-['Orbitron'] text-3xl uppercase tracking-[0.16em] md:text-5xl">Awaiting command</h1>
                <p className="mx-auto mt-3 max-w-xl text-zinc-400">
                  Start a new operation with chat, voice, image analysis, or terminal diagnostics.
                </p>
              </div>
            </div>
          )}
          {props.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {props.isThinking && <TypingIndicator />}
        </div>
      </div>

      <div className="border-t border-white/10 bg-black/55 p-3 backdrop-blur-2xl md:p-5">
        <div className="mx-auto max-w-5xl">
          <div className="mb-3 flex gap-2 overflow-x-auto">
            {quickPrompts.map((prompt) => (
              <button key={prompt} className="quick-chip" onClick={() => void props.onQuick(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
          {props.imagePreview && (
            <div className="mb-3 flex items-center gap-3 rounded border border-rose-400/30 bg-rose-500/10 p-2">
              <img src={props.imagePreview} alt="" className="h-14 w-14 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{props.imageName}</p>
                <p className="text-xs text-zinc-500">Ready for image explanation</p>
              </div>
              <button className="icon-button" onClick={props.onRemoveImage} aria-label="Remove image">
                <X size={16} />
              </button>
            </div>
          )}
          <form className="glass-composer" onSubmit={props.onSubmit}>
            <label className="icon-button cursor-pointer" title="Upload image">
              <ImagePlus size={18} />
              <input className="hidden" type="file" accept="image/*" onChange={(event) => void props.onImage(event.target.files?.[0])} />
            </label>
            <textarea
              value={props.input}
              onChange={(event) => props.onInput(event.target.value)}
              placeholder="Transmit to TITAN..."
              rows={1}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
            />
            <button type="button" className={`icon-button ${props.isListening ? 'active' : ''}`} onClick={props.onMic} title="Voice input">
              <Mic size={18} />
            </button>
            <button type="button" className="icon-button" onClick={props.onStopVoice} title="Interrupt speech">
              <CircleStop size={18} />
            </button>
            <button type="button" className="icon-button" onClick={() => void props.onRegenerate()} title="Regenerate">
              <RefreshCcw size={18} />
            </button>
            <button type="button" className="icon-button" onClick={() => void props.onShare()} title="Share chat">
              <Share2 size={18} />
            </button>
            <button className="neon-button" type="submit">
              <Send size={16} /> Send
            </button>
          </form>
        </div>
      </div>
    </motion.section>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <motion.article
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
        <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
          <span>{isUser ? 'Operator' : 'Titan response'}</span>
          <button className="transition hover:text-rose-300" onClick={() => void navigator.clipboard.writeText(message.content)}>
            <Copy size={14} />
          </button>
        </div>
        {message.image && <img src={message.image} alt="" className="mb-3 max-h-64 rounded border border-white/10 object-contain" />}
        <ReactMarkdown
          components={{
            code({ className, children, ...rest }) {
              const match = /language-(\w+)/.exec(className || '')
              return match ? (
                <CodeBlock language={match[1]} code={String(children).replace(/\n$/, '')} />
              ) : (
                <code className={className} {...rest}>
                  {children}
                </code>
              )
            },
          }}
        >
          {message.content || '...'}
        </ReactMarkdown>
      </div>
    </motion.article>
  )
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const tokens = code.split(/(\b(?:const|let|function|return|async|await|import|from|type|class|new|if|else|for|while|console|log)\b|'.*?'|".*?"|`.*?`|\d+)/g)

  return (
    <pre className="code-block">
      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2 text-xs uppercase tracking-[0.18em] text-rose-300">
        <span>{language}</span>
        <span>syntax</span>
      </div>
      <code>
        {tokens.map((token, index) => {
          const keyword = /^(const|let|function|return|async|await|import|from|type|class|new|if|else|for|while|console|log)$/.test(token)
          const literal = /^(['"`]).*\1$|\d+/.test(token)
          return (
            <span key={`${token}-${index}`} className={keyword ? 'code-keyword' : literal ? 'code-literal' : undefined}>
              {token}
            </span>
          )
        })}
      </code>
    </pre>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 text-sm text-rose-300">
      <span className="h-2 w-2 animate-ping rounded-full bg-rose-400" />
      TITAN is synthesizing
    </div>
  )
}

function VoiceOrb({ active, mode }: { active: boolean; mode: ModeId }) {
  return (
    <motion.div
      className="mx-auto grid h-40 w-40 place-items-center rounded-full border border-rose-300/40 bg-black shadow-[0_0_90px_rgba(220,20,60,0.45)]"
      animate={{ scale: active ? [1, 1.08, 1] : 1, boxShadow: `0 0 ${active ? 110 : 70}px ${modes[mode].aura}` }}
      transition={{ duration: 1.4, repeat: active ? Infinity : 0 }}
    >
      <Radar className="h-16 w-16 text-rose-300" />
    </motion.div>
  )
}

function TerminalView() {
  const logs = [
    'boot --sequence krimson-v6',
    'scan /memory/persistent',
    'diagnostics --cpu 42% --neural-cache 68%',
    'voice.orb status: listening-capable',
    'security layer: localStorage persistence',
    'openrouter: proxy ready',
  ]

  return (
    <motion.section className="flex-1 overflow-y-auto p-4 md:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_340px]">
        <div className="terminal-panel min-h-[62vh]">
          <div className="mb-4 flex items-center gap-2 text-rose-300">
            <TerminalSquare size={18} /> TITAN TERMINAL
          </div>
          <div className="space-y-3 font-mono text-sm">
            {logs.map((log, index) => (
              <motion.p key={log} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.18 }}>
                <span className="text-rose-400">root@titan:</span> {log}
              </motion.p>
            ))}
            <p className="text-zinc-500">_ awaiting next diagnostic command</p>
          </div>
        </div>
        <div className="grid gap-4">
          {['CPU flux', 'Memory lattice', 'Voice waveform', 'Particle engine'].map((label, index) => (
            <div key={label} className="glass-card">
              <div className="mb-2 flex justify-between text-sm">
                <span>{label}</span>
                <span className="text-rose-300">{52 + index * 11}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-white/10">
                <motion.div
                  className="h-full bg-rose-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${52 + index * 11}%` }}
                  transition={{ duration: 1.2, delay: index * 0.12 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  )
}

function MemoryView({ memories }: { memories: ReturnType<typeof useTitanStore.getState>['memories'] }) {
  return (
    <motion.section className="flex-1 overflow-y-auto p-4 md:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mx-auto max-w-6xl">
        <h2 className="font-['Orbitron'] text-3xl uppercase tracking-[0.14em]">Memory lattice</h2>
        <p className="mt-2 text-zinc-400">Persistent localStorage memory, recent activity, and preference traces.</p>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {memories.map((memory) => (
            <div key={memory.id} className="glass-card">
              <p className="text-sm uppercase tracking-[0.18em] text-rose-300">{memory.label}</p>
              <p className="mt-3 text-zinc-200">{memory.value}</p>
              <p className="mt-4 text-xs text-zinc-500">{new Date(memory.updatedAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  )
}

function SettingsView({
  onClear,
  onSettings,
  onVoiceOutput,
  settings,
  voiceOutput,
}: {
  onClear: () => void
  onSettings: (settings: Partial<TitanSettings>) => void
  onVoiceOutput: (enabled: boolean) => void
  settings: TitanSettings
  voiceOutput: boolean
}) {
  return (
    <motion.section className="flex-1 overflow-y-auto p-4 md:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-['Orbitron'] text-sm uppercase tracking-[0.28em] text-rose-300">
              <SlidersHorizontal size={16} /> Control matrix
            </p>
            <h2 className="mt-2 font-['Orbitron'] text-3xl uppercase tracking-[0.12em]">Settings</h2>
          </div>
          <button className="neon-button" onClick={onClear}>
            <Trash2 size={16} /> Clear chats
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SettingCard
            title="Simple Answers"
            description="Keeps all modes shorter, clearer, and less wordy."
            enabled={settings.simpleAnswers}
            onToggle={(enabled) => onSettings({ simpleAnswers: enabled })}
          />
          <SettingCard
            title="Voice Output"
            description="Reads assistant replies aloud with browser speech."
            enabled={voiceOutput}
            onToggle={onVoiceOutput}
          />
          <SettingCard
            title="Animations"
            description="Controls glow pulses and ambient motion."
            enabled={settings.animations}
            onToggle={(enabled) => onSettings({ animations: enabled })}
          />
          <SettingCard
            title="Crimson Particles"
            description="Turns the background particle field on or off."
            enabled={settings.particles}
            onToggle={(enabled) => onSettings({ particles: enabled })}
          />
          <SettingCard
            title="Boot Sequence"
            description="Shows the startup sequence when the app initializes."
            enabled={settings.bootSequence}
            onToggle={(enabled) => onSettings({ bootSequence: enabled })}
          />
          <SettingCard
            title="Compact Mode"
            description="Tightens panels and conversation density."
            enabled={settings.compactMode}
            onToggle={(enabled) => onSettings({ compactMode: enabled })}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <RangeCard
            title="Image Quality"
            value={settings.imageQuality}
            min={0.45}
            max={0.95}
            step={0.05}
            display={`${Math.round(settings.imageQuality * 100)}%`}
            description="Higher quality improves image analysis but sends larger payloads."
            onChange={(value) => onSettings({ imageQuality: value })}
          />
          <RangeCard
            title="Voice Rate"
            value={settings.voiceRate}
            min={0.65}
            max={1.25}
            step={0.05}
            display={`${settings.voiceRate.toFixed(2)}x`}
            description="Controls speech synthesis speed."
            onChange={(value) => onSettings({ voiceRate: value })}
          />
          <RangeCard
            title="Context Memory"
            value={settings.maxContext}
            min={4}
            max={18}
            step={1}
            display={`${settings.maxContext} messages`}
            description="How much recent chat context is sent to the AI."
            onChange={(value) => onSettings({ maxContext: Math.round(value) })}
          />
        </div>
      </div>
    </motion.section>
  )
}

function SettingCard({
  description,
  enabled,
  onToggle,
  title,
}: {
  description: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  title: string
}) {
  return (
    <div className="settings-card">
      <div>
        <p className="font-['Orbitron'] text-sm uppercase tracking-[0.16em] text-white">{title}</p>
        <p className="mt-2 text-sm text-zinc-400">{description}</p>
      </div>
      <button className={`toggle-switch ${enabled ? 'enabled' : ''}`} onClick={() => onToggle(!enabled)} aria-pressed={enabled}>
        <span />
      </button>
    </div>
  )
}

function RangeCard({
  description,
  display,
  max,
  min,
  onChange,
  step,
  title,
  value,
}: {
  description: string
  display: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  title: string
  value: number
}) {
  return (
    <div className="settings-card block">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-['Orbitron'] text-sm uppercase tracking-[0.16em] text-white">{title}</p>
        <span className="rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-100">{display}</span>
      </div>
      <input
        className="w-full accent-rose-500"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <p className="mt-3 text-sm text-zinc-400">{description}</p>
    </div>
  )
}

function LandingView({ aiLink, onStart }: { aiLink: AiLink; onStart: () => void }) {
  return (
    <motion.section className="flex-1 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mx-auto grid min-h-[calc(100vh-72px)] max-w-7xl content-center gap-10 px-4 py-10 md:px-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="font-['Orbitron'] text-sm uppercase tracking-[0.32em] text-rose-300">KRIMSON TITAN V6</p>
          <h1 className="mt-4 max-w-4xl font-['Orbitron'] text-4xl uppercase leading-tight tracking-[0.08em] md:text-7xl">
            Dark futuristic AI consciousness interface
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-zinc-300">
            Chat, voice, image intake, terminal diagnostics, cinematic particles, and persistent local memory in one responsive AI OS shell.
          </p>
          <div className="mt-5 inline-flex rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-300">
            AI status:{' '}
            {aiLink.hasKey && aiLink.openRouterReachable
              ? `Live on ${aiLink.model}`
              : aiLink.hasKey
                ? aiLink.networkError || 'OpenRouter unreachable'
                : 'waiting for OPENROUTER_API_KEY'}
          </div>
          <button className="neon-button mt-8" onClick={onStart}>
            <Zap size={18} /> Enter system
          </button>
        </div>
        <div className="grid place-items-center">
          <div className="relative h-[360px] w-[min(360px,86vw)]">
            <VoiceOrb active mode="krimson" />
            <div className="absolute inset-8 animate-spin rounded-full border border-dashed border-rose-400/30" />
            <div className="absolute inset-16 animate-pulse rounded-full border border-rose-300/40" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 px-4 pb-10 md:grid-cols-3 md:px-8">
        {[
          ['Streaming chat', 'Markdown, code blocks, copy, regenerate, and local fallback intelligence.'],
          ['Voice AI', 'SpeechRecognition input, SpeechSynthesis output, animated waveform orb.'],
          ['Memory OS', 'Zustand persistence, timeline traces, preferences, and searchable history.'],
        ].map(([title, text]) => (
          <div key={title} className="glass-card">
            <Monitor className="mb-4 text-rose-300" />
            <h3 className="font-['Orbitron'] uppercase tracking-[0.12em]">{title}</h3>
            <p className="mt-3 text-sm text-zinc-400">{text}</p>
          </div>
        ))}
      </div>
      <div className="px-4 pb-12 md:px-8">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {Object.entries(modes).map(([id, item]) => (
            <div key={id} className="glass-card">
              <p className="font-['Orbitron'] text-sm uppercase tracking-[0.18em] text-rose-300">{item.name}</p>
              <p className="mt-3 text-sm font-semibold text-white">{item.function}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">{item.specialty}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  )
}

export default App
