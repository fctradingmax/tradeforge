'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Cell,
} from 'recharts'

interface Trade { id: string; net_pnl: number }

function m(v: number) { return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2) }
function clr(v: number) { return v >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]' }

const TT: React.ComponentProps<typeof ComposedChart>['margin'] = undefined
const TT_STYLE = {
  contentStyle: {
    background: '#11151f', border: '1px solid #232a3a',
    borderRadius: 6, fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
  },
  labelStyle: { color: '#a4abbe', marginBottom: 2 },
  itemStyle:  { color: '#e8ecf2' },
}

function pct(sorted: number[], p: number) {
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p / 100 * (sorted.length - 1))))
  return sorted[idx]
}

function runMC(returns: number[], nSims: number, nTrades: number, seed: number) {
  const n = returns.length
  // seedable LCG for reproducibility on re-run with same seed
  let s = seed >>> 0
  function rand() {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 0xffffffff
  }

  // Accumulate percentiles at each step without storing all paths
  const steps = nTrades + 1
  const allVals: number[][] = Array.from({ length: steps }, () => [])

  for (let sim = 0; sim < nSims; sim++) {
    let cum = 0
    allVals[0].push(0)
    for (let t = 0; t < nTrades; t++) {
      cum += returns[Math.floor(rand() * n)]
      allVals[t + 1].push(cum)
    }
  }

  const chart = allVals.map((vals, i) => {
    const sorted = [...vals].sort((a, b) => a - b)
    return {
      trade: i,
      p5:   +pct(sorted, 5).toFixed(2),
      p25:  +pct(sorted, 25).toFixed(2),
      p50:  +pct(sorted, 50).toFixed(2),
      p75:  +pct(sorted, 75).toFixed(2),
      p95:  +pct(sorted, 95).toFixed(2),
    }
  })

  // Final equity distribution histogram
  const finals = allVals[nTrades].sort((a, b) => a - b)
  const fMin = finals[0], fMax = finals[finals.length - 1]
  const bSize  = (fMax - fMin) / 30 || 1
  const distMap: Record<number, number> = {}
  for (const v of finals) {
    const b = Math.floor((v - fMin) / bSize)
    distMap[b] = (distMap[b] ?? 0) + 1
  }
  const dist = Object.entries(distMap).map(([b, count]) => ({
    label: +(fMin + (+b) * bSize).toFixed(0),
    count,
    pos: fMin + (+b) * bSize >= 0,
  })).sort((a, b) => a.label - b.label)

  const probProfit = finals.filter(v => v > 0).length / nSims
  const p5Final    = +pct(finals, 5).toFixed(2)
  const p50Final   = +pct(finals, 50).toFixed(2)
  const p95Final   = +pct(finals, 95).toFixed(2)
  const maxDD = Math.min(...chart.map(d => d.p5))

  return { chart, dist, probProfit, p5Final, p50Final, p95Final, maxDD }
}

function StatCard({ label, value, color = 'text-[#e8ecf2]', sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="bg-[#11151f] border border-[#232a3a] rounded-lg px-4 py-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#6d7589] mb-1">{label}</div>
      <div className={`text-[15px] font-semibold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#4a5266] mt-0.5 font-mono">{sub}</div>}
    </div>
  )
}

const N_TRADES_OPTS = [50, 100, 200, 500]
const N_SIMS_OPTS   = [500, 1000, 5000]

export default function MonteCarloPage() {
  const [trades, setTrades]   = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [nTrades, setNTrades] = useState(100)
  const [nSims,   setNSims]   = useState(1000)
  const [seed,    setSeed]    = useState(() => Date.now() >>> 0)

  useEffect(() => {
    fetch('/api/trades')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setTrades(d) })
      .finally(() => setLoading(false))
  }, [])

  const rerun = useCallback(() => setSeed(Date.now() >>> 0), [])

  const returns = useMemo(() => trades.map(t => t.net_pnl), [trades])

  const result = useMemo(() => {
    if (!returns.length) return null
    return runMC(returns, nSims, nTrades, seed)
  }, [returns, nSims, nTrades, seed])

  if (loading) return <div className="p-8 text-center text-[#4a5266] text-sm">Cargando…</div>
  if (!result)  return <div className="p-8 text-center text-[#4a5266] text-sm">No hay trades.</div>

  const { chart, dist, probProfit, p5Final, p50Final, p95Final, maxDD } = result

  const probColor = probProfit >= 0.6 ? '#22c55e' : probProfit >= 0.45 ? '#f59e0b' : '#ef4444'

  return (
    <div className="p-6 text-[#e8ecf2]" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[18px] font-semibold tracking-tight">Monte Carlo</h1>
        <div className="flex items-center gap-2.5">
          {/* N trades */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#6d7589] uppercase tracking-wider">Trades:</span>
            <div className="flex rounded-md overflow-hidden border border-[#232a3a]">
              {N_TRADES_OPTS.map(v => (
                <button
                  key={v}
                  onClick={() => setNTrades(v)}
                  className={`px-2.5 py-1.5 text-xs transition-colors ${nTrades === v ? 'bg-[#f59e0b] text-[#0b0e16] font-semibold' : 'bg-[#11151f] text-[#6d7589] hover:text-[#a4abbe]'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          {/* N sims */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#6d7589] uppercase tracking-wider">Sims:</span>
            <div className="flex rounded-md overflow-hidden border border-[#232a3a]">
              {N_SIMS_OPTS.map(v => (
                <button
                  key={v}
                  onClick={() => setNSims(v)}
                  className={`px-2.5 py-1.5 text-xs transition-colors ${nSims === v ? 'bg-[#f59e0b] text-[#0b0e16] font-semibold' : 'bg-[#11151f] text-[#6d7589] hover:text-[#a4abbe]'}`}
                >
                  {v.toLocaleString('en-US')}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={rerun}
            className="px-3 py-1.5 rounded-md bg-[#161b28] border border-[#232a3a] text-xs text-[#a4abbe] hover:text-[#e8ecf2] hover:border-[#2f384c] transition-colors"
          >
            ↺ Re-run
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-5">
        <StatCard
          label="Prob. de profit"
          value={`${(probProfit * 100).toFixed(1)}%`}
          color={probProfit >= 0.5 ? 'text-[#22c55e]' : 'text-[#ef4444]'}
          sub={`en ${nTrades} trades`}
        />
        <StatCard
          label="Mediana (p50)"
          value={m(p50Final)}
          color={clr(p50Final)}
          sub="resultado esperado"
        />
        <StatCard
          label="Mejor caso (p95)"
          value={m(p95Final)}
          color="text-[#22c55e]"
          sub="5% de las sims"
        />
        <StatCard
          label="Peor caso (p5)"
          value={m(p5Final)}
          color="text-[#ef4444]"
          sub="5% de las sims"
        />
        <StatCard
          label="Drawdown máx (p5)"
          value={m(maxDD)}
          color="text-[#ef4444]"
          sub="worst path floor"
        />
      </div>

      {/* Fan chart */}
      <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] font-semibold text-[#a4abbe]">Distribución de caminos — {nSims.toLocaleString('en-US')} simulaciones</span>
          <div className="flex items-center gap-4 text-[10px] font-mono">
            <span className="flex items-center gap-1.5"><span className="w-6 h-[1px] border-t-2 border-dashed border-[#22c55e] inline-block" />p95</span>
            <span className="flex items-center gap-1.5"><span className="w-6 h-[1px] border-t border-[#4ade80] inline-block" />p75</span>
            <span className="flex items-center gap-1.5"><span className="w-6 h-0.5 bg-[#f59e0b] inline-block" />Mediana</span>
            <span className="flex items-center gap-1.5"><span className="w-6 h-[1px] border-t border-[#f87171] inline-block" />p25</span>
            <span className="flex items-center gap-1.5"><span className="w-6 h-[1px] border-t-2 border-dashed border-[#ef4444] inline-block" />p5</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1e2434" vertical={false} />
            <XAxis
              dataKey="trade"
              tick={{ fill: '#6d7589', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              label={{ value: 'Trade #', position: 'insideBottomRight', offset: -4, fill: '#4a5266', fontSize: 10 }}
            />
            <YAxis
              tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => '$' + v}
              width={60}
            />
            <Tooltip
              {...TT_STYLE}
              formatter={(v: unknown, name: unknown) => [m(v as number), name as string]}
              labelFormatter={v => `Trade #${v}`}
            />
            <ReferenceLine y={0} stroke="#2f384c" />
            <Line dataKey="p95" name="p95" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            <Line dataKey="p75" name="p75" stroke="#4ade80" strokeWidth={1.2} dot={false} />
            <Line dataKey="p50" name="Mediana" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
            <Line dataKey="p25" name="p25" stroke="#f87171" strokeWidth={1.2} dot={false} />
            <Line dataKey="p5"  name="p5"  stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Final distribution histogram */}
      <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] font-semibold text-[#a4abbe]">Distribución del equity final (trade #{nTrades})</span>
          <span className="text-[10px] text-[#4a5266] font-mono">{nSims.toLocaleString('en-US')} caminos</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={dist} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1e2434" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#6d7589', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => '$' + v}
            />
            <YAxis tick={{ fill: '#6d7589', fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
            <Tooltip
              {...TT_STYLE}
              formatter={(v: unknown) => [`${v}`, 'sims']}
              labelFormatter={v => `~$${v}`}
            />
            <ReferenceLine x={0} stroke="#2f384c" />
            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
              {dist.map((d, i) => (
                <Cell key={i} fill={d.pos ? '#22c55e' : '#ef4444'} fillOpacity={0.7} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Context note */}
      <div className="bg-[#0d1117] border border-[#1a1f2e] rounded-lg px-4 py-3">
        <div className="flex gap-3 items-start">
          <span className="text-[#f59e0b] text-sm mt-0.5">ℹ</span>
          <p className="text-[11px] text-[#6d7589] leading-relaxed">
            Bootstrap resampling con reemplazo sobre <strong className="text-[#a4abbe]">{returns.length} trades históricos</strong>.
            Cada simulación toma muestras aleatorias del historial de P&L para proyectar {nTrades} trades futuros.
            No asume distribución normal — preserva la distribución real incluyendo outliers y racha behavior.
            Los resultados cambian con cada re-run por la naturaleza aleatoria; aumentar las sims reduce la varianza de los percentiles.
          </p>
        </div>
      </div>
    </div>
  )
}
