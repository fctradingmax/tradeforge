'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ReferenceLine,
} from 'recharts'

interface Trade {
  id: string
  symbol: string
  date: string | null
  open_time: string | null
  gross: number
  fees: number
  net_pnl: number
  holding_sec: number | null
  max_size: number | null
  mae: number | null
  mfe: number | null
  setup: string | null
}

function m(v: number)   { return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2) }
function clr(v: number) { return v >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]' }
function n2(v: number)  { return v.toFixed(2) }

const TT_STYLE = {
  contentStyle: {
    background: '#11151f', border: '1px solid #232a3a',
    borderRadius: 6, fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
  },
  labelStyle: { color: '#a4abbe', marginBottom: 2 },
  itemStyle:  { color: '#e8ecf2' },
}

function KPI({ label, value, color = 'text-[#e8ecf2]', sub, badge }: {
  label: string; value: string; color?: string; sub?: string; badge?: { text: string; color: string }
}) {
  return (
    <div className="bg-[#11151f] border border-[#232a3a] rounded-lg px-4 py-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#6d7589] mb-1 flex items-center gap-2">
        {label}
        {badge && (
          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${badge.color}`}>{badge.text}</span>
        )}
      </div>
      <div className={`text-[15px] font-semibold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#4a5266] mt-0.5 font-mono">{sub}</div>}
    </div>
  )
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-semibold text-[#a4abbe]">{title}</span>
        {sub && <span className="text-[10px] text-[#4a5266] font-mono">{sub}</span>}
      </div>
      {children}
    </div>
  )
}

function gauge(pct: number, color: string) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div className="h-1.5 bg-[#1a1f2e] rounded-full overflow-hidden mt-1">
      <div className="h-full rounded-full transition-all" style={{ width: `${clamped}%`, background: color }} />
    </div>
  )
}

export default function RiskPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/trades')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setTrades(d) })
      .finally(() => setLoading(false))
  }, [])

  const data = useMemo(() => {
    if (!trades.length) return null

    const sorted = [...trades].sort((a, b) =>
      ((a.date ?? '') + (a.open_time ?? '')) < ((b.date ?? '') + (b.open_time ?? '')) ? -1 : 1
    )

    const wins   = sorted.filter(t => t.net_pnl >  0.001)
    const losses = sorted.filter(t => t.net_pnl < -0.001)
    const n      = sorted.length

    // ── Core risk metrics ────────────────────────────────────────────
    const grossProfit = wins.reduce((s, t) => s + t.gross, 0)
    const grossLoss   = Math.abs(losses.reduce((s, t) => s + t.gross, 0))
    const profitFactor = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : 999

    const avgWin  = wins.length   ? +(wins.reduce((s, t) => s + t.net_pnl, 0) / wins.length).toFixed(2)   : 0
    const avgLoss = losses.length ? +(Math.abs(losses.reduce((s, t) => s + t.net_pnl, 0)) / losses.length).toFixed(2) : 0
    const winRate = wins.length / n
    const wlRatio = avgLoss > 0 ? +(avgWin / avgLoss).toFixed(2) : 0

    const expectedValue = +(winRate * avgWin - (1 - winRate) * avgLoss).toFixed(2)

    // Kelly % — fraction of capital to risk per trade
    const kelly = avgLoss > 0 ? +(winRate - (1 - winRate) / wlRatio).toFixed(4) : 0
    const halfKelly = +(kelly / 2).toFixed(4) // conservative

    // Per-trade Sharpe (no annualisation — trade-level)
    const returns = sorted.map(t => t.net_pnl)
    const avgRet  = returns.reduce((s, v) => s + v, 0) / n
    const variance = returns.reduce((s, v) => s + (v - avgRet) ** 2, 0) / n
    const stdDev   = Math.sqrt(variance)
    const sharpe   = stdDev > 0 ? +(avgRet / stdDev).toFixed(3) : 0

    // ── Daily VaR ────────────────────────────────────────────────────
    const byDate: Record<string, number> = {}
    for (const t of sorted) {
      const d = t.date ?? 'unknown'
      byDate[d] = (byDate[d] ?? 0) + t.net_pnl
    }
    const dailyPnls = Object.values(byDate).sort((a, b) => a - b)
    const var95 = dailyPnls.length ? +dailyPnls[Math.floor(0.05 * dailyPnls.length)].toFixed(2) : 0
    const var99 = dailyPnls.length ? +dailyPnls[Math.floor(0.01 * dailyPnls.length)].toFixed(2) : 0

    // Daily P&L histogram
    const dMin    = dailyPnls[0]
    const dMax    = dailyPnls[dailyPnls.length - 1]
    const dBucket = Math.max(10, Math.ceil((dMax - dMin) / 25 / 5) * 5)
    const dBuckets: Record<number, number> = {}
    for (const v of dailyPnls) {
      const b = Math.floor(v / dBucket) * dBucket
      dBuckets[b] = (dBuckets[b] ?? 0) + 1
    }
    const dailyHist = Object.entries(dBuckets)
      .map(([b, count]) => ({ label: +b, count, pos: +b >= 0 }))
      .sort((a, b) => a.label - b.label)

    // Worst / Best days
    const dayEntries = Object.entries(byDate).map(([d, v]) => ({ date: d, pnl: +v.toFixed(2) }))
    const worstDays = [...dayEntries].sort((a, b) => a.pnl - b.pnl).slice(0, 5)
    const bestDays  = [...dayEntries].sort((a, b) => b.pnl - a.pnl).slice(0, 5)

    // ── R-Multiple distribution ───────────────────────────────────────
    // R = net_pnl / |mae|   (MAE as proxy for stop/risk taken)
    const rMultiples = sorted
      .filter(t => t.mae != null && Math.abs(t.mae) > 0.01)
      .map(t => ({ r: +(t.net_pnl / Math.abs(t.mae!)).toFixed(2), pnl: t.net_pnl }))

    const rBands = [
      { label: '< -2R', lo: -99,  hi: -2   },
      { label: '-2R',   lo: -2,   hi: -1   },
      { label: '-1R',   lo: -1,   hi: -0.5 },
      { label: '-½R',   lo: -0.5, hi: 0    },
      { label: '0-½R',  lo: 0,    hi: 0.5  },
      { label: '½-1R',  lo: 0.5,  hi: 1    },
      { label: '1-2R',  lo: 1,    hi: 2    },
      { label: '2-3R',  lo: 2,    hi: 3    },
      { label: '> 3R',  lo: 3,    hi: 99   },
    ].map(b => ({
      label: b.label,
      count: rMultiples.filter(r => r.r >= b.lo && r.r < b.hi).length,
      pos:   b.lo >= 0,
    }))

    const avgR     = rMultiples.length ? +(rMultiples.reduce((s, r) => s + r.r, 0) / rMultiples.length).toFixed(2) : 0
    const pctAbove1R = rMultiples.length ? +(rMultiples.filter(r => r.r > 1).length / rMultiples.length * 100).toFixed(0) : 0
    const pctAbove2R = rMultiples.length ? +(rMultiples.filter(r => r.r > 2).length / rMultiples.length * 100).toFixed(0) : 0

    // ── MAE vs net P&L scatter ────────────────────────────────────────
    const maeScatter = sorted
      .filter(t => t.mae != null)
      .map(t => ({ x: +Math.abs(t.mae!).toFixed(2), y: +t.net_pnl.toFixed(2) }))

    // ── Drawdown episodes ─────────────────────────────────────────────
    let cum = 0, peak = 0, ddDepth = 0, ddLen = 0
    const ddEpisodes: { idx: number; depth: number; dur: number }[] = []
    let ddActive = false, ddStartIdx = 0, ddPeak = 0

    sorted.forEach((t, i) => {
      cum += t.net_pnl
      if (cum >= peak) {
        if (ddActive) {
          ddEpisodes.push({ idx: ddStartIdx, depth: +ddDepth.toFixed(2), dur: i - ddStartIdx })
          ddActive = false; ddDepth = 0
        }
        peak = cum
      } else {
        if (!ddActive) { ddActive = true; ddStartIdx = i; ddPeak = peak }
        const depth = cum - ddPeak
        if (depth < ddDepth) ddDepth = depth
      }
    })
    if (ddActive) ddEpisodes.push({ idx: ddStartIdx, depth: +ddDepth.toFixed(2), dur: sorted.length - ddStartIdx })

    const maxDD       = ddEpisodes.length ? +Math.min(...ddEpisodes.map(e => e.depth)).toFixed(2) : 0
    const avgDDDepth  = ddEpisodes.length ? +(ddEpisodes.reduce((s, e) => s + e.depth, 0) / ddEpisodes.length).toFixed(2) : 0
    const maxDDDur    = ddEpisodes.length ? Math.max(...ddEpisodes.map(e => e.dur)) : 0
    const ddByDepth   = [...ddEpisodes].sort((a, b) => a.depth - b.depth).slice(0, 10)

    // ── Consecutive losses ────────────────────────────────────────────
    let maxStreak = 0, curStreak = 0
    for (const t of sorted) {
      if (t.net_pnl < -0.001) { curStreak++; if (curStreak > maxStreak) maxStreak = curStreak }
      else curStreak = 0
    }

    // Fee drag
    const totalFees = sorted.reduce((s, t) => s + t.fees, 0)
    const netTotal  = sorted.reduce((s, t) => s + t.net_pnl, 0)
    const grossTotal= sorted.reduce((s, t) => s + t.gross, 0)
    const feeDragPct = grossTotal !== 0 ? +(totalFees / Math.abs(grossTotal) * 100).toFixed(1) : 0

    return {
      n, wins: wins.length, losses: losses.length, winRate,
      profitFactor, avgWin, avgLoss, wlRatio,
      expectedValue, kelly, halfKelly, sharpe,
      var95, var99, dailyHist, worstDays, bestDays,
      rMultiples: rBands, avgR, pctAbove1R, pctAbove2R,
      maeScatter, ddEpisodes: ddByDepth, maxDD, avgDDDepth, maxDDDur,
      maxStreak, totalFees, feeDragPct, netTotal, grossTotal,
      dailyCount: dailyPnls.length,
    }
  }, [trades])

  if (loading) return <div className="p-8 text-center text-[#4a5266] text-sm">Cargando…</div>
  if (!data)   return <div className="p-8 text-center text-[#4a5266] text-sm">No hay trades.</div>

  const pfColor  = data.profitFactor >= 1.5 ? '#22c55e' : data.profitFactor >= 1 ? '#f59e0b' : '#ef4444'
  const pfBadge  = data.profitFactor >= 1.5 ? { text: 'BUENO', color: 'bg-[rgba(34,197,94,0.15)] text-[#22c55e]' }
                 : data.profitFactor >= 1    ? { text: 'OK',    color: 'bg-[rgba(245,158,11,0.15)] text-[#f59e0b]' }
                 :                             { text: 'RIESGO', color: 'bg-[rgba(239,68,68,0.15)] text-[#ef4444]' }

  const kellyPct = (data.kelly * 100).toFixed(1)
  const kellyColor = data.kelly > 0 ? '#22c55e' : '#ef4444'

  return (
    <div className="p-6 text-[#e8ecf2]" style={{ fontFamily: 'Inter, sans-serif' }}>
      <h1 className="text-[18px] font-semibold tracking-tight mb-5">Riesgo</h1>

      {/* ── KPI row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-5">
        <KPI
          label="Profit Factor"
          value={data.profitFactor >= 999 ? '∞' : n2(data.profitFactor)}
          color={`text-[${pfColor}]`}
          badge={pfBadge}
          sub="bruto ganado / perdido"
        />
        <KPI
          label="Win/Loss Ratio"
          value={n2(data.wlRatio)}
          color={data.wlRatio >= 1 ? 'text-[#22c55e]' : 'text-[#ef4444]'}
          sub={`$${data.avgWin} avg win`}
        />
        <KPI
          label="Expected Value"
          value={m(data.expectedValue)}
          color={clr(data.expectedValue)}
          sub="por trade"
        />
        <KPI
          label="Kelly %"
          value={`${kellyPct}%`}
          color={data.kelly > 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}
          sub={`½ Kelly: ${(data.halfKelly * 100).toFixed(1)}%`}
        />
        <KPI
          label="Sharpe (por trade)"
          value={n2(data.sharpe)}
          color={data.sharpe >= 0.5 ? 'text-[#22c55e]' : data.sharpe >= 0 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}
          sub="sin anualizar"
        />
        <KPI
          label="VaR 95% (diario)"
          value={m(data.var95)}
          color="text-[#ef4444]"
          sub={`VaR 99%: ${m(data.var99)}`}
        />
        <KPI
          label="Max Racha Negativa"
          value={`${data.maxStreak} trades`}
          color={data.maxStreak >= 5 ? 'text-[#ef4444]' : data.maxStreak >= 3 ? 'text-[#f59e0b]' : 'text-[#e8ecf2]'}
          sub="pérdidas consecutivas"
        />
      </div>

      {/* ── Row: R-Multiple + Daily P&L ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Distribución de R-Múltiplos" sub={`R = net P&L / |MAE|`}>
          <div className="flex gap-4 mb-3">
            <div className="text-center">
              <div className={`text-[15px] font-semibold font-mono ${data.avgR >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>{n2(data.avgR)}R</div>
              <div className="text-[9px] text-[#4a5266] uppercase tracking-wider">R promedio</div>
            </div>
            <div className="text-center">
              <div className="text-[15px] font-semibold font-mono text-[#22c55e]">{data.pctAbove1R}%</div>
              <div className="text-[9px] text-[#4a5266] uppercase tracking-wider">&gt; 1R</div>
            </div>
            <div className="text-center">
              <div className="text-[15px] font-semibold font-mono text-[#22c55e]">{data.pctAbove2R}%</div>
              <div className="text-[9px] text-[#4a5266] uppercase tracking-wider">&gt; 2R</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.rMultiples} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1e2434" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#a4abbe', fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6d7589', fontSize: 10 }} tickLine={false} axisLine={false} width={22} />
              <Tooltip {...TT_STYLE} formatter={(v: unknown) => [`${v}`, 'trades']} />
              <ReferenceLine x="0-½R" stroke="#2f384c" />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {data.rMultiples.map((d, i) => (
                  <Cell key={i} fill={d.pos ? '#22c55e' : '#ef4444'} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Distribución P&L diario" sub={`${data.dailyCount} días operados`}>
          <div className="flex gap-4 mb-3">
            <div className="text-center">
              <div className="text-[15px] font-semibold font-mono text-[#ef4444]">{m(data.var95)}</div>
              <div className="text-[9px] text-[#4a5266] uppercase tracking-wider">VaR 95%</div>
            </div>
            <div className="text-center">
              <div className="text-[15px] font-semibold font-mono text-[#ef4444]">{m(data.var99)}</div>
              <div className="text-[9px] text-[#4a5266] uppercase tracking-wider">VaR 99%</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.dailyHist} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1e2434" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#6d7589', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => '$' + v}
              />
              <YAxis tick={{ fill: '#6d7589', fontSize: 10 }} tickLine={false} axisLine={false} width={22} />
              <Tooltip {...TT_STYLE} formatter={(v: unknown) => [`${v}`, 'días']} labelFormatter={v => `~$${v}`} />
              <ReferenceLine x={0} stroke="#2f384c" />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {data.dailyHist.map((d, i) => (
                  <Cell key={i} fill={d.pos ? '#22c55e' : '#ef4444'} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* ── MAE vs P&L scatter ───────────────────────────────── */}
      <div className="mb-4">
        <Panel title="MAE vs Net P&L — ¿cuánto riesgo tomaste vs qué obtuviste?" sub="cada punto = 1 trade">
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1e2434" />
              <XAxis
                type="number"
                dataKey="x"
                name="MAE (abs)"
                tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => '$' + v}
                label={{ value: 'MAE ($)', position: 'insideBottomRight', offset: -4, fill: '#4a5266', fontSize: 10 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Net P&L"
                tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => '$' + v}
                width={55}
              />
              <ZAxis range={[20, 20]} />
              <Tooltip
                {...TT_STYLE}
                cursor={{ stroke: '#2f384c' }}
                formatter={(v: unknown, name: unknown) => [`$${(v as number).toFixed(2)}`, String(name)]}
              />
              <ReferenceLine y={0} stroke="#2f384c" />
              <Scatter
                data={data.maeScatter}
                fill="#f59e0b"
                fillOpacity={0.5}
              >
                {data.maeScatter.map((d, i) => (
                  <Cell key={i} fill={d.y >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.45} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* ── Drawdown episodes + Worst/Best days ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Episodios de drawdown (top 10 por profundidad)" sub={`${data.ddEpisodes.length} mostrados`}>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center">
              <div className="text-[14px] font-semibold font-mono text-[#ef4444]">{m(data.maxDD)}</div>
              <div className="text-[9px] text-[#4a5266] uppercase tracking-wider">Max DD</div>
            </div>
            <div className="text-center">
              <div className="text-[14px] font-semibold font-mono text-[#f59e0b]">{m(data.avgDDDepth)}</div>
              <div className="text-[9px] text-[#4a5266] uppercase tracking-wider">Avg DD</div>
            </div>
            <div className="text-center">
              <div className="text-[14px] font-semibold font-mono text-[#e8ecf2]">{data.maxDDDur}</div>
              <div className="text-[9px] text-[#4a5266] uppercase tracking-wider">Max duración (trades)</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={data.ddEpisodes}
              layout="vertical"
              margin={{ top: 2, right: 40, left: 0, bottom: 2 }}
            >
              <CartesianGrid stroke="#1e2434" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: '#6d7589', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => '$' + v}
              />
              <YAxis type="category" dataKey="idx" tick={false} axisLine={false} tickLine={false} width={4} />
              <Tooltip
                {...TT_STYLE}
                formatter={(v: unknown, name: unknown) =>
                  name === 'depth' ? [m(v as number), 'Profundidad'] : [`${v} trades`, 'Duración']
                }
              />
              <Bar dataKey="depth" fill="#ef4444" fillOpacity={0.65} radius={[0, 3, 3, 0]} name="depth" label={{ position: 'right', fill: '#6d7589', fontSize: 9, fontFamily: 'JetBrains Mono, monospace', formatter: (v: unknown) => m(v as number) }} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <div className="flex flex-col gap-4">
          {/* Worst days */}
          <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-4 flex-1">
            <div className="text-[11px] font-semibold text-[#a4abbe] mb-2">5 peores días</div>
            <div className="space-y-1.5">
              {data.worstDays.map(d => (
                <div key={d.date} className="flex justify-between items-center">
                  <span className="text-[11px] font-mono text-[#6d7589]">{d.date}</span>
                  <span className="text-[12px] font-semibold font-mono text-[#ef4444]">{m(d.pnl)}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Best days */}
          <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-4 flex-1">
            <div className="text-[11px] font-semibold text-[#a4abbe] mb-2">5 mejores días</div>
            <div className="space-y-1.5">
              {data.bestDays.map(d => (
                <div key={d.date} className="flex justify-between items-center">
                  <span className="text-[11px] font-mono text-[#6d7589]">{d.date}</span>
                  <span className="text-[12px] font-semibold font-mono text-[#22c55e]">{m(d.pnl)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Risk Parameters summary ───────────────────────────── */}
      <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5">
        <div className="text-[12px] font-semibold text-[#a4abbe] mb-4">Parámetros de riesgo — resumen</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0 divide-y divide-[#1a1f2e] sm:divide-y-0">
          {[
            { label: 'Win Rate',            value: `${(data.winRate * 100).toFixed(1)}%`,           pct: data.winRate * 100,         color: '#22c55e' },
            { label: 'Avg Win',             value: m(data.avgWin),                                   pct: Math.min(100, data.avgWin / 2),  color: '#22c55e' },
            { label: 'Avg Loss',            value: m(-data.avgLoss),                                 pct: Math.min(100, data.avgLoss / 2), color: '#ef4444' },
            { label: 'Profit Factor',       value: data.profitFactor >= 999 ? '∞' : n2(data.profitFactor), pct: Math.min(100, data.profitFactor / 3 * 100), color: pfColor },
            { label: 'Win/Loss Ratio',      value: n2(data.wlRatio),                                 pct: Math.min(100, data.wlRatio / 3 * 100), color: data.wlRatio >= 1 ? '#22c55e' : '#ef4444' },
            { label: 'Expected Value',      value: m(data.expectedValue),                            pct: 50,                           color: data.expectedValue >= 0 ? '#22c55e' : '#ef4444' },
            { label: 'Kelly Criterion',     value: `${kellyPct}%`,                                   pct: Math.max(0, Math.min(100, data.kelly * 100 * 2)), color: kellyColor },
            { label: '½ Kelly (recomend.)', value: `${(data.halfKelly * 100).toFixed(1)}%`,         pct: Math.max(0, Math.min(100, data.halfKelly * 100 * 2)), color: '#f59e0b' },
            { label: 'Sharpe (por trade)',  value: n2(data.sharpe),                                  pct: Math.min(100, Math.max(0, (data.sharpe + 1) / 2 * 100)), color: data.sharpe >= 0 ? '#22c55e' : '#ef4444' },
            { label: 'VaR 95% diario',      value: m(data.var95),                                   pct: 0,                            color: '#ef4444' },
            { label: 'VaR 99% diario',      value: m(data.var99),                                   pct: 0,                            color: '#ef4444' },
            { label: 'Fee Drag',            value: `${data.feeDragPct}%`,                           pct: Math.min(100, data.feeDragPct * 5), color: data.feeDragPct > 10 ? '#ef4444' : '#f59e0b' },
          ].map(row => (
            <div key={row.label} className="py-2.5 border-b border-[#1a1f2e] last:border-0">
              <div className="flex justify-between mb-1">
                <span className="text-[11px] text-[#6d7589]">{row.label}</span>
                <span className="text-[12px] font-semibold font-mono" style={{ color: row.color }}>{row.value}</span>
              </div>
              {gauge(row.pct, row.color)}
            </div>
          ))}
        </div>

        {/* Fee drag detail */}
        <div className="mt-4 pt-4 border-t border-[#1a1f2e] flex flex-wrap gap-6 text-[11px] font-mono">
          <span className="text-[#6d7589]">Bruto total: <span className="text-[#e8ecf2]">{m(data.grossTotal)}</span></span>
          <span className="text-[#6d7589]">Fees totales: <span className="text-[#ef4444]">{m(-data.totalFees)}</span></span>
          <span className="text-[#6d7589]">Neto total: <span className={clr(data.netTotal)}>{m(data.netTotal)}</span></span>
          <span className="text-[#6d7589]">Fee drag: <span className="text-[#f59e0b]">{data.feeDragPct}% del bruto</span></span>
        </div>
      </div>
    </div>
  )
}
