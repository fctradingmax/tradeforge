'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ReferenceLine,
} from 'recharts'

interface Trade {
  id: string
  symbol: string
  date: string | null
  open_time: string | null
  close_time: string | null
  gross: number
  fees: number
  net_pnl: number
  holding_sec: number | null
  max_size: number | null
  mae: number | null
  mfe: number | null
  setup: string | null
  quality: string | null
  emotion: string | null
}

function m(v: number)   { return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2) }
function pct(v: number) { return (v * 100).toFixed(1) + '%' }
function clr(v: number) { return v >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]' }

const TT_STYLE = {
  contentStyle: { background: '#11151f', border: '1px solid #232a3a', borderRadius: 6, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
  labelStyle:   { color: '#a4abbe', marginBottom: 2 },
  itemStyle:    { color: '#e8ecf2' },
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6d7589] mb-3">{title}</h2>
      {children}
    </div>
  )
}

export default function ReportsPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/trades')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setTrades(d) })
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    if (!trades.length) return null

    const sorted = [...trades].sort((a, b) => {
      const ka = (a.date ?? '') + (a.open_time ?? '')
      const kb = (b.date ?? '') + (b.open_time ?? '')
      return ka < kb ? -1 : 1
    })

    const wins   = trades.filter(t => t.net_pnl > 0.001)
    const losses = trades.filter(t => t.net_pnl < -0.001)
    const sumWin  = wins.reduce((s, t) => s + t.net_pnl, 0)
    const sumLoss = Math.abs(losses.reduce((s, t) => s + t.net_pnl, 0))
    const netTotal   = trades.reduce((s, t) => s + t.net_pnl, 0)
    const grossTotal = trades.reduce((s, t) => s + t.gross, 0)
    const feesTotal  = trades.reduce((s, t) => s + t.fees, 0)
    const avgWin  = wins.length   ? sumWin / wins.length : 0
    const avgLoss = losses.length ? sumLoss / losses.length : 0
    const profitFactor = sumLoss > 0 ? sumWin / sumLoss : Infinity
    const rr = avgLoss > 0 ? avgWin / avgLoss : 0
    const bestTrade  = Math.max(...trades.map(t => t.net_pnl))
    const worstTrade = Math.min(...trades.map(t => t.net_pnl))

    // Max drawdown
    let peak = 0, cum = 0, maxDD = 0
    for (const t of sorted) {
      cum += t.net_pnl
      if (cum > peak) peak = cum
      const dd = peak - cum
      if (dd > maxDD) maxDD = dd
    }

    // Streaks
    let cur = 0, maxW = 0, maxL = 0
    for (const t of sorted) {
      if (t.net_pnl > 0.001)       { cur = cur > 0 ? cur + 1 : 1;  maxW = Math.max(maxW, cur) }
      else if (t.net_pnl < -0.001) { cur = cur < 0 ? cur - 1 : -1; maxL = Math.max(maxL, -cur) }
    }

    // Avg holding time
    const withDur = trades.filter(t => t.holding_sec)
    const avgHold = withDur.length ? withDur.reduce((s, t) => s + (t.holding_sec ?? 0), 0) / withDur.length : 0
    const winHold  = wins.filter(t => t.holding_sec).reduce((s, t) => s + (t.holding_sec ?? 0), 0) / (wins.filter(t => t.holding_sec).length || 1)
    const lossHold = losses.filter(t => t.holding_sec).reduce((s, t) => s + (t.holding_sec ?? 0), 0) / (losses.filter(t => t.holding_sec).length || 1)

    // P&L distribution
    const minP = Math.floor(Math.min(...trades.map(t => t.net_pnl)) / 10) * 10
    const maxP = Math.ceil(Math.max(...trades.map(t => t.net_pnl)) / 10) * 10 + 10
    const distBuckets: { label: string; count: number; profit: boolean }[] = []
    for (let b = minP; b < maxP; b += 10) {
      const lo = b, hi = b + 10
      const n = trades.filter(t => t.net_pnl >= lo && t.net_pnl < hi).length
      distBuckets.push({ label: `$${lo >= 0 ? '+' : ''}${lo}`, count: n, profit: hi > 0 })
    }

    // By day of week
    const dayMap: Record<string, { net: number; count: number; wins: number }> = {}
    for (const t of trades) {
      if (!t.date) continue
      const d = new Date(t.date + 'T12:00:00Z')
      const name = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getUTCDay()]
      if (!dayMap[name]) dayMap[name] = { net: 0, count: 0, wins: 0 }
      dayMap[name].net += t.net_pnl
      dayMap[name].count++
      if (t.net_pnl > 0.001) dayMap[name].wins++
    }
    const dayData = ['Lun','Mar','Mié','Jue','Vie'].map(name => {
      const d = dayMap[name] ?? { net: 0, count: 0, wins: 0 }
      return { name, net: parseFloat(d.net.toFixed(2)), count: d.count, wr: d.count ? Math.round(d.wins / d.count * 100) : 0 }
    })

    // By hour
    const hourMap: Record<number, { net: number; count: number; wins: number }> = {}
    for (const t of trades) {
      if (!t.open_time) continue
      const h = parseInt(t.open_time.slice(0, 2))
      if (!hourMap[h]) hourMap[h] = { net: 0, count: 0, wins: 0 }
      hourMap[h].net += t.net_pnl
      hourMap[h].count++
      if (t.net_pnl > 0.001) hourMap[h].wins++
    }
    const hourData = Array.from({ length: 15 }, (_, i) => i + 6).map(h => {
      const d = hourMap[h] ?? { net: 0, count: 0, wins: 0 }
      const label = h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`
      return { label, net: parseFloat(d.net.toFixed(2)), count: d.count, wr: d.count ? Math.round(d.wins / d.count * 100) : 0 }
    })

    // By setup
    const setupMap: Record<string, { net: number; count: number; wins: number }> = {}
    for (const t of trades) {
      const s = t.setup || '(sin setup)'
      if (!setupMap[s]) setupMap[s] = { net: 0, count: 0, wins: 0 }
      setupMap[s].net += t.net_pnl
      setupMap[s].count++
      if (t.net_pnl > 0.001) setupMap[s].wins++
    }
    const setupData = Object.entries(setupMap).map(([name, d]) => ({
      name, count: d.count,
      net: parseFloat(d.net.toFixed(2)),
      wr: Math.round(d.wins / d.count * 100),
      avg: parseFloat((d.net / d.count).toFixed(2)),
    })).sort((a, b) => b.net - a.net)

    // By quality
    const qualMap: Record<string, { net: number; count: number; wins: number }> = {}
    for (const t of trades) {
      if (!t.quality) continue
      if (!qualMap[t.quality]) qualMap[t.quality] = { net: 0, count: 0, wins: 0 }
      qualMap[t.quality].net += t.net_pnl
      qualMap[t.quality].count++
      if (t.net_pnl > 0.001) qualMap[t.quality].wins++
    }
    const qualData = ['1','2','3','4','5'].filter(q => qualMap[q]).map(q => {
      const d = qualMap[q]
      return { label: `Q${q}`, net: parseFloat(d.net.toFixed(2)), count: d.count, wr: Math.round(d.wins / d.count * 100), avg: parseFloat((d.net / d.count).toFixed(2)) }
    })

    // By emotion
    const emoMap: Record<string, { net: number; count: number; wins: number }> = {}
    for (const t of trades) {
      if (!t.emotion) continue
      if (!emoMap[t.emotion]) emoMap[t.emotion] = { net: 0, count: 0, wins: 0 }
      emoMap[t.emotion].net += t.net_pnl
      emoMap[t.emotion].count++
      if (t.net_pnl > 0.001) emoMap[t.emotion].wins++
    }
    const emoData = Object.entries(emoMap).map(([name, d]) => ({
      name, net: parseFloat(d.net.toFixed(2)), count: d.count,
      wr: Math.round(d.wins / d.count * 100),
      avg: parseFloat((d.net / d.count).toFixed(2)),
    })).sort((a, b) => b.net - a.net)

    return {
      netTotal, grossTotal, feesTotal,
      wins: wins.length, losses: losses.length, total: trades.length,
      winRate: wins.length / trades.length,
      avgWin, avgLoss, profitFactor, rr,
      bestTrade, worstTrade, maxDD,
      currentStreak: cur, maxWinStreak: maxW, maxLossStreak: maxL,
      avgHold, winHold, lossHold,
      distBuckets, dayData, hourData, setupData, qualData, emoData,
    }
  }, [trades])

  if (loading) return <div className="p-8 text-center text-[#4a5266] text-sm">Cargando…</div>
  if (!stats)  return <div className="p-8 text-center text-[#4a5266] text-sm">No hay trades.</div>

  function fmtSec(s: number) {
    if (s < 60) return `${Math.round(s)}s`
    if (s < 3600) return `${Math.floor(s / 60)}m`
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  }

  const kpis = [
    { label: 'Net P&L',       value: m(stats.netTotal),       color: clr(stats.netTotal) },
    { label: 'Bruto',         value: m(stats.grossTotal),     color: clr(stats.grossTotal) },
    { label: 'Comisiones',    value: `-$${stats.feesTotal.toFixed(2)}`, color: 'text-[#ef4444]' },
    { label: 'Trades',        value: String(stats.total),     color: 'text-[#e8ecf2]' },
    { label: 'Win Rate',      value: pct(stats.winRate),      color: 'text-[#e8ecf2]' },
    { label: 'Profit Factor', value: isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞', color: 'text-[#e8ecf2]' },
    { label: 'R:R',           value: stats.rr.toFixed(2),    color: 'text-[#e8ecf2]' },
    { label: 'Max Drawdown',  value: `-$${stats.maxDD.toFixed(2)}`, color: 'text-[#ef4444]' },
  ]

  return (
    <div className="p-6 text-[#e8ecf2]" style={{ fontFamily: 'Inter, sans-serif' }}>
      <h1 className="text-[18px] font-semibold tracking-tight mb-5">Reports</h1>

      {/* KPI row */}
      <Section title="Resumen general">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-0">
          {kpis.map(k => (
            <div key={k.label} className="bg-[#11151f] border border-[#232a3a] rounded-lg px-3 py-3">
              <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#6d7589] mb-1">{k.label}</div>
              <div className={`text-[15px] font-semibold font-mono ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Win/Loss breakdown */}
      <Section title="Breakdown">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {[
            { label: 'Ganadores',   value: stats.wins,             color: 'text-[#22c55e]' },
            { label: 'Perdedores',  value: stats.losses,           color: 'text-[#ef4444]' },
            { label: 'Avg ganador', value: m(stats.avgWin),        color: 'text-[#22c55e]' },
            { label: 'Avg perdedor',value: `-$${stats.avgLoss.toFixed(2)}`, color: 'text-[#ef4444]' },
            { label: 'Mejor trade', value: m(stats.bestTrade),     color: 'text-[#22c55e]' },
            { label: 'Peor trade',  value: m(stats.worstTrade),    color: 'text-[#ef4444]' },
          ].map(k => (
            <div key={k.label} className="bg-[#11151f] border border-[#232a3a] rounded-lg px-3 py-3">
              <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#6d7589] mb-1">{k.label}</div>
              <div className={`text-[15px] font-semibold font-mono ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* P&L Distribution */}
      <Section title="Distribución de P&L">
        <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.distBuckets} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="10%">
              <CartesianGrid stroke="#1e2434" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6d7589', fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
              <Tooltip {...TT_STYLE} formatter={(v: unknown) => [`${v}`, 'trades']} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {stats.distBuckets.map((b, i) => (
                  <Cell key={i} fill={b.profit ? '#22c55e' : '#ef4444'} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* Day of week + Hour */}
      <Section title="Análisis temporal">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5">
            <div className="text-[11px] font-semibold text-[#a4abbe] mb-3">Por día de semana</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.dayData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1e2434" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#a4abbe', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} tickFormatter={v => '$' + v} width={50} />
                <Tooltip {...TT_STYLE} formatter={(v: unknown, name: unknown) => [name === 'net' ? m(v as number) : `${v}%`, name === 'net' ? 'Net P&L' : 'Win Rate']} />
                <ReferenceLine y={0} stroke="#2f384c" />
                <Bar dataKey="net" name="net" radius={[3, 3, 0, 0]}>
                  {stats.dayData.map((d, i) => (
                    <Cell key={i} fill={d.net >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5">
            <div className="text-[11px] font-semibold text-[#a4abbe] mb-3">Por hora de apertura</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.hourData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1e2434" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#a4abbe', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} tickFormatter={v => '$' + v} width={50} />
                <Tooltip {...TT_STYLE} formatter={(v: unknown, name: unknown) => [name === 'net' ? m(v as number) : `${v} trades`, name === 'net' ? 'Net P&L' : 'Trades']} />
                <ReferenceLine y={0} stroke="#2f384c" />
                <Bar dataKey="net" name="net" radius={[3, 3, 0, 0]}>
                  {stats.hourData.map((d, i) => (
                    <Cell key={i} fill={d.net >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      {/* Setup table */}
      {stats.setupData.length > 0 && (
        <Section title="Por setup / estrategia">
          <div className="bg-[#11151f] border border-[#232a3a] rounded-xl overflow-hidden">
            <table className="w-full border-collapse" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
              <thead>
                <tr className="bg-[#161b28] border-b border-[#2f384c] text-[#6d7589] text-[10px] uppercase tracking-[0.08em]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  <th className="px-4 py-2.5 text-left">Setup</th>
                  <th className="px-4 py-2.5 text-center">Trades</th>
                  <th className="px-4 py-2.5 text-center">Win %</th>
                  <th className="px-4 py-2.5 text-right">Avg P&L</th>
                  <th className="px-4 py-2.5 text-right">Net P&L</th>
                </tr>
              </thead>
              <tbody>
                {stats.setupData.map(s => (
                  <tr key={s.name} className="border-b border-[#1a1f2e] hover:bg-[#161b28] transition-colors">
                    <td className="px-4 py-2.5 text-[#e8ecf2] text-xs" style={{ fontFamily: 'Inter, sans-serif' }}>{s.name}</td>
                    <td className="px-4 py-2.5 text-center text-[#a4abbe]">{s.count}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${s.wr >= 50 ? 'text-[#22c55e] bg-[rgba(34,197,94,0.1)]' : 'text-[#ef4444] bg-[rgba(239,68,68,0.1)]'}`}>
                        {s.wr}%
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 text-right ${clr(s.avg)}`}>{m(s.avg)}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${clr(s.net)}`}>{m(s.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Quality + Emotion */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">

        {stats.qualData.length > 0 && (
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6d7589] mb-3">Por calidad de ejecución</h2>
            <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5">
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={stats.qualData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#1e2434" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#a4abbe', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} tickFormatter={v => '$' + v} width={55} />
                  <Tooltip {...TT_STYLE} formatter={(v: unknown) => [m(v as number), 'Avg trade']} />
                  <ReferenceLine y={0} stroke="#2f384c" />
                  <Bar dataKey="avg" name="avg" radius={[3, 3, 0, 0]}>
                    {stats.qualData.map((d, i) => (
                      <Cell key={i} fill={d.avg >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.75} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 flex flex-wrap gap-2">
                {stats.qualData.map(d => (
                  <span key={d.label} className="text-[10px] font-mono text-[#6d7589]">
                    {d.label}: {d.count} trades · {d.wr}% WR
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {stats.emoData.length > 0 && (
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6d7589] mb-3">Por emoción</h2>
            <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5">
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={stats.emoData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#1e2434" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#a4abbe', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} tickFormatter={v => '$' + v} width={55} />
                  <Tooltip {...TT_STYLE} formatter={(v: unknown) => [m(v as number), 'Avg trade']} />
                  <ReferenceLine y={0} stroke="#2f384c" />
                  <Bar dataKey="avg" radius={[3, 3, 0, 0]}>
                    {stats.emoData.map((d, i) => (
                      <Cell key={i} fill={d.avg >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.75} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 flex flex-wrap gap-2">
                {stats.emoData.map(d => (
                  <span key={d.name} className="text-[10px] font-mono text-[#6d7589]">
                    {d.name}: {d.count} · {d.wr}% WR
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Streaks + Holding time */}
      <Section title="Rachas y tiempo en posición">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5">
            <div className="text-[11px] font-semibold text-[#a4abbe] mb-4">Rachas</div>
            <div className="space-y-3">
              {[
                { label: 'Racha actual', value: stats.currentStreak > 0 ? `+${stats.currentStreak} ganadores` : stats.currentStreak < 0 ? `${Math.abs(stats.currentStreak)} perdedores` : 'Neutra', color: stats.currentStreak > 0 ? 'text-[#22c55e]' : stats.currentStreak < 0 ? 'text-[#ef4444]' : 'text-[#a4abbe]' },
                { label: 'Máx. racha ganadora',  value: `${stats.maxWinStreak} consecutivos`,  color: 'text-[#22c55e]' },
                { label: 'Máx. racha perdedora', value: `${stats.maxLossStreak} consecutivos`, color: 'text-[#ef4444]' },
                { label: 'Max Drawdown', value: `-$${stats.maxDD.toFixed(2)}`, color: 'text-[#ef4444]' },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-2 border-b border-[#1a1f2e] last:border-0">
                  <span className="text-xs text-[#6d7589]">{r.label}</span>
                  <span className={`text-sm font-semibold font-mono ${r.color}`}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5">
            <div className="text-[11px] font-semibold text-[#a4abbe] mb-4">Tiempo en posición</div>
            <div className="space-y-3">
              {[
                { label: 'Promedio general',    value: fmtSec(stats.avgHold),  color: 'text-[#e8ecf2]' },
                { label: 'Promedio ganadores',  value: fmtSec(stats.winHold),  color: 'text-[#22c55e]' },
                { label: 'Promedio perdedores', value: fmtSec(stats.lossHold), color: 'text-[#ef4444]' },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-2 border-b border-[#1a1f2e] last:border-0">
                  <span className="text-xs text-[#6d7589]">{r.label}</span>
                  <span className={`text-sm font-semibold font-mono ${r.color}`}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

    </div>
  )
}
