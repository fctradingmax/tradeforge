'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ReferenceLine, Legend,
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
  n_fills: number | null
  mae: number | null
  mfe: number | null
  setup: string | null
}

function m(v: number)    { return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2) }
function clr(v: number)  { return v >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]' }
function fill(v: number) { return v >= 0 ? '#22c55e' : '#ef4444' }

const TT: React.ComponentProps<typeof Tooltip> = {
  contentStyle: {
    background: '#11151f', border: '1px solid #232a3a',
    borderRadius: 6, fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
  },
  labelStyle: { color: '#a4abbe', marginBottom: 2 },
  itemStyle:  { color: '#e8ecf2' },
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

function StatCard({ label, value, color = 'text-[#e8ecf2]', sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="bg-[#11151f] border border-[#232a3a] rounded-lg px-4 py-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#6d7589] mb-1">{label}</div>
      <div className={`text-[15px] font-semibold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#4a5266] mt-0.5 font-mono">{sub}</div>}
    </div>
  )
}

export default function AnalyticsPage() {
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

    // ── Equity + Drawdown ───────────────────────────────────────────────
    let cum = 0, peak = 0
    const equityDD = sorted.map((t, i) => {
      cum += t.net_pnl
      if (cum > peak) peak = cum
      return {
        idx: i + 1,
        equity:   +cum.toFixed(2),
        drawdown: +(cum - peak).toFixed(2),
      }
    })
    const maxDD   = Math.min(...equityDD.map(d => d.drawdown))
    const finalEq = equityDD[equityDD.length - 1]?.equity ?? 0

    // ── MAE / MFE ──────────────────────────────────────────────────────
    const hasMae = sorted.filter(t => t.mae != null)
    const hasMfe = sorted.filter(t => t.mfe != null)

    const avgMae = hasMae.length ? hasMae.reduce((s, t) => s + Math.abs(t.mae!), 0) / hasMae.length : 0
    const avgMfe = hasMfe.length ? hasMfe.reduce((s, t) => s + t.mfe!, 0) / hasMfe.length : 0

    // Avg MAE/MFE split by outcome
    const avgMaeW = wins.filter(t=>t.mae!=null).reduce((s,t)=>s+Math.abs(t.mae!),0) / (wins.filter(t=>t.mae!=null).length||1)
    const avgMaeL = losses.filter(t=>t.mae!=null).reduce((s,t)=>s+Math.abs(t.mae!),0) / (losses.filter(t=>t.mae!=null).length||1)
    const avgMfeW = wins.filter(t=>t.mfe!=null).reduce((s,t)=>s+t.mfe!,0) / (wins.filter(t=>t.mfe!=null).length||1)
    const avgMfeL = losses.filter(t=>t.mfe!=null).reduce((s,t)=>s+t.mfe!,0) / (losses.filter(t=>t.mfe!=null).length||1)

    // "Escape" trades: won but had MAE > $10
    const escapes   = wins.filter(t => Math.abs(t.mae ?? 0) > 10).length
    // "Left on table": won but MFE was 2× larger than net P&L
    const leftTable = wins.filter(t => (t.mfe ?? 0) > t.net_pnl * 2).length

    // MAE histogram — extend range to cover max abs(MAE), buckets of $10
    const maxMaeAbs = hasMae.length ? Math.ceil(Math.max(...hasMae.map(t => Math.abs(t.mae!))) / 10) * 10 : 100
    const maeBuckets = Array.from({ length: Math.max(10, maxMaeAbs / 10) }, (_, i) => i * 10).map(lo => {
      const hi = lo + 10
      const n  = hasMae.filter(t => { const v = Math.abs(t.mae!); return v >= lo && v < hi }).length
      return { label: `$${lo}`, count: n }
    })

    // MFE histogram (buckets of $5)
    const mfeBuckets = Array.from({ length: 11 }, (_, i) => i * 5).map(lo => {
      const hi = lo + 5
      const n  = hasMfe.filter(t => { const v = t.mfe!; return v >= lo && v < hi }).length
      return { label: `$${lo}`, count: n }
    })

    // ── Rolling 10-trade window ────────────────────────────────────────
    const ROLL = 10
    const rolling = sorted.slice(ROLL - 1).map((_, i) => {
      const w    = sorted.slice(i, i + ROLL)
      const wWin = w.filter(t => t.net_pnl > 0.001)
      return {
        idx: i + ROLL,
        wr:  +(wWin.length / ROLL * 100).toFixed(1),
        avg: +(w.reduce((s, t) => s + t.net_pnl, 0) / ROLL).toFixed(2),
      }
    })

    // ── Consecutive trade analysis ────────────────────────────────────
    const afterW: number[]  = []
    const afterL: number[]  = []
    const after2L: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], curr = sorted[i]
      if (prev.net_pnl >  0.001) afterW.push(curr.net_pnl)
      if (prev.net_pnl < -0.001) afterL.push(curr.net_pnl)
      if (i >= 2 && sorted[i - 2].net_pnl < -0.001 && prev.net_pnl < -0.001)
        after2L.push(curr.net_pnl)
    }
    const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
    const wr  = (arr: number[]) => arr.length ? arr.filter(v => v > 0.001).length / arr.length : 0

    // ── Position size buckets ─────────────────────────────────────────
    const sizeBands = [
      { label: '1-10',    lo: 1,   hi: 11   },
      { label: '11-25',   lo: 11,  hi: 26   },
      { label: '26-50',   lo: 26,  hi: 51   },
      { label: '51-100',  lo: 51,  hi: 101  },
      { label: '101-200', lo: 101, hi: 201  },
      { label: '200+',    lo: 201, hi: 99999},
    ].map(b => {
      const ts   = sorted.filter(t => t.max_size && t.max_size >= b.lo && t.max_size < b.hi)
      const wTs  = ts.filter(t => t.net_pnl > 0.001)
      return {
        label: b.label,
        count: ts.length,
        avg:   ts.length ? +(ts.reduce((s, t) => s + t.net_pnl, 0) / ts.length).toFixed(2) : 0,
        wr:    ts.length ? Math.round(wTs.length / ts.length * 100) : 0,
      }
    }).filter(b => b.count > 0)

    // ── Symbol concentration ──────────────────────────────────────────
    const symMap: Record<string, { net: number; count: number; wins: number }> = {}
    for (const t of sorted) {
      if (!symMap[t.symbol]) symMap[t.symbol] = { net: 0, count: 0, wins: 0 }
      symMap[t.symbol].net   += t.net_pnl
      symMap[t.symbol].count += 1
      if (t.net_pnl > 0.001) symMap[t.symbol].wins++
    }
    const topSymbols = Object.entries(symMap)
      .map(([s, d]) => ({ symbol: s, count: d.count, net: +d.net.toFixed(2), wr: Math.round(d.wins / d.count * 100), avg: +(d.net / d.count).toFixed(2) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)

    return {
      equityDD, finalEq, maxDD,
      avgMae, avgMfe, avgMaeW, avgMaeL, avgMfeW, avgMfeL,
      escapes, leftTable, maeBuckets, mfeBuckets,
      rolling,
      afterW: { avg: avg(afterW), wr: wr(afterW), n: afterW.length },
      afterL: { avg: avg(afterL), wr: wr(afterL), n: afterL.length },
      after2L:{ avg: avg(after2L), wr: wr(after2L), n: after2L.length },
      sizeBands, topSymbols,
      total: sorted.length, wins: wins.length, losses: losses.length,
    }
  }, [trades])

  if (loading) return <div className="p-8 text-center text-[#4a5266] text-sm">Cargando…</div>
  if (!data)   return <div className="p-8 text-center text-[#4a5266] text-sm">No hay trades.</div>

  return (
    <div className="p-6 text-[#e8ecf2]" style={{ fontFamily: 'Inter, sans-serif' }}>
      <h1 className="text-[18px] font-semibold tracking-tight mb-5">Analytics</h1>

      {/* ── 1. Equity + Drawdown ───────────────────────────── */}
      <div className="mb-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6d7589] mb-3">Curva de equity y drawdown</h2>
        <div className="grid grid-cols-3 gap-2.5 mb-3">
          <StatCard label="Equity final"  value={m(data.finalEq)} color={clr(data.finalEq)} />
          <StatCard label="Max Drawdown"  value={m(data.maxDD)}   color="text-[#ef4444]" />
          <StatCard label="Total trades"  value={String(data.total)} />
        </div>
        <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5">
          <div className="text-[11px] font-semibold text-[#a4abbe] mb-2">P&L acumulado</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data.equityDD} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#f59e0b" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e2434" vertical={false} />
              <XAxis dataKey="idx" tick={{ fill: '#6d7589', fontSize: 9 }} tickLine={false} axisLine={false} interval={Math.floor(data.total / 8)} />
              <YAxis tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} tickFormatter={v => '$' + v} width={55} />
              <Tooltip {...TT} formatter={(v: unknown) => [m(v as number), 'Acum.']} labelFormatter={v => `Trade #${v}`} />
              <ReferenceLine y={0} stroke="#2f384c" />
              <Area type="monotone" dataKey="equity" stroke="#f59e0b" strokeWidth={2} fill="url(#eqGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="text-[11px] font-semibold text-[#a4abbe] mt-4 mb-2">Drawdown desde pico</div>
          <ResponsiveContainer width="100%" height={100}>
            <AreaChart data={data.equityDD} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e2434" vertical={false} />
              <XAxis dataKey="idx" tick={false} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} tickFormatter={v => '$' + v} width={55} />
              <Tooltip {...TT} formatter={(v: unknown) => [m(v as number), 'Drawdown']} labelFormatter={v => `Trade #${v}`} />
              <Area type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={1.5} fill="url(#ddGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 2. MAE / MFE ─────────────────────────────────────────── */}
      <div className="mb-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6d7589] mb-3">MAE / MFE — excursión adversa y favorable</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
          <StatCard label="Avg MAE (todos)"      value={`-$${data.avgMae.toFixed(2)}`}  color="text-[#ef4444]" />
          <StatCard label="Avg MAE (ganadores)"  value={`-$${data.avgMaeW.toFixed(2)}`} color="text-[#ef4444]" sub="adversidad antes de ganar" />
          <StatCard label="Avg MFE (todos)"      value={`+$${data.avgMfe.toFixed(2)}`}  color="text-[#22c55e]" />
          <StatCard label="Avg MFE (perdedores)" value={`+$${data.avgMfeL.toFixed(2)}`} color="text-[#f59e0b]" sub="potencial antes de perder" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <StatCard label="Trades 'escape' (ganó con MAE > $10)" value={String(data.escapes)}   color="text-[#f59e0b]" sub={`${((data.escapes / data.wins) * 100).toFixed(0)}% de ganadores`} />
          <StatCard label="Potencial dejado (MFE > 2× net P&L)"  value={String(data.leftTable)} color="text-[#f59e0b]" sub={`${((data.leftTable / data.wins) * 100).toFixed(0)}% de ganadores`} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Distribución de MAE (excursión adversa)" sub="buckets de $10">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.maeBuckets} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1e2434" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#6d7589', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#6d7589', fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
                <Tooltip {...TT} formatter={(v: unknown) => [`${v}`, 'trades']} />
                <Bar dataKey="count" fill="#ef4444" fillOpacity={0.65} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="Distribución de MFE (excursión favorable)" sub="buckets de $5">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.mfeBuckets} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1e2434" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#6d7589', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#6d7589', fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
                <Tooltip {...TT} formatter={(v: unknown) => [`${v}`, 'trades']} />
                <Bar dataKey="count" fill="#22c55e" fillOpacity={0.65} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>

      {/* ── 3. Rolling performance ─────────────────────────────── */}
      <div className="mb-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6d7589] mb-3">Rendimiento rolling (ventana de 10 trades)</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Win rate rolling 10">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data.rolling} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1e2434" vertical={false} />
                <XAxis dataKey="idx" tick={{ fill: '#6d7589', fontSize: 9 }} tickLine={false} axisLine={false} interval={Math.floor(data.rolling.length / 6)} />
                <YAxis tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} tickFormatter={v => v + '%'} width={36} domain={[0, 100]} />
                <Tooltip {...TT} formatter={(v: unknown) => [`${v}%`, 'Win Rate']} labelFormatter={v => `Trade #${v}`} />
                <ReferenceLine y={50} stroke="#2f384c" strokeDasharray="4 2" />
                <Line type="monotone" dataKey="wr" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="P&L promedio rolling 10">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data.rolling} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1e2434" vertical={false} />
                <XAxis dataKey="idx" tick={{ fill: '#6d7589', fontSize: 9 }} tickLine={false} axisLine={false} interval={Math.floor(data.rolling.length / 6)} />
                <YAxis tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} tickFormatter={v => '$' + v} width={50} />
                <Tooltip {...TT} formatter={(v: unknown) => [m(v as number), 'Avg P&L']} labelFormatter={v => `Trade #${v}`} />
                <ReferenceLine y={0} stroke="#2f384c" />
                <Line type="monotone" dataKey="avg" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>

      {/* ── 4. Consecutive trade analysis ────────────────────────── */}
      <div className="mb-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6d7589] mb-3">Análisis de trades consecutivos (detección de tilt)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Tras un ganador', sub: `n = ${data.afterW.n}`, avg: data.afterW.avg, wr: data.afterW.wr, note: 'Sobreconfianza' },
            { label: 'Tras un perdedor', sub: `n = ${data.afterL.n}`, avg: data.afterL.avg, wr: data.afterL.wr, note: 'Potencial revenge' },
            { label: 'Tras 2 perdedores', sub: `n = ${data.after2L.n}`, avg: data.after2L.avg, wr: data.after2L.wr, note: 'Tilt severo' },
          ].map(c => (
            <div key={c.label} className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5">
              <div className="text-[11px] font-semibold text-[#a4abbe] mb-1">{c.label}</div>
              <div className="text-[10px] text-[#4a5266] mb-3 font-mono">{c.sub}</div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-[#6d7589]">Avg P&L</span>
                  <span className={`text-sm font-semibold font-mono ${clr(c.avg)}`}>{m(c.avg)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-[#6d7589]">Win Rate</span>
                  <span className="text-sm font-semibold font-mono text-[#e8ecf2]">{(c.wr * 100).toFixed(0)}%</span>
                </div>
                <div className="mt-3 pt-2 border-t border-[#1a1f2e]">
                  <div className={`text-[10px] font-medium px-2 py-1 rounded text-center ${c.avg < 0 ? 'bg-[rgba(239,68,68,0.1)] text-[#ef4444]' : 'bg-[rgba(34,197,94,0.1)] text-[#22c55e]'}`}>
                    {c.avg < -1 ? `⚠ ${c.note}` : '✓ Sin señal negativa'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 5. Position size analysis ──────────────────────────── */}
      <div className="mb-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6d7589] mb-3">Rendimiento por tamaño de posición</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Avg P&L por banda de tamaño (shares)">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={data.sizeBands} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1e2434" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#a4abbe', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} tickFormatter={v => '$' + v} width={50} />
                <Tooltip {...TT} formatter={(v: unknown, name: unknown) => [name === 'avg' ? m(v as number) : `${v}%`, name === 'avg' ? 'Avg P&L' : 'Win Rate']} />
                <ReferenceLine y={0} stroke="#2f384c" />
                <Bar dataKey="avg" name="avg" radius={[3, 3, 0, 0]}>
                  {data.sizeBands.map((d, i) => <Cell key={i} fill={fill(d.avg)} fillOpacity={0.75} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="Win rate por banda de tamaño">
            <div className="space-y-2.5">
              {data.sizeBands.map(b => (
                <div key={b.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#a4abbe] font-mono">{b.label} sh</span>
                    <span className="text-[#6d7589]">{b.count} trades · {b.wr}% WR · avg {m(b.avg)}</span>
                  </div>
                  <div className="h-2 bg-[#1a1f2e] rounded overflow-hidden">
                    <div className={`h-full rounded ${b.wr >= 50 ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`} style={{ width: `${b.wr}%`, opacity: 0.7 }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* ── 6. Symbol concentration ───────────────────────────── */}
      <div className="mb-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6d7589] mb-3">Concentración por símbolo (top 12 por volumen)</h2>
        <div className="bg-[#11151f] border border-[#232a3a] rounded-xl overflow-hidden">
          <table className="w-full border-collapse" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
            <thead>
              <tr className="bg-[#161b28] border-b border-[#2f384c] text-[#6d7589] text-[10px] uppercase tracking-[0.08em]" style={{ fontFamily: 'Inter, sans-serif' }}>
                <th className="px-4 py-2.5 text-left">Símbolo</th>
                <th className="px-4 py-2.5 text-center">Trades</th>
                <th className="px-4 py-2.5 text-center">Win %</th>
                <th className="px-4 py-2.5 text-right">Avg P&L</th>
                <th className="px-4 py-2.5 text-right">Net P&L</th>
                <th className="px-4 py-2.5 text-right">% del total</th>
              </tr>
            </thead>
            <tbody>
              {data.topSymbols.map(s => (
                <tr key={s.symbol} className="border-b border-[#1a1f2e] hover:bg-[#161b28] transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="inline-block px-2 py-0.5 border border-[#2f384c] rounded text-[11px] font-bold text-[#e8ecf2]">{s.symbol}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-[#a4abbe]">{s.count}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${s.wr >= 50 ? 'text-[#22c55e] bg-[rgba(34,197,94,0.1)]' : 'text-[#ef4444] bg-[rgba(239,68,68,0.1)]'}`}>
                      {s.wr}%
                    </span>
                  </td>
                  <td className={`px-4 py-2.5 text-right ${s.avg >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>{m(s.avg)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${s.net >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>{m(s.net)}</td>
                  <td className="px-4 py-2.5 text-right text-[#6d7589]">{((s.count / data.total) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
