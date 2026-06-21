'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'

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

interface LiveQuote {
  price: number | null
  change: number | null
  changePct: number | null
  volume: number | null
  marketCap: number | null
  high52: number | null
  low52: number | null
  shortName: string | null
}

interface SparkPoint { d: string; c: number }

function fmtPct(n: number | null) {
  if (n == null) return '—'
  return (n * 100).toFixed(1) + '%'
}
function fmtM(n: number | null) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  return n.toLocaleString('en-US')
}

function Sparkline({ id }: { id: string }) {
  const [data, setData] = useState<SparkPoint[]>([])

  useEffect(() => {
    fetch(`/api/watchlist/${id}/sparkline`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setData(d) })
      .catch(() => {})
  }, [id])

  if (!data.length) {
    return <div className="w-[120px] h-[52px] flex items-center justify-center text-[10px] text-[#2f384c]">…</div>
  }

  const first = data[0]?.c ?? 0
  const last  = data[data.length - 1]?.c ?? 0
  const color = last >= first ? '#22c55e' : '#ef4444'

  return (
    <div className="w-[120px] h-[52px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={`sg-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="c" stroke={color} strokeWidth={1.5} fill={`url(#sg-${id})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function WatchlistCard({
  entry,
  quote,
  onRefresh,
  onRemove,
  refreshing,
}: {
  entry: WatchlistEntry
  quote: LiveQuote | null
  onRefresh: () => void
  onRemove: () => void
  refreshing: boolean
}) {
  const router = useRouter()
  const isUp    = (quote?.change ?? 0) >= 0
  const priceClr = isUp ? 'text-[#22c55e]' : 'text-[#ef4444]'
  const borderClr = isUp ? 'border-[rgba(34,197,94,0.15)]' : 'border-[rgba(239,68,68,0.15)]'

  const pctDisplay = quote?.changePct != null
    ? `${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%`
    : null

  const rangePct = (quote?.high52 && quote?.low52 && quote?.price)
    ? ((quote.price - quote.low52) / (quote.high52 - quote.low52)) * 100
    : null

  return (
    <div className={`rounded-xl bg-[#11151f] border ${quote ? borderClr : 'border-[#232a3a]'} p-4 flex flex-col gap-3 hover:border-[#2f384c] transition-colors`}>
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => router.push(`/watchlist/${entry.symbol}`)}
            className="text-[18px] font-bold tracking-tight hover:text-[#f59e0b] transition-colors"
          >
            {entry.symbol}
          </button>
          {entry.estrategia && (
            <p className="text-[10px] text-[#f59e0b] mt-0.5">{entry.estrategia}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {entry.last_refreshed && (
            <span className="text-[9px] text-[#2f384c]">
              {new Date(entry.last_refreshed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="text-[#4a5266] hover:text-[#f59e0b] text-sm transition-colors disabled:opacity-50"
            title="Refresh fundamentals"
          >
            {refreshing ? '…' : '↻'}
          </button>
          <button
            onClick={() => router.push(`/watchlist/${entry.symbol}`)}
            className="text-[#4a5266] hover:text-[#a4abbe] text-xs transition-colors"
            title="Ver detalle"
          >
            ↗
          </button>
          <button
            onClick={onRemove}
            className="text-[#4a5266] hover:text-[#ef4444] text-xs transition-colors"
            title="Eliminar"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Price + sparkline */}
      <div className="flex items-center justify-between">
        <div>
          {quote?.price != null ? (
            <>
              <div className={`text-[22px] font-bold font-mono leading-none ${priceClr}`}>
                ${quote.price.toFixed(2)}
              </div>
              <div className={`text-[11px] font-mono mt-0.5 ${priceClr}`}>
                {quote.change != null && (quote.change >= 0 ? '+' : '')}{quote.change?.toFixed(2)} {pctDisplay && `(${pctDisplay})`}
              </div>
            </>
          ) : (
            <div className="text-[#4a5266] text-sm">Cargando…</div>
          )}
          {quote?.marketCap != null && (
            <div className="text-[10px] text-[#4a5266] mt-1 font-mono">Mkt Cap: {fmtM(quote.marketCap)}</div>
          )}
        </div>
        <Sparkline id={entry.id} />
      </div>

      {/* 52-week range bar */}
      {rangePct != null && (
        <div>
          <div className="flex justify-between text-[9px] text-[#4a5266] font-mono mb-1">
            <span>${quote!.low52?.toFixed(2)}</span>
            <span>52W</span>
            <span>${quote!.high52?.toFixed(2)}</span>
          </div>
          <div className="h-1 bg-[#1a1f2e] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-[#f59e0b]"
              style={{ width: `${Math.max(2, Math.min(98, rangePct))}%` }}
            />
          </div>
        </div>
      )}

      {/* Fundamentals grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] border-t border-[#1a1f2e] pt-2">
        <div className="flex justify-between">
          <span className="text-[#4a5266]">ROIC</span>
          <span className="font-mono text-[#a4abbe]">{fmtPct(entry.roic)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#4a5266]">Float</span>
          <span className="font-mono text-[#a4abbe]">{fmtM(entry.float_shares)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#4a5266]">Short %</span>
          <span className="font-mono text-[#a4abbe]">{fmtPct(entry.short_interest)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#4a5266]">Inst. Own</span>
          <span className="font-mono text-[#a4abbe]">{fmtPct(entry.institutional_ownership)}</span>
        </div>
        <div className="flex justify-between col-span-2">
          <span className="text-[#4a5266]">Op. Cash Flow</span>
          <span className="font-mono text-[#a4abbe]">{fmtM(entry.operating_cash_flow)}</span>
        </div>
      </div>

      {entry.notes_html && (
        <div
          className="text-[10px] text-[#4a5266] border-t border-[#1a1f2e] pt-2 line-clamp-2"
          dangerouslySetInnerHTML={{ __html: entry.notes_html }}
        />
      )}
    </div>
  )
}

export default function WatchlistPage() {
  const [entries, setEntries]       = useState<WatchlistEntry[]>([])
  const [quotes, setQuotes]         = useState<Record<string, LiveQuote>>({})
  const [loading, setLoading]       = useState(true)
  const [symbol, setSymbol]         = useState('')
  const [catalyst, setCatalyst]     = useState('')
  const [adding, setAdding]         = useState(false)
  const [showForm, setShowForm]     = useState(false)
  const [error, setError]           = useState('')
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/watchlist')
    if (res.ok) {
      const data: WatchlistEntry[] = await res.json()
      setEntries(data)
      // Batch-fetch live quotes
      if (data.length) {
        const symbols = data.map(e => e.symbol).join(',')
        fetch(`/api/watchlist/quotes?symbols=${symbols}`)
          .then(r => r.json())
          .then(q => { if (q && typeof q === 'object') setQuotes(q) })
          .catch(() => {})
      }
    }
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
      setSymbol(''); setCatalyst(''); setShowForm(false)
      await load()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Failed to add ticker')
    }
    setAdding(false)
  }

  async function removeTicker(id: string) {
    await fetch(`/api/watchlist/${id}`, { method: 'DELETE' })
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  async function refreshTicker(id: string) {
    setRefreshingId(id)
    setRefreshError('')
    const res = await fetch(`/api/watchlist/${id}/refresh`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) setEntries(prev => prev.map(e => e.id === id ? data : e))
    else setRefreshError(data.error ?? 'Refresh failed')
    setRefreshingId(null)
  }

  return (
    <div className="p-6 text-[#e8ecf2]" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Watchlist</h1>
          <p className="text-[11px] text-[#6d7589] mt-0.5">{entries.length} {entries.length === 1 ? 'ticker' : 'tickers'}</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 rounded-md bg-[#f59e0b] text-[#0b0e16] text-sm font-semibold hover:bg-[#d97706] transition-colors"
        >
          + Agregar
        </button>
      </div>

      {showForm && (
        <form onSubmit={addTicker} className="rounded-xl bg-[#11151f] border border-[#232a3a] p-5 mb-5 flex flex-col gap-3">
          <p className="text-[11px] font-semibold text-[#a4abbe]">Agregar ticker</p>
          <div className="flex gap-3 flex-wrap">
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="Ticker (ej. AAPL)"
              className="flex-1 min-w-[120px] bg-[#0b0e16] border border-[#232a3a] rounded-md px-3 py-2 text-sm text-[#e8ecf2] placeholder-[#4a5266] focus:outline-none focus:border-[#f59e0b]"
              required
            />
            <input
              value={catalyst}
              onChange={e => setCatalyst(e.target.value)}
              placeholder="Catalyst / Estrategia (opcional)"
              className="flex-[2] min-w-[200px] bg-[#0b0e16] border border-[#232a3a] rounded-md px-3 py-2 text-sm text-[#e8ecf2] placeholder-[#4a5266] focus:outline-none focus:border-[#f59e0b]"
            />
            <button
              type="submit"
              disabled={adding}
              className="px-5 py-2 rounded-md bg-[#f59e0b] text-[#0b0e16] text-sm font-semibold hover:bg-[#d97706] disabled:opacity-50 transition-colors"
            >
              {adding ? 'Agregando…' : 'Agregar'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-md text-sm text-[#6d7589] hover:text-[#a4abbe] transition-colors"
            >
              Cancelar
            </button>
          </div>
          {error && <p className="text-xs text-[#ef4444]">{error}</p>}
        </form>
      )}

      {refreshError && (
        <div className="mb-4 rounded-md bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] px-4 py-2 text-xs text-[#ef4444]">
          {refreshError}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-[#4a5266] text-sm">Cargando…</div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl bg-[#11151f] border border-[#232a3a] p-12 text-center text-[#4a5266]">
          <p className="text-sm">No hay tickers en el watchlist.</p>
          <p className="text-xs mt-1">Haz clic en <strong className="text-[#6d7589]">+ Agregar</strong> para comenzar.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map(w => (
            <WatchlistCard
              key={w.id}
              entry={w}
              quote={quotes[w.symbol] ?? null}
              onRefresh={() => refreshTicker(w.id)}
              onRemove={() => removeTicker(w.id)}
              refreshing={refreshingId === w.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
