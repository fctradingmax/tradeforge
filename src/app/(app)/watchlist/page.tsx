'use client'

import { useState, useEffect, useCallback } from 'react'

interface WatchlistEntry {
  id: string
  symbol: string
  estrategia: string | null
  notes_html: string | null
  roic: number | null
  float_shares: number | null
  short_interest: number | null
  institutional_ownership: number | null
  operating_cash_flow: number | null
  last_refreshed: string | null
}

function fmtPct(n: number | null) {
  if (n == null) return '—'
  return (n * 100).toFixed(1) + '%'
}

function fmtM(n: number | null) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  return n.toLocaleString()
}

export default function WatchlistPage() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [symbol, setSymbol] = useState('')
  const [catalyst, setCatalyst] = useState('')
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/watchlist')
    if (res.ok) setEntries(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function addTicker(e: React.FormEvent) {
    e.preventDefault()
    if (!symbol.trim()) return
    setAdding(true)
    setError('')
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: symbol.trim().toUpperCase(), estrategia: catalyst.trim() || null }),
    })
    if (res.ok) {
      setSymbol('')
      setCatalyst('')
      setShowForm(false)
      await load()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Failed to add ticker')
    }
    setAdding(false)
  }

  async function removeTicker(id: string) {
    await fetch(`/api/watchlist/${id}`, { method: 'DELETE' })
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  async function refreshTicker(id: string) {
    setRefreshingId(id)
    setRefreshError('')
    const res = await fetch(`/api/watchlist/${id}/refresh`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setEntries((prev) => prev.map((e) => e.id === id ? data : e))
    } else {
      setRefreshError(data.error ?? 'Refresh failed')
    }
    setRefreshingId(null)
  }

  return (
    <div className="p-8 text-[#e8ecf2]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Watchlist</h1>
          <p className="text-sm text-[#6d7589] mt-0.5">{entries.length} {entries.length === 1 ? 'ticker' : 'tickers'}</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 rounded-md bg-[#f59e0b] text-[#0b0e16] text-sm font-semibold hover:bg-[#d97706] transition-colors"
        >
          + Add Ticker
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={addTicker} className="rounded-lg bg-[#11151f] border border-[#232a3a] p-5 mb-6 flex flex-col gap-3">
          <p className="text-sm font-semibold text-[#a4abbe]">Add to Watchlist</p>
          <div className="flex gap-3 flex-wrap">
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Ticker (e.g. AAPL)"
              className="flex-1 min-w-[120px] bg-[#0b0e16] border border-[#232a3a] rounded-md px-3 py-2 text-sm text-[#e8ecf2] placeholder-[#4a5266] focus:outline-none focus:border-[#f59e0b]"
              required
            />
            <input
              value={catalyst}
              onChange={(e) => setCatalyst(e.target.value)}
              placeholder="Catalyst / Strategy (optional)"
              className="flex-[2] min-w-[200px] bg-[#0b0e16] border border-[#232a3a] rounded-md px-3 py-2 text-sm text-[#e8ecf2] placeholder-[#4a5266] focus:outline-none focus:border-[#f59e0b]"
            />
            <button
              type="submit"
              disabled={adding}
              className="px-5 py-2 rounded-md bg-[#f59e0b] text-[#0b0e16] text-sm font-semibold hover:bg-[#d97706] disabled:opacity-50 transition-colors"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-md text-sm text-[#6d7589] hover:text-[#a4abbe] transition-colors"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-xs text-[#ef4444]">{error}</p>}
        </form>
      )}

      {loading ? (
        <div className="text-center py-16 text-[#4a5266] text-sm">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg bg-[#11151f] border border-[#232a3a] p-12 text-center text-[#4a5266]">
          <p className="text-sm">No watchlist entries yet.</p>
          <p className="text-xs mt-1">Click <strong className="text-[#6d7589]">+ Add Ticker</strong> to track a stock.</p>
        </div>
      ) : (
        <>
        {refreshError && (
          <div className="mb-4 rounded-md bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] px-4 py-2 text-xs text-[#ef4444]">
            {refreshError}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((w) => (
            <div key={w.id} className="rounded-lg bg-[#11151f] border border-[#232a3a] p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xl font-bold tracking-tight">{w.symbol}</p>
                  {w.estrategia && (
                    <p className="text-xs text-[#f59e0b] mt-0.5">{w.estrategia}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {w.last_refreshed && (
                    <span className="text-[10px] text-[#4a5266]">
                      {new Date(w.last_refreshed).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    onClick={() => refreshTicker(w.id)}
                    disabled={refreshingId === w.id}
                    className="text-[#4a5266] hover:text-[#f59e0b] text-xs transition-colors disabled:opacity-50"
                    title="Refresh fundamentals from Yahoo Finance"
                  >
                    {refreshingId === w.id ? '…' : '↻'}
                  </button>
                  <button
                    onClick={() => removeTicker(w.id)}
                    className="text-[#4a5266] hover:text-[#ef4444] text-xs transition-colors"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#4a5266]">ROIC</span>
                  <span className="font-mono text-[#a4abbe]">{fmtPct(w.roic)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#4a5266]">Float</span>
                  <span className="font-mono text-[#a4abbe]">{fmtM(w.float_shares)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#4a5266]">Short %</span>
                  <span className="font-mono text-[#a4abbe]">{fmtPct(w.short_interest)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#4a5266]">Inst. Own</span>
                  <span className="font-mono text-[#a4abbe]">{fmtPct(w.institutional_ownership)}</span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span className="text-[#4a5266]">Op. Cash Flow</span>
                  <span className="font-mono text-[#a4abbe]">{fmtM(w.operating_cash_flow)}</span>
                </div>
              </div>

              {w.notes_html && (
                <div
                  className="text-xs text-[#6d7589] border-t border-[#1a1f2e] pt-2 line-clamp-3"
                  dangerouslySetInnerHTML={{ __html: w.notes_html }}
                />
              )}
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  )
}
