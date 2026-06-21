'use client'

import { useEffect, useRef, useState } from 'react'


type Candle = { time: number; open: number; high: number; low: number; close: number }
const candleCache = new Map<string, Candle[]>()

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

type Fill = { id: string; time: string; side: string; qty: number; price: number; fee: number }

const PRESET_TAGS = ['A+', 'Setup limpio', 'FOMO', 'Revenge trade', 'Sobre-gestión', 'Salida anticipada', 'Añadió correctamente', 'Respetó el stop']
const EMOTIONS = ['Disciplinado', 'FOMO', 'Revenge', 'Ansioso', 'Aburrido', 'Overconfident', 'Miedo']

function m(v: number) { return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2) }
function fmtDur(sec: number | null) {
  if (!sec) return '—'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60 > 0 ? sec % 60 + 's' : ''}`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

interface Props { trade: Trade; onClose: () => void; onSaved: (updated: Trade) => void; setups: string[] }

export default function TradeModal({ trade, onClose, onSaved, setups }: Props) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<unknown>(null)
  const seriesRef = useRef<unknown>(null)
  const datePartsRef = useRef<{ y: number; mo: number; day: number; etOff: number } | null>(null)
  const fillsRef = useRef<Fill[]>([])

  // Journal state
  const [setup, setSetup]     = useState(trade.setup ?? '')
  const [quality, setQuality] = useState(trade.quality ?? '')
  const [emotion, setEmotion] = useState(trade.emotion ?? '')
  const [tags, setTags]       = useState<string[]>(trade.tags ?? [])
  const [notes, setNotes]     = useState(trade.notes ?? '')
  const [lessons, setLessons] = useState(trade.lessons ?? '')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(!!trade.setup || !!trade.notes)
  const [iv, setIv]           = useState('1m')
  const [chartStatus, setChartStatus] = useState<{ msg: string; err: boolean } | null>(null)
  const [fills, setFills]       = useState<Fill[]>([])
  const [fillsLoading, setFillsLoading] = useState(true)
  const [fillsReal, setFillsReal]       = useState(false)

  const tag = trade.net_pnl > 0.001 ? 'W' : trade.net_pnl < -0.001 ? 'L' : 'BE'
  const tagColor = tag === 'W' ? 'text-[#22c55e] bg-[rgba(34,197,94,0.12)] border-[rgba(34,197,94,0.3)]'
    : tag === 'L' ? 'text-[#ef4444] bg-[rgba(239,68,68,0.12)] border-[rgba(239,68,68,0.3)]'
    : 'text-[#f59e0b] bg-[rgba(245,158,11,0.12)] border-[rgba(245,158,11,0.3)]'

  // Preload lightweight-charts while user reads the stats
  useEffect(() => { import('lightweight-charts').catch(() => {}) }, [])

  // Fetch fills — fall back to reconstructed fills from aggregate data
  useEffect(() => {
    setFillsLoading(true)
    fetch(`/api/trades/${trade.id}/fills`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d) && d.length > 0) {
          setFills(d)
          setFillsReal(true)
        } else {
          // Reconstruct from aggregated trade fields
          const reconstructed = []
          if (trade.open_side === 'B') {
            if (trade.buy_qty && trade.avg_buy)
              reconstructed.push({ id: 'r0', time: trade.open_time ?? '', side: 'B', qty: trade.buy_qty, price: trade.avg_buy, fee: 0 })
            if (trade.sell_qty && trade.avg_sell)
              reconstructed.push({ id: 'r1', time: trade.close_time ?? '', side: 'S', qty: trade.sell_qty, price: trade.avg_sell, fee: 0 })
          } else {
            if (trade.sell_qty && trade.avg_sell)
              reconstructed.push({ id: 'r0', time: trade.open_time ?? '', side: 'S', qty: trade.sell_qty, price: trade.avg_sell, fee: 0 })
            if (trade.buy_qty && trade.avg_buy)
              reconstructed.push({ id: 'r1', time: trade.close_time ?? '', side: 'B', qty: trade.buy_qty, price: trade.avg_buy, fee: 0 })
          }
          setFills(reconstructed)
        }
      })
      .finally(() => setFillsLoading(false))
  }, [trade.id, trade.open_side, trade.buy_qty, trade.avg_buy, trade.sell_qty, trade.avg_sell, trade.open_time, trade.close_time])

  // Keep ref in sync so chart effect can read current fills without a dep
  useEffect(() => { fillsRef.current = fills }, [fills])

  // Re-apply markers whenever fills change (fills may arrive before or after the chart)
  useEffect(() => {
    if (!seriesRef.current || !datePartsRef.current || !fills.length) return
    const { y, mo, day, etOff } = datePartsRef.current
    const markers = fills
      .map(f => {
        const parts = (f.time ?? '').split(':').map(Number)
        const ts = Math.floor(Date.UTC(y, mo, day, parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0) / 1000) + etOff
        const isBuy = f.side === 'B'
        return {
          time: ts as unknown as string,
          position: (isBuy ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
          color: isBuy ? '#3b82f6' : '#ef4444',
          shape: (isBuy ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
          text: `${isBuy ? 'B' : 'S'} ${f.qty}`,
        }
      })
      .sort((a, b) => (a.time as unknown as number) - (b.time as unknown as number))
    import('lightweight-charts').then(LW => {
      if (!seriesRef.current) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      LW.createSeriesMarkers(seriesRef.current as any, markers)
    })
  }, [fills])

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [onClose])

  // Load candlestick chart
  useEffect(() => {
    if (!trade.date || !chartRef.current) return
    setChartStatus({ msg: `Cargando velas ${iv} de ${trade.symbol}…`, err: false })

    // Destroy previous chart
    if (chartInstanceRef.current) {
      try { (chartInstanceRef.current as { remove: () => void }).remove() } catch (_) {}
      chartInstanceRef.current = null
    }

    let cancelled = false

    async function load() {
      const d = new Date(trade.date + 'T12:00:00Z')
      const y = d.getUTCFullYear(), mo = d.getUTCMonth(), day = d.getUTCDate()
      // Determine ET offset (DST-aware)
      const mar2nd = new Date(Date.UTC(y, 2, 1 + ((7 - new Date(Date.UTC(y, 2, 1)).getUTCDay()) % 7) + 7, 7, 0, 0))
      const nov1st = new Date(Date.UTC(y, 10, 1 + ((7 - new Date(Date.UTC(y, 10, 1)).getUTCDay()) % 7), 7, 0, 0))
      const isDST = d >= mar2nd && d < nov1st
      const etOff = isDST ? -4 * 3600 : -5 * 3600
      const p1 = Math.floor(Date.UTC(y, mo, day, 0, 0, 0) / 1000) - etOff
      const p2 = Math.floor(Date.UTC(y, mo, day, 23, 59, 59) / 1000) - etOff
      const yIv = iv === '1m' ? '1m' : iv === '5m' ? '5m' : '15m'
      const sym = encodeURIComponent(trade.symbol)

      const urls = [
        `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?period1=${p1}&period2=${p2}&interval=${yIv}&includePrePost=true`,
        `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?period1=${p1}&period2=${p2}&interval=${yIv}&includePrePost=true`,
      ]
      const proxies = [
        (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u: string) => u,
      ]

      const cacheKey = `${trade.symbol}:${trade.date}:${iv}`
      let candles: Candle[] = candleCache.get(cacheKey) ?? []

      if (!candles.length) {
        function tryFetch(url: string): Promise<Candle[]> {
          return fetch(url, { signal: AbortSignal.timeout(8000) })
            .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
            .then(j => {
              const res = j?.chart?.result?.[0]
              if (!res?.timestamp) throw new Error('no data')
              const q = res.indicators.quote[0]
              const data: Candle[] = res.timestamp
                .map((ts: number, i: number) => ({ time: ts + etOff, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] }))
                .filter((c: Candle) => c.open != null)
              if (!data.length) throw new Error('empty')
              return data
            })
        }
        const attempts = urls.flatMap(url => proxies.map(p => tryFetch(p(url))))
        try {
          candles = await Promise.any(attempts)
          candleCache.set(cacheKey, candles)
        } catch (_) { /* all failed */ }
      }

      if (cancelled) return
      if (!candles.length) {
        setChartStatus({ msg: `No se pudieron obtener velas para ${trade.symbol} (${iv}). Prueba 5m o 15m si la fecha es mayor a 30 días.`, err: true })
        return
      }

      setChartStatus(null)

      // Dynamic import so SSR doesn't break
      const LW = await import('lightweight-charts')
      if (cancelled || !chartRef.current) return

      const chart = LW.createChart(chartRef.current, {
        layout: { background: { color: '#11151f' }, textColor: '#a4abbe' },
        grid: { vertLines: { color: '#1e2434' }, horzLines: { color: '#1e2434' } },
        timeScale: {
          borderColor: '#2f384c', timeVisible: true, secondsVisible: false,
          tickMarkFormatter: (t: number) => {
            const dt = new Date(t * 1000)
            return String(dt.getUTCHours()).padStart(2, '0') + ':' + String(dt.getUTCMinutes()).padStart(2, '0')
          },
        },
        crosshair: { mode: 1 },
        width: chartRef.current.clientWidth,
        height: 300,
      })
      chartInstanceRef.current = chart

      const series = chart.addSeries(LW.CandlestickSeries, {
        upColor: '#22c55e', downColor: '#ef4444',
        borderUpColor: '#22c55e', borderDownColor: '#ef4444',
        wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      series.setData(candles as any)

      // Store refs so the fills effect can apply markers independently
      seriesRef.current = series
      datePartsRef.current = { y, mo, day, etOff }

      // Apply markers from whatever fills are already loaded
      if (fillsRef.current.length) {
        const markers = fillsRef.current
          .map(f => {
            const parts = (f.time ?? '').split(':').map(Number)
            const ts = Math.floor(Date.UTC(y, mo, day, parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0) / 1000) + etOff
            const isBuy = f.side === 'B'
            return {
              time: ts as unknown as string,
              position: (isBuy ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
              color: isBuy ? '#3b82f6' : '#ef4444',
              shape: (isBuy ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
              text: `${isBuy ? 'B' : 'S'} ${f.qty}`,
            }
          })
          .sort((a, b) => (a.time as unknown as number) - (b.time as unknown as number))
        LW.createSeriesMarkers(series, markers)
      }

      chart.timeScale().fitContent()
    }

    load()
    return () => {
      cancelled = true
      seriesRef.current = null
      datePartsRef.current = null
    }
  }, [trade, iv])

  function toggleTag(t: string) {
    setSaved(false)
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  async function save() {
    setSaving(true)
    const body = { setup: setup || null, quality: quality || null, emotion: emotion || null, tags: tags.length ? tags : null, notes: notes || null, lessons: lessons || null }
    const res = await fetch(`/api/trades/${trade.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      const updated = await res.json()
      setSaved(true)
      onSaved(updated)
    }
    setSaving(false)
  }

  const statItems = [
    { label: 'Net P&L', value: m(trade.net_pnl), color: trade.net_pnl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]' },
    { label: 'Bruto',   value: m(trade.gross),    color: trade.gross >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]' },
    { label: 'Fees',    value: `$${trade.fees.toFixed(2)}`, color: 'text-[#ef4444]' },
    { label: 'Duración', value: fmtDur(trade.holding_sec), color: 'text-[#e8ecf2]' },
    { label: 'Tam. máx', value: trade.max_size?.toString() ?? '—', color: 'text-[#e8ecf2]' },
    { label: 'Fills',   value: trade.n_fills?.toString() ?? '—', color: 'text-[#e8ecf2]' },
    { label: 'MAE',     value: trade.mae != null ? m(trade.mae) : '—', color: 'text-[#ef4444]' },
    { label: 'MFE',     value: trade.mfe != null ? m(trade.mfe) : '—', color: 'text-[#22c55e]' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6 overflow-y-auto" style={{ background: 'rgba(5,7,12,0.80)', backdropFilter: 'blur(4px)' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-[1200px] my-auto rounded-xl bg-[#0b0e16] border border-[#2f384c] shadow-2xl overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#11151f] border-b border-[#232a3a]">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-block px-2 py-0.5 border border-[#2f384c] rounded text-sm font-bold tracking-wide text-[#e8ecf2]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{trade.symbol}</span>
            <span className="text-[#6d7589] text-sm font-mono">{trade.date ?? ''}</span>
            <span className="text-[#a4abbe] text-sm font-mono">{trade.open_time?.slice(0, 8) ?? ''} → {trade.close_time?.slice(0, 8) ?? ''}</span>
            <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-bold uppercase tracking-wide ${tagColor}`}>{tag}</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md bg-[#161b28] border border-[#232a3a] text-[#6d7589] hover:text-[#e8ecf2] hover:bg-[#1e2434] flex items-center justify-center text-lg transition-colors">✕</button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-2.5 px-6 pt-5 pb-4">
          {statItems.map(s => (
            <div key={s.label} className="bg-[#11151f] border border-[#232a3a] rounded-lg p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6d7589] mb-1">{s.label}</div>
              <div className={`text-base font-semibold ${s.color}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Body: chart + journal */}
        <div className="grid grid-cols-[1fr_340px] gap-4 px-6 pb-6">

          {/* Chart + fills column */}
          <div className="flex flex-col gap-3">

            {/* Candlestick chart */}
            <div className="bg-[#11151f] border border-[#232a3a] rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#232a3a] bg-[#161b28]">
                <span className="text-xs font-semibold text-[#a4abbe]">{trade.symbol} · {trade.date}</span>
                <div className="flex gap-1">
                  {['1m', '5m', '15m'].map(i => (
                    <button key={i} onClick={() => setIv(i)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${iv === i ? 'bg-[#1e2434] text-[#e8ecf2]' : 'text-[#6d7589] hover:text-[#a4abbe]'}`}>
                      {i}
                    </button>
                  ))}
                </div>
              </div>
              {chartStatus && (
                <div className={`px-4 py-3 text-sm ${chartStatus.err ? 'text-[#ef4444]' : 'text-[#6d7589]'}`}>{chartStatus.msg}</div>
              )}
              <div ref={chartRef} className="w-full" style={{ height: 300 }} />
            </div>

            {/* Fills table */}
            <div className="bg-[#11151f] border border-[#232a3a] rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#232a3a] bg-[#161b28] flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7589]">Fills</span>
                {fills.length > 0 && (
                  <span className="text-[11px] font-mono text-[#4a5266]">
                    {fillsReal ? `${fills.length} ejecuciones` : 'agregado (sin fills individuales)'}
                  </span>
                )}
              </div>
              {fillsLoading ? (
                <div className="px-4 py-3 text-xs text-[#4a5266]">Cargando…</div>
              ) : fills.length === 0 ? (
                <div className="px-4 py-4 text-xs text-[#4a5266]">Sin datos de precio disponibles.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                    <thead>
                      <tr className="text-[#4a5266] text-[10px] uppercase tracking-[0.06em]" style={{ fontFamily: 'Inter, sans-serif' }}>
                        <th className="px-3 py-1.5 text-left">Hora</th>
                        <th className="px-3 py-1.5 text-center">Lado</th>
                        <th className="px-3 py-1.5 text-right">Cant.</th>
                        <th className="px-3 py-1.5 text-right">Precio</th>
                        <th className="px-3 py-1.5 text-right">Fee</th>
                        <th className="px-3 py-1.5 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fills.map((f, i) => {
                        const isBuy = f.side === 'B'
                        const sideColor = isBuy ? 'text-[#22c55e] bg-[rgba(34,197,94,0.1)]' : 'text-[#ef4444] bg-[rgba(239,68,68,0.1)]'
                        const value = f.qty * f.price
                        return (
                          <tr key={f.id ?? i} className="border-t border-[#1a1f2e]">
                            <td className="px-3 py-1.5 text-[#a4abbe]">{f.time?.slice(0, 8) ?? '—'}</td>
                            <td className="px-3 py-1.5 text-center">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${sideColor}`}>
                                {isBuy ? 'BUY' : 'SELL'}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right text-[#e8ecf2]">{f.qty.toLocaleString('en-US')}</td>
                            <td className="px-3 py-1.5 text-right text-[#e8ecf2]">${f.price.toFixed(4)}</td>
                            <td className="px-3 py-1.5 text-right text-[#6d7589]">{f.fee ? `$${f.fee.toFixed(2)}` : '—'}</td>
                            <td className="px-3 py-1.5 text-right text-[#a4abbe]">${value.toFixed(2)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {fills.length > 1 && (() => {
                      const totalBuyVal  = fills.filter(f => f.side === 'B').reduce((s, f) => s + f.qty * f.price, 0)
                      const totalSellVal = fills.filter(f => f.side === 'S').reduce((s, f) => s + f.qty * f.price, 0)
                      const totalFees    = fills.reduce((s, f) => s + (f.fee ?? 0), 0)
                      return (
                        <tfoot>
                          <tr className="border-t border-[#2f384c] text-[#6d7589] text-[10px]">
                            <td colSpan={4} className="px-3 py-1.5">Total</td>
                            <td className="px-3 py-1.5 text-right">${totalFees.toFixed(2)}</td>
                            <td className="px-3 py-1.5 text-right text-[#22c55e]">+${totalSellVal.toFixed(2)} <span className="text-[#ef4444]">-${totalBuyVal.toFixed(2)}</span></td>
                          </tr>
                        </tfoot>
                      )
                    })()}
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* Journal */}
          <div className="bg-[#11151f] border border-[#232a3a] rounded-lg p-4 flex flex-col gap-3 text-sm">

            {/* Setup */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6d7589] mb-1.5">Setup / Estrategia</label>
              <div className="flex gap-2">
                <select value={setup} onChange={e => { setSetup(e.target.value); setSaved(false) }}
                  className="flex-1 bg-[#161b28] border border-[#2f384c] text-[#e8ecf2] px-2.5 py-1.5 rounded-md text-xs focus:outline-none focus:border-[#f59e0b]">
                  <option value="">— Sin definir —</option>
                  {setups.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Quality + Emotion */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6d7589] mb-1.5">Calidad (1–5)</label>
                <select value={quality} onChange={e => { setQuality(e.target.value); setSaved(false) }}
                  className="w-full bg-[#161b28] border border-[#2f384c] text-[#e8ecf2] px-2.5 py-1.5 rounded-md text-xs focus:outline-none focus:border-[#f59e0b]">
                  <option value="">—</option>
                  <option value="5">5 · A+</option>
                  <option value="4">4 · A</option>
                  <option value="3">3 · B</option>
                  <option value="2">2 · C</option>
                  <option value="1">1 · D</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6d7589] mb-1.5">Emoción</label>
                <select value={emotion} onChange={e => { setEmotion(e.target.value); setSaved(false) }}
                  className="w-full bg-[#161b28] border border-[#2f384c] text-[#e8ecf2] px-2.5 py-1.5 rounded-md text-xs focus:outline-none focus:border-[#f59e0b]">
                  <option value="">—</option>
                  {EMOTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6d7589] mb-1.5">Etiquetas</label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_TAGS.map(t => (
                  <button key={t} onClick={() => toggleTag(t)}
                    className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${tags.includes(t) ? 'bg-[rgba(245,158,11,0.12)] border-[#f59e0b] text-[#f59e0b]' : 'bg-[#161b28] border-[#2f384c] text-[#6d7589] hover:text-[#a4abbe]'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6d7589] mb-1.5">Notas</label>
              <textarea value={notes} onChange={e => { setNotes(e.target.value); setSaved(false) }} rows={3}
                placeholder="¿Qué pasó? ¿Qué viste?"
                className="w-full bg-[#161b28] border border-[#2f384c] text-[#e8ecf2] px-2.5 py-2 rounded-md text-xs resize-none focus:outline-none focus:border-[#f59e0b] placeholder-[#4a5266]" />
            </div>

            {/* Lessons */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6d7589] mb-1.5">Lecciones</label>
              <textarea value={lessons} onChange={e => { setLessons(e.target.value); setSaved(false) }} rows={3}
                placeholder="¿Qué harías diferente?"
                className="w-full bg-[#161b28] border border-[#2f384c] text-[#e8ecf2] px-2.5 py-2 rounded-md text-xs resize-none focus:outline-none focus:border-[#f59e0b] placeholder-[#4a5266]" />
            </div>

            {/* Save */}
            <div className="flex items-center justify-between mt-auto pt-1">
              <span className={`text-[11px] font-mono ${saved ? 'text-[#22c55e]' : 'text-[#6d7589]'}`}>
                {saved ? '✓ Guardado' : 'Sin guardar'}
              </span>
              <button onClick={save} disabled={saving}
                className="px-4 py-1.5 rounded-md text-xs font-semibold text-[#1a1208] disabled:opacity-50 transition-colors"
                style={{ background: 'linear-gradient(180deg,#f59e0b,#d97706)' }}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
