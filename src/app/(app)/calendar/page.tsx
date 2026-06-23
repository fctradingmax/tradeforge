'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'

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

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function fmt(v: number) { return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2) }

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getSundayOf(d: Date): Date {
  const n = new Date(d)
  n.setDate(n.getDate() - n.getDay())
  n.setHours(0, 0, 0, 0)
  return n
}

export default function CalendarPage() {
  const router = useRouter()
  const [trades, setTrades]       = useState<Trade[]>([])
  const [loading, setLoading]     = useState(true)
  const [view, setView]           = useState<'month' | 'week'>('month')
  const [curYear, setCurYear]     = useState(() => new Date().getFullYear())
  const [curMonth, setCurMonth]   = useState(() => new Date().getMonth())
  const [weekStart, setWeekStart] = useState<Date>(() => getSundayOf(new Date()))

  useEffect(() => {
    fetch('/api/trades').then(r => r.json()).then(t => {
      if (Array.isArray(t)) setTrades(t)
    }).finally(() => setLoading(false))
  }, [])

  const byDate = useMemo(() => {
    const map: Record<string, Trade[]> = {}
    for (const t of trades) {
      if (!t.date) continue
      if (!map[t.date]) map[t.date] = []
      map[t.date].push(t)
    }
    return map
  }, [trades])

  // ── Monthly ───────────────────────────────────────────────────────────────

  function monthDateStr(day: number) {
    return `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const cells = useMemo(() => {
    const firstDay    = new Date(curYear, curMonth, 1).getDay()
    const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate()
    const arr: (number | null)[] = Array(firstDay).fill(null)
    for (let i = 1; i <= daysInMonth; i++) arr.push(i)
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [curYear, curMonth])

  // Group cells into week rows, each with a pre-computed total
  const weekRows = useMemo(() => {
    const rows = []
    for (let r = 0; r < cells.length / 7; r++) {
      const days = cells.slice(r * 7, (r + 1) * 7)
      let net = 0, hasTrades = false, tradingDays = 0, winDays = 0, lossDays = 0, tradeCount = 0
      for (const day of days) {
        if (!day) continue
        const ts = byDate[monthDateStr(day)] ?? []
        if (ts.length) {
          const dayNet = ts.reduce((s, t) => s + t.net_pnl, 0)
          hasTrades = true
          tradingDays++
          tradeCount += ts.length
          net += dayNet
          if (dayNet > 0.001) winDays++
          else if (dayNet < -0.001) lossDays++
        }
      }
      rows.push({ days, net, hasTrades, tradingDays, winDays, lossDays, tradeCount })
    }
    return rows
  }, [cells, byDate, curYear, curMonth])

  const monthSummary = useMemo(() => {
    const entries = Object.entries(byDate).filter(([d]) => {
      const [y, mo] = d.split('-').map(Number)
      return y === curYear && mo - 1 === curMonth
    })
    const nets = entries.map(([, ts]) => ts.reduce((s, t) => s + t.net_pnl, 0))
    const winDays  = nets.filter(n => n > 0.001).length
    const lossDays = nets.filter(n => n < -0.001).length
    const allT = entries.flatMap(([, ts]) => ts)
    return {
      tradingDays: entries.length,
      winDays, lossDays,
      net:   allT.reduce((s, t) => s + t.net_pnl, 0),
      gross: allT.reduce((s, t) => s + t.gross, 0),
      fees:  allT.reduce((s, t) => s + t.fees,  0),
      best:  nets.length ? Math.max(...nets) : 0,
      worst: nets.length ? Math.min(...nets) : 0,
      trades: allT.length,
    }
  }, [byDate, curYear, curMonth])

  function prevMonth() {
    if (curMonth === 0) { setCurYear(y => y - 1); setCurMonth(11) }
    else setCurMonth(mo => mo - 1)
  }
  function nextMonth() {
    if (curMonth === 11) { setCurYear(y => y + 1); setCurMonth(0) }
    else setCurMonth(mo => mo + 1)
  }

  // ── Weekly ────────────────────────────────────────────────────────────────

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return d
    }), [weekStart])

  const weekSummary = useMemo(() => {
    const dayData = weekDays.map(d => {
      const ts = byDate[toDateStr(d)] ?? []
      return { ts, net: ts.reduce((s, t) => s + t.net_pnl, 0) }
    })
    const active = dayData.filter(d => d.ts.length > 0)
    const nets = active.map(d => d.net)
    const allT = active.flatMap(d => d.ts)
    return {
      tradingDays: active.length,
      winDays:  nets.filter(n => n > 0.001).length,
      lossDays: nets.filter(n => n < -0.001).length,
      net:   allT.reduce((s, t) => s + t.net_pnl, 0),
      gross: allT.reduce((s, t) => s + t.gross, 0),
      fees:  allT.reduce((s, t) => s + t.fees,  0),
      best:  nets.length ? Math.max(...nets) : 0,
      worst: nets.length ? Math.min(...nets) : 0,
      trades: allT.length,
      winTrades: allT.filter(t => t.net_pnl > 0.001).length,
    }
  }, [weekDays, byDate])

  function prevWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n }) }
  function nextWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n }) }

  const weekLabel = useMemo(() => {
    const fmtD = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmtD(weekDays[0])} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }, [weekDays])

  const todayStr = toDateStr(new Date())

  // ── KPI row (shared between views) ───────────────────────────────────────
  function KpiRow({ summary, label }: { summary: typeof monthSummary; label: string }) {
    const wr = summary.tradingDays ? ((summary.winDays / summary.tradingDays) * 100).toFixed(0) : '0'
    return (
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 mb-5">
        {[
          { l: label,            v: fmt(summary.net),   c: summary.net   >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]' },
          { l: 'Bruto',          v: fmt(summary.gross), c: summary.gross >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]' },
          { l: 'Comisiones',     v: `-$${summary.fees.toFixed(2)}`, c: 'text-[#ef4444]' },
          { l: 'Días operados',  v: String(summary.tradingDays), c: 'text-[#e8ecf2]' },
          { l: 'Días W / L',     v: `${summary.winDays}W / ${summary.lossDays}L`, c: 'text-[#e8ecf2]' },
          { l: 'Win Rate días',  v: `${wr}%`, c: 'text-[#e8ecf2]' },
          { l: 'Mejor día',      v: fmt(summary.best),  c: 'text-[#22c55e]' },
          { l: 'Peor día',       v: fmt(summary.worst), c: 'text-[#ef4444]' },
        ].map(k => (
          <div key={k.l} className="bg-[#11151f] border border-[#232a3a] rounded-lg px-3 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#6d7589] mb-1">{k.l}</div>
            <div className={`text-[14px] font-semibold font-mono ${k.c}`}>{k.v}</div>
          </div>
        ))}
      </div>
    )
  }

  if (loading) return <div className="p-8 text-center text-[#4a5266] text-sm">Cargando…</div>

  return (
    <div className="p-6 text-[#e8ecf2]" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          {view === 'month' ? (
            <>
              <button onClick={prevMonth} className="nav-btn">‹</button>
              <h1 className="text-[18px] font-semibold tracking-tight w-52 text-center">{MONTHS[curMonth]} {curYear}</h1>
              <button onClick={nextMonth} className="nav-btn">›</button>
            </>
          ) : (
            <>
              <button onClick={prevWeek} className="nav-btn">‹</button>
              <h1 className="text-[18px] font-semibold tracking-tight w-64 text-center">{weekLabel}</h1>
              <button onClick={nextWeek} className="nav-btn">›</button>
            </>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center bg-[#11151f] border border-[#232a3a] rounded-lg p-0.5 gap-0.5">
          {(['month', 'week'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                view === v ? 'bg-[#1e2638] text-[#e8ecf2]' : 'text-[#6d7589] hover:text-[#a4abbe]'
              }`}
            >
              {v === 'month' ? 'Mensual' : 'Semanal'}
            </button>
          ))}
        </div>
      </div>

      {/* ── MONTHLY VIEW ──────────────────────────────────────────────── */}
      {view === 'month' && (
        <>
          {monthSummary.tradingDays > 0 && (
            <KpiRow summary={monthSummary} label="Net del Mes" />
          )}

          <div className="bg-[#11151f] border border-[#232a3a] rounded-xl overflow-hidden">
            {/* Column headers: 7 days + "Semana" total */}
            <div className="grid border-b border-[#232a3a]" style={{ gridTemplateColumns: 'repeat(7, 1fr) 88px' }}>
              {DAYS.map(d => (
                <div key={d} className="py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-[#4a5266]">{d}</div>
              ))}
              <div className="py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2f384c] border-l border-[#1a1f2e]">Semana</div>
            </div>

            {/* Week rows */}
            {weekRows.map((week, ri) => (
              <div key={ri} className="grid border-b border-[#1a1f2e] last:border-b-0" style={{ gridTemplateColumns: 'repeat(7, 1fr) 88px', minHeight: '90px' }}>
                {week.days.map((day, ci) => {
                  if (!day) return <div key={ci} className="border-r border-[#1a1f2e]" />
                  const ds = monthDateStr(day)
                  const ts = byDate[ds] ?? []
                  const net = ts.reduce((s, t) => s + t.net_pnl, 0)
                  const isWin  = net > 0.001
                  const isLoss = net < -0.001
                  const isToday = ds === todayStr
                  const hasTrades = ts.length > 0

                  return (
                    <div
                      key={ci}
                      onClick={() => hasTrades && router.push(`/trades?date=${ds}`)}
                      className={`border-r border-[#1a1f2e] p-2 flex flex-col transition-colors ${
                        hasTrades ? 'cursor-pointer hover:bg-[#141824]' : ''
                      } ${isWin ? 'bg-[rgba(34,197,94,0.05)]' : isLoss ? 'bg-[rgba(239,68,68,0.05)]' : ''}`}
                    >
                      <div className={`text-[11px] font-semibold mb-1 leading-none ${
                        isToday ? 'w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#f59e0b] text-[#0b0e16] text-[10px]' : 'text-[#6d7589]'
                      }`}>
                        {day}
                      </div>
                      {hasTrades && (
                        <>
                          <div className={`text-[12px] font-semibold font-mono leading-snug ${isWin ? 'text-[#22c55e]' : isLoss ? 'text-[#ef4444]' : 'text-[#a4abbe]'}`}>
                            {fmt(net)}
                          </div>
                          <div className="text-[10px] text-[#4a5266] mt-auto">{ts.length}t</div>
                        </>
                      )}
                    </div>
                  )
                })}

                {/* Week total cell */}
                <div className={`border-l border-[#1a1f2e] flex flex-col items-center justify-center gap-0.5 px-1 py-2 ${
                  week.hasTrades
                    ? week.net > 0.001 ? 'bg-[rgba(34,197,94,0.05)]' : week.net < -0.001 ? 'bg-[rgba(239,68,68,0.05)]' : ''
                    : ''
                }`}>
                  {week.hasTrades ? (
                    <>
                      <div className={`text-[11px] font-bold font-mono ${week.net > 0.001 ? 'text-[#22c55e]' : week.net < -0.001 ? 'text-[#ef4444]' : 'text-[#a4abbe]'}`}>
                        {fmt(week.net)}
                      </div>
                      <div className="text-[9px] text-[#4a5266]">{week.tradingDays}d · {week.tradeCount}t</div>
                      <div className="text-[9px] text-[#4a5266]">{week.winDays}W {week.lossDays}L</div>
                    </>
                  ) : (
                    <span className="text-[11px] text-[#1e2638]">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Month running total bar */}
          {monthSummary.tradingDays > 0 && (
            <div className={`mt-3 rounded-xl border px-5 py-3 flex items-center justify-between ${
              monthSummary.net > 0.001 ? 'bg-[rgba(34,197,94,0.04)] border-[rgba(34,197,94,0.15)]' :
              monthSummary.net < -0.001 ? 'bg-[rgba(239,68,68,0.04)] border-[rgba(239,68,68,0.15)]' :
              'bg-[#11151f] border-[#232a3a]'
            }`}>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-widest text-[#6d7589] mb-0.5">Total {MONTHS[curMonth]}</div>
                <div className={`text-[26px] font-bold font-mono ${monthSummary.net > 0.001 ? 'text-[#22c55e]' : monthSummary.net < -0.001 ? 'text-[#ef4444]' : 'text-[#a4abbe]'}`}>
                  {fmt(monthSummary.net)}
                </div>
              </div>
              <div className="flex gap-6">
                {[
                  { l: 'Bruto',       v: fmt(monthSummary.gross), c: monthSummary.gross >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]' },
                  { l: 'Comisiones',  v: `-$${monthSummary.fees.toFixed(2)}`, c: 'text-[#ef4444]' },
                  { l: 'Trades',      v: String(monthSummary.trades), c: 'text-[#e8ecf2]' },
                  { l: 'Días W/L',    v: `${monthSummary.winDays}/${monthSummary.lossDays}`, c: 'text-[#e8ecf2]' },
                ].map(k => (
                  <div key={k.l} className="text-right">
                    <div className="text-[9px] uppercase tracking-widest text-[#4a5266]">{k.l}</div>
                    <div className={`text-[13px] font-semibold font-mono ${k.c}`}>{k.v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── WEEKLY VIEW ───────────────────────────────────────────────── */}
      {view === 'week' && (
        <>
          {weekSummary.tradingDays > 0 && (
            <KpiRow summary={weekSummary} label="Net de la Semana" />
          )}

          {/* 7 day cards */}
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((d, i) => {
              const ds = toDateStr(d)
              const ts = (byDate[ds] ?? []).slice().sort((a, b) => (a.open_time ?? '').localeCompare(b.open_time ?? ''))
              const net     = ts.reduce((s, t) => s + t.net_pnl, 0)
              const isWin   = net > 0.001
              const isLoss  = net < -0.001
              const isToday = ds === todayStr
              const isWeekend = i === 0 || i === 6
              const wins   = ts.filter(t => t.net_pnl > 0.001).length
              const losses = ts.filter(t => t.net_pnl < -0.001).length

              return (
                <div
                  key={i}
                  className={`rounded-xl border flex flex-col overflow-hidden ${
                    isToday ? 'border-[#f59e0b]' :
                    isWin   ? 'border-[rgba(34,197,94,0.25)]' :
                    isLoss  ? 'border-[rgba(239,68,68,0.25)]' :
                    'border-[#232a3a]'
                  } ${isWeekend && !ts.length ? 'opacity-40' : ''}`}
                >
                  {/* Day header */}
                  <div className={`px-3 py-2 border-b ${
                    isToday ? 'bg-[rgba(245,158,11,0.08)] border-[rgba(245,158,11,0.2)]' : 'bg-[#11151f] border-[#1a1f2e]'
                  }`}>
                    <div className={`text-[9px] font-bold uppercase tracking-[0.1em] ${isToday ? 'text-[#f59e0b]' : 'text-[#6d7589]'}`}>
                      {DAYS[i]}
                    </div>
                    <div className="text-[12px] font-semibold text-[#e8ecf2] leading-tight">
                      {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>

                  {/* Body */}
                  <div className={`flex-1 p-2.5 ${
                    isWin ? 'bg-[rgba(34,197,94,0.04)]' : isLoss ? 'bg-[rgba(239,68,68,0.04)]' : 'bg-[#0d1117]'
                  }`}>
                    {ts.length > 0 ? (
                      <>
                        <div className={`text-[18px] font-bold font-mono leading-tight ${
                          isWin ? 'text-[#22c55e]' : isLoss ? 'text-[#ef4444]' : 'text-[#a4abbe]'
                        }`}>
                          {fmt(net)}
                        </div>
                        <div className="text-[9px] text-[#6d7589] mb-2.5">
                          {ts.length}t · {wins}W {losses}L
                        </div>

                        {/* Per-trade rows */}
                        <div className="space-y-0.5">
                          {ts.slice(0, 7).map(t => (
                            <div
                              key={t.id}
                              onClick={() => router.push(`/trades?date=${ds}`)}
                              className="flex items-center justify-between rounded px-1.5 py-[3px] -mx-1.5 cursor-pointer hover:bg-[#161b28] transition-colors"
                            >
                              <span className="text-[9px] font-semibold text-[#a4abbe] truncate">{t.symbol}</span>
                              <span className={`text-[9px] font-mono font-semibold shrink-0 ml-1 ${
                                t.net_pnl > 0.001 ? 'text-[#22c55e]' : t.net_pnl < -0.001 ? 'text-[#ef4444]' : 'text-[#6d7589]'
                              }`}>
                                {fmt(t.net_pnl)}
                              </span>
                            </div>
                          ))}
                          {ts.length > 7 && (
                            <div
                              onClick={() => router.push(`/trades?date=${ds}`)}
                              className="text-[9px] text-[#4a5266] text-center pt-0.5 cursor-pointer hover:text-[#6d7589]"
                            >
                              +{ts.length - 7} más →
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-center py-5">
                        <span className="text-[10px] text-[#2f384c]">{isWeekend ? '—' : 'Sin trades'}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Week total bar */}
          {weekSummary.trades > 0 && (
            <div className={`mt-3 rounded-xl border px-5 py-3 flex items-center justify-between ${
              weekSummary.net > 0.001 ? 'bg-[rgba(34,197,94,0.04)] border-[rgba(34,197,94,0.15)]' :
              weekSummary.net < -0.001 ? 'bg-[rgba(239,68,68,0.04)] border-[rgba(239,68,68,0.15)]' :
              'bg-[#11151f] border-[#232a3a]'
            }`}>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-widest text-[#6d7589] mb-0.5">Total Semana</div>
                <div className={`text-[26px] font-bold font-mono ${
                  weekSummary.net > 0.001 ? 'text-[#22c55e]' : weekSummary.net < -0.001 ? 'text-[#ef4444]' : 'text-[#a4abbe]'
                }`}>
                  {fmt(weekSummary.net)}
                </div>
              </div>
              <div className="flex gap-6">
                {[
                  { l: 'Bruto',      v: fmt(weekSummary.gross), c: weekSummary.gross >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]' },
                  { l: 'Comisiones', v: `-$${weekSummary.fees.toFixed(2)}`, c: 'text-[#ef4444]' },
                  { l: 'Trades',     v: String(weekSummary.trades), c: 'text-[#e8ecf2]' },
                  { l: 'Días W/L',   v: `${weekSummary.winDays}/${weekSummary.lossDays}`, c: 'text-[#e8ecf2]' },
                ].map(k => (
                  <div key={k.l} className="text-right">
                    <div className="text-[9px] uppercase tracking-widest text-[#4a5266]">{k.l}</div>
                    <div className={`text-[13px] font-semibold font-mono ${k.c}`}>{k.v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* nav-btn shared style via inline approach */}
      <style>{`.nav-btn{width:2rem;height:2rem;display:flex;align-items:center;justify-content:center;border-radius:6px;background:#11151f;border:1px solid #232a3a;color:#6d7589;transition:color .15s,border-color .15s;font-size:18px;line-height:1}.nav-btn:hover{color:#e8ecf2;border-color:#2f384c}`}</style>
    </div>
  )
}
