'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#0b0e16] flex items-center justify-center p-4" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'linear-gradient(135deg, #f59e0b, #22c55e)', boxShadow: '0 0 12px rgba(245,158,11,0.6)' }} />
            <span className="text-xl font-bold tracking-tight text-[#e8ecf2]">TradeForge</span>
          </div>
          <p className="text-sm text-[#6d7589]">Sign in to your account</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-[#a4abbe] mb-1.5">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-[#11151f] border border-[#232a3a] px-3 py-2.5 text-sm text-[#e8ecf2] placeholder-[#4a5266] focus:outline-none focus:border-[#2f384c]"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a4abbe] mb-1.5">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-[#11151f] border border-[#232a3a] px-3 py-2.5 text-sm text-[#e8ecf2] placeholder-[#4a5266] focus:outline-none focus:border-[#2f384c]"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-[#ef4444] bg-[rgba(239,68,68,0.1)] rounded px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#f59e0b] hover:bg-[#d97706] disabled:opacity-50 disabled:cursor-not-allowed py-2.5 text-sm font-semibold text-black transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
