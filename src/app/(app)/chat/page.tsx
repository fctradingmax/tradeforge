'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface ToolCall {
  id: string
  name: string
  input: unknown
  result?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCall[]
  pending?: boolean
}

interface Conversation {
  id: string
  title: string
}

function ToolCallBlock({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false)
  const prettyInput = JSON.stringify(call.input, null, 2)
  const prettyResult = call.result
    ? (() => { try { return JSON.stringify(JSON.parse(call.result), null, 2) } catch { return call.result } })()
    : null

  return (
    <div className="my-1 rounded border border-[#232a3a] bg-[#11151f] text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[#a4abbe] hover:text-[#e8ecf2]"
      >
        <span className="font-mono text-[#f59e0b]">⚙ {call.name}</span>
        <span className="ml-auto">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-[#232a3a] px-3 py-2 space-y-2">
          <div>
            <p className="text-[#6d7589] mb-1">Input</p>
            <pre className="overflow-x-auto text-[#a4abbe]">{prettyInput}</pre>
          </div>
          {prettyResult && (
            <div>
              <p className="text-[#6d7589] mb-1">Result</p>
              <pre className="overflow-x-auto text-[#22c55e] max-h-48 overflow-y-auto">{prettyResult}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : 'order-1'}`}>
        {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="mb-2">
            {msg.toolCalls.map((tc) => <ToolCallBlock key={tc.id} call={tc} />)}
          </div>
        )}
        {(msg.text || msg.pending) && (
          <div
            className={`rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
              isUser
                ? 'bg-[#1e2434] text-[#e8ecf2]'
                : 'bg-[#161b28] text-[#e8ecf2] border border-[#232a3a]'
            }`}
          >
            {msg.text || <span className="text-[#6d7589] animate-pulse">Thinking…</span>}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => { scrollToBottom() }, [messages])

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/conversations')
      if (res.ok) setConversations(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  const startNewConversation = () => {
    setActiveConvId(null)
    setMessages([])
  }

  const loadConversation = async (id: string) => {
    setActiveConvId(id)
    try {
      const res = await fetch(`/api/agent/conversations/${id}/messages`)
      if (res.ok) {
        const data = await res.json()
        const msgs: Message[] = data.map((m: { role: string; content: string; tool_calls?: ToolCall[]; id: string }) => ({
          id: m.id,
          role: m.role === 'tool' ? 'assistant' : m.role,
          text: m.role === 'tool' ? '' : (m.content ?? ''),
          toolCalls: m.tool_calls ?? undefined,
        })).filter((m: Message) => m.role === 'user' || m.role === 'assistant')
        setMessages(msgs)
      }
    } catch { /* ignore */ }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setLoading(true)

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text }
    const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', text: '', toolCalls: [], pending: true }
    setMessages((prev) => [...prev, userMsg, assistantMsg])

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversation_id: activeConvId }),
      })

      if (!res.ok || !res.body) throw new Error(await res.text())

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7)
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))

            if (eventType === 'meta' && data.conversation_id) {
              setActiveConvId(data.conversation_id)
            } else if (eventType === 'text') {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, text: last.text + data.text, pending: false }
                }
                return updated
              })
            } else if (eventType === 'tool_call') {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    toolCalls: [...(last.toolCalls ?? []), { id: data.id, name: data.name, input: data.input }],
                    pending: false,
                  }
                }
                return updated
              })
            } else if (eventType === 'tool_result') {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last.role === 'assistant' && last.toolCalls) {
                  const toolCalls = last.toolCalls.map((tc) =>
                    tc.id === data.id ? { ...tc, result: data.result } : tc,
                  )
                  updated[updated.length - 1] = { ...last, toolCalls }
                }
                return updated
              })
            } else if (eventType === 'done') {
              await loadConversations()
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last.role === 'assistant') {
          updated[updated.length - 1] = { ...last, text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`, pending: false }
        }
        return updated
      })
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex h-screen bg-[#0b0e16] text-[#e8ecf2]" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-[#232a3a] bg-[#11151f] flex flex-col">
        <div className="p-4 border-b border-[#232a3a]">
          <button
            onClick={startNewConversation}
            className="w-full rounded-md bg-[#1e2434] hover:bg-[#232a3a] px-3 py-2 text-sm text-left text-[#a4abbe] hover:text-[#e8ecf2] transition-colors"
          >
            + New conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => loadConversation(c.id)}
              className={`w-full px-4 py-2 text-left text-xs truncate transition-colors ${
                activeConvId === c.id
                  ? 'bg-[#1e2434] text-[#e8ecf2]'
                  : 'text-[#6d7589] hover:text-[#a4abbe] hover:bg-[#161b28]'
              }`}
            >
              {c.title || 'Untitled'}
            </button>
          ))}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="px-6 py-4 border-b border-[#232a3a] flex items-center gap-3">
          <span className="text-lg font-semibold tracking-tight">TradeForge AI</span>
          <span className="text-xs text-[#6d7589]">claude-sonnet-4-6 · tool-use</span>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-[#6d7589] gap-3">
              <p className="text-base">Ask about your trades, watchlist, or SEC filings.</p>
              <div className="text-xs space-y-1">
                <p>"What's my win rate this week?"</p>
                <p>"Show recent filings for NIVF"</p>
                <p>"Run a Monte Carlo on my last 30 trades"</p>
              </div>
            </div>
          )}
          {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-[#232a3a]">
          <div className="flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Ask anything about your trades or watchlist… (Enter to send, Shift+Enter for newline)"
              className="flex-1 resize-none rounded-lg bg-[#161b28] border border-[#232a3a] px-4 py-3 text-sm text-[#e8ecf2] placeholder-[#4a5266] focus:outline-none focus:border-[#2f384c] leading-relaxed"
              style={{ minHeight: '48px', maxHeight: '160px' }}
              onInput={(e) => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = `${t.scrollHeight}px`
              }}
              disabled={loading}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="shrink-0 rounded-lg bg-[#f59e0b] hover:bg-[#d97706] disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold text-black transition-colors"
            >
              {loading ? '…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
