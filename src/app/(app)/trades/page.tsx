'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import TradeModal from '@/components/TradeModal'

interface Trade {
  id: string
  symbol: string
  date: string | null
  open_time: string | null
  close_time: string | null
  open_side: 'B' | 'S' | null
  avg_buy: number | null
  avg_sell: number | null
  buy_qty: number | null
  sell_qty: number | null
  max_size: number | null
  n_fills: number | null
  holding_sec: number | null
  gross: number
  fees: number
  net_pnl: number
  mae: number | null
  mfe: number | null
  setup: string | null
  quality: string | null
  emotion: string | null
  tags: string[] | null
  notes: string | null
  lessons: string | null
}

function m(v: number) {
  return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2)
}

function fmtDur(sec: number | null) {
  if (!sec) return '—'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m${sec % 60 > 0 ? ` ${sec % 60}s` : ''}`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

function exportCsv(trades: Trade[]) {
  const headers = ['#','Symbol','Date','Open','Close','Dur','Size','Fills','Avg Buy','Avg Sell','Gross','Fees','Net','MAE','MFE','Result']
  const rows = trades.map((t, i) => [
    i + 1, t.symbol, t.date ?? '',
    t.open_time?.slice(0, 8) ?? '', t.close_time?.slice(0, 8) ?? '',
    fmtDur(t.holding_sec), t.max_size ?? '', t.n_fills ?? '',
    t.avg_buy?.toFixed(4) ?? '', t.avg_sell?.toFixed(4) ?? '',
    t.gross.toFixed(2), t.fees.toFixed(2), t.net_pnl.toFixed(2),
    t.mae?.toFixed(2) ?? '', t.mfe?.toFixed(2) ?? '',
    t.net_pnl > 0.001 ? 'W' : t.net_pnl < -0.001 ? 'L' : 'BE',
  ])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'trades.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function TradesPage() {
  const searchParams = useSearchParams()
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState(() => searchParams.get('date') ?? '')
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [setups, setSetups] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/trades')
      .then(r => r.json())
      .then((d: Trade[]) => {
        setTrades(Array.isArray(d) ? d.sort((a, b) => {
          const da = (a.date ?? '') + (a.open_time ?? '')
          const db = (b.date ?? '') + (b.open_time ?? '')
          return da < db ? -1 : da > db ? 1 : 0
        }) : [])
      })
      .finally(() => setLoading(false))

    fetch('/api/setups').then(r => r.json()).then(d => setSetups(Array.isArray(d) ? d : []))
  }, [])

  // Build date options
  const dateOptions = useMemo(() => {
    const map: Record<string, { count: number; net: number }> = {}
    for (const t of trades) {
      const d = t.date ?? ''
      if (!d) continue
      if (!map[d]) map[d] = { count: 0, net: 0 }
      map[d].count++
      map[d].net += t.net_pnl
    }
    return Object.entries(map).sort(([a], [b]) => a < b ? -1 : 1)
  }, [trades])

  const filtered = dateFilter ? trades.filter(t => t.date === dateFilter) : trades

  return (
    <>
    <div className="p-8 text-[#e8ecf2]" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Topbar */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7589]">Filtrar por fecha:</span>
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="bg-[#161b28] border border-[#232a3a] text-[#e8ecf2] px-3 py-1.5 rounded-md text-xs font-mono focus:outline-none focus:border-[#f59e0b]"
          >
            <option value="">Todas ({trades.length} trades)</option>
            {dateOptions.map(([d, { count, net }]) => (
              <option key={d} value={d}>
                {d} · {count} trades · {m(net)}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => exportCsv(filtered)}
          className="px-3 py-1.5 rounded-md bg-[#161b28] border border-[#232a3a] text-[#e8ecf2] text-xs font-medium hover:bg-[#1e2434] hover:border-[#2f384c] transition-colors"
        >
          Exportar CSV
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#4a5266] text-sm">Cargando…</div>
      ) : (
        <div className="rounded-[10px] bg-[#11151f] border border-[#232a3a] overflow-x-auto">
          <table className="w-full border-collapse" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
            <thead>
              <tr className="bg-[#161b28] border-b border-[#2f384c] text-[#6d7589] text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ fontFamily: 'Inter, sans-serif' }}>
                <th className="px-3.5 py-2.5 text-left">#</th>
                <th className="px-3.5 py-2.5 text-left">Sym</th>
                <th className="px-3.5 py-2.5 text-left">Apertura</th>
                <th className="px-3.5 py-2.5 text-left">Cierre</th>
                <th className="px-3.5 py-2.5 text-left">Dur.</th>
                <th className="px-3.5 py-2.5 text-center">Tam.</th>
                <th className="px-3.5 py-2.5 text-center">Fills</th>
                <th className="px-3.5 py-2.5 text-right">Avg Buy</th>
                <th className="px-3.5 py-2.5 text-right">Avg Sell</th>
                <th className="px-3.5 py-2.5 text-right">Bruto</th>
                <th className="px-3.5 py-2.5 text-right">Fees</th>
                <th className="px-3.5 py-2.5 text-right">Neto</th>
                <th className="px-3.5 py-2.5 text-right">MAE</th>
                <th className="px-3.5 py-2.5 text-right">MFE</th>
                <th className="px-3.5 py-2.5 text-center">R</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={15} className="px-4 py-12 text-center text-[#4a5266]">No hay trades.</td></tr>
              )}
              {filtered.map((t, i) => {
                const tag = t.net_pnl > 0.001 ? 'W' : t.net_pnl < -0.001 ? 'L' : 'BE'
                const tagColor = tag === 'W'
                  ? 'bg-[rgba(34,197,94,0.12)] text-[#22c55e] border border-[rgba(34,197,94,0.3)]'
                  : tag === 'L'
                  ? 'bg-[rgba(239,68,68,0.12)] text-[#ef4444] border border-[rgba(239,68,68,0.3)]'
                  : 'bg-[rgba(245,158,11,0.12)] text-[#f59e0b] border border-[rgba(245,158,11,0.3)]'
                const netColor = t.net_pnl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'
                const grossColor = t.gross >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'
                const hasJournal = !!(t.setup || t.notes)
                return (
                  <tr key={t.id} onClick={() => setSelectedTrade(t)} className="border-b border-[#1a1f2e] hover:bg-[rgba(245,158,11,0.04)] cursor-pointer transition-colors">
                    <td className="px-3.5 py-2 text-[#4a5266]">{i + 1}</td>
                    <td className="px-3.5 py-2">
                      <span className="inline-block px-2 py-0.5 border border-[#2f384c] rounded text-[11px] tracking-[0.04em] text-[#e8ecf2] font-semibold">
                        {t.symbol}
                      </span>
                      {hasJournal && <span className="text-[#f59e0b] text-[8px] ml-1">●</span>}
                    </td>
                    <td className="px-3.5 py-2 text-[#a4abbe]">
                      {t.date ? t.date.slice(5) : ''} {t.open_time?.slice(0, 8) ?? ''}
                    </td>
                    <td className="px-3.5 py-2 text-[#a4abbe]">{t.close_time?.slice(0, 8) ?? '—'}</td>
                    <td className="px-3.5 py-2 text-[#a4abbe]">{fmtDur(t.holding_sec)}</td>
                    <td className="px-3.5 py-2 text-center text-[#e8ecf2]">{t.max_size ?? '—'}</td>
                    <td className="px-3.5 py-2 text-center text-[#6d7589]">{t.n_fills ?? '—'}</td>
                    <td className="px-3.5 py-2 text-right text-[#a4abbe]">{t.avg_buy?.toFixed(4) ?? '—'}</td>
                    <td className="px-3.5 py-2 text-right text-[#a4abbe]">{t.avg_sell?.toFixed(4) ?? '—'}</td>
                    <td className={`px-3.5 py-2 text-right font-semibold ${grossColor}`}>{m(t.gross)}</td>
                    <td className="px-3.5 py-2 text-right text-[#6d7589]">{t.fees.toFixed(2)}</td>
                    <td className={`px-3.5 py-2 text-right font-semibold ${netColor}`}>{m(t.net_pnl)}</td>
                    <td className="px-3.5 py-2 text-right text-[#ef4444]">{t.mae != null ? m(t.mae) : '—'}</td>
                    <td className="px-3.5 py-2 text-right text-[#22c55e]">{t.mfe != null ? m(t.mfe) : '—'}</td>
                    <td className="px-3.5 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-[0.04em] uppercase ${tagColor}`}>
                        {tag}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>

      {selectedTrade && (
        <TradeModal
          trade={selectedTrade}
          setups={setups}
          onClose={() => setSelectedTrade(null)}
          onSaved={(updated) => {
            setTrades(prev => prev.map(t => t.id === updated.id ? updated : t))
            setSelectedTrade(updated)
          }}
        />
      )}
    </>
  )
}
