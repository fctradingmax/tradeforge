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

function m(v: number) { return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2) }

export default function CalendarPage() {
  const router = useRouter()
  const [trades, setTrades]     = useState<Trade[]>([])
  const [loading, setLoading]   = useState(true)
  const [curYear, setCurYear]   = useState(() => new Date().getFullYear())
  const [curMonth, setCurMonth] = useState(() => new Date().getMonth())

  useEffect(() => {
    fetch('/api/trades').then(r => r.json()).then(t => {
      if (Array.isArray(t)) setTrades(t)
    }).finally(() => setLoading(false))
  }, [])

  // Group all trades by date
  const byDate = useMemo(() => {
    const map: Record<string, Trade[]> = {}
    for (const t of trades) {
      if (!t.date) continue
      if (!map[t.date]) map[t.date] = []
      map[t.date].push(t)
    }
    return map
  }, [trades])

  // Summary for the current visible month
  const monthSummary = useMemo(() => {
    const entries = Object.entries(byDate).filter(([d]) => {
      const [y, mo] = d.split('-').map(Number)
      return y === curYear && mo - 1 === curMonth
    })
    const winDays  = entries.filter(([, ts]) => ts.reduce((s, t) => s + t.net_pnl, 0) > 0.001)
    const lossDays = entries.filter(([, ts]) => ts.reduce((s, t) => s + t.net_pnl, 0) < -0.001)
    const nets     = entries.map(([, ts]) => ts.reduce((s, t) => s + t.net_pnl, 0))
    return {
      tradingDays: entries.length,
      winDays:  winDays.length,
      lossDays: lossDays.length,
      net:      nets.reduce((s, v) => s + v, 0),
      best:     nets.length ? Math.max(...nets) : 0,
      worst:    nets.length ? Math.min(...nets) : 0,
      trades:   entries.reduce((s, [, ts]) => s + ts.length, 0),
    }
  }, [byDate, curYear, curMonth])

  // Build calendar cells
  const cells = useMemo(() => {
    const firstDay     = new Date(curYear, curMonth, 1).getDay()
    const daysInMonth  = new Date(curYear, curMonth + 1, 0).getDate()
    const arr: (number | null)[] = Array(firstDay).fill(null)
    for (let i = 1; i <= daysInMonth; i++) arr.push(i)
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [curYear, curMonth])

  function prevMonth() {
    if (curMonth === 0) { setCurYear(y => y - 1); setCurMonth(11) }
    else setCurMonth(m => m - 1)
  }
  function nextMonth() {
    if (curMonth === 11) { setCurYear(y => y + 1); setCurMonth(0) }
    else setCurMonth(m => m + 1)
  }

  function dateStr(day: number) {
    return `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`


  if (loading) {
    return <div className="p-8 text-center text-[#4a5266] text-sm">Cargando…</div>
  }

  return (
    <>
      <div className="p-6 text-[#e8ecf2]" style={{ fontFamily: 'Inter, sans-serif' }}>

        {/* Month header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <button onClick={prevMonth}
              className="w-8 h-8 rounded-md bg-[#11151f] border border-[#232a3a] text-[#6d7589] hover:text-[#e8ecf2] hover:border-[#2f384c] flex items-center justify-center transition-colors">
              ‹
            </button>
            <h1 className="text-[18px] font-semibold tracking-tight w-52 text-center">
              {MONTHS[curMonth]} {curYear}
            </h1>
            <button onClick={nextMonth}
              className="w-8 h-8 rounded-md bg-[#11151f] border border-[#232a3a] text-[#6d7589] hover:text-[#e8ecf2] hover:border-[#2f384c] flex items-center justify-center transition-colors">
              ›
            </button>
          </div>
        </div>

        {/* Monthly KPIs */}
        {monthSummary.tradingDays > 0 && (
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
            {[
              { label: 'Net del Mes',   value: m(monthSummary.net),     color: monthSummary.net >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]' },
              { label: 'Días operados', value: String(monthSummary.tradingDays), color: 'text-[#e8ecf2]' },
              { label: 'Días ganadores', value: String(monthSummary.winDays),  color: 'text-[#22c55e]' },
              { label: 'Días perdedores', value: String(monthSummary.lossDays), color: 'text-[#ef4444]' },
              { label: 'Mejor día',     value: m(monthSummary.best),    color: 'text-[#22c55e]' },
              { label: 'Peor día',      value: m(monthSummary.worst),   color: 'text-[#ef4444]' },
            ].map(k => (
              <div key={k.label} className="bg-[#11151f] border border-[#232a3a] rounded-lg px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6d7589] mb-1">{k.label}</div>
                <div className={`text-[18px] font-semibold font-mono ${k.color}`}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Calendar */}
        <div className="bg-[#11151f] border border-[#232a3a] rounded-xl overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-[#232a3a]">
              {DAYS.map(d => (
                <div key={d} className="py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-[#4a5266]">{d}</div>
              ))}
            </div>

            {/* Cells */}
            <div className="grid grid-cols-7" style={{ gridAutoRows: '100px' }}>
              {cells.map((day, i) => {
                if (!day) return <div key={i} className="border-b border-r border-[#1a1f2e]" />

                const ds       = dateStr(day)
                const ts       = byDate[ds] ?? []
                const net      = ts.reduce((s, t) => s + t.net_pnl, 0)
                const isWin    = net > 0.001
                const isLoss   = net < -0.001
                const hasTrades = ts.length > 0
                const isToday  = ds === todayStr

                let bg = ''
                let borderAccent = 'border-[#1a1f2e]'
                if (isWin)  { bg = 'bg-[rgba(34,197,94,0.06)]';  borderAccent = 'border-[rgba(34,197,94,0.15)]' }
                if (isLoss) { bg = 'bg-[rgba(239,68,68,0.06)]';  borderAccent = 'border-[rgba(239,68,68,0.15)]' }

                return (
                  <div
                    key={i}
                    onClick={() => hasTrades && router.push(`/trades?date=${ds}`)}
                    className={`relative border-b border-r ${borderAccent} ${bg} p-2 flex flex-col transition-colors ${hasTrades ? 'cursor-pointer hover:bg-[#161b28]' : ''}`}
                  >
                    <div className={`text-xs font-semibold mb-1 ${isToday ? 'w-5 h-5 flex items-center justify-center rounded-full bg-[#f59e0b] text-[#0b0e16]' : 'text-[#6d7589]'}`}>
                      {day}
                    </div>
                    {hasTrades && (
                      <>
                        <div className={`text-[13px] font-semibold font-mono leading-tight ${isWin ? 'text-[#22c55e]' : isLoss ? 'text-[#ef4444]' : 'text-[#a4abbe]'}`}>
                          {m(net)}
                        </div>
                        <div className="text-[10px] text-[#4a5266] mt-auto">
                          {ts.length} trade{ts.length !== 1 ? 's' : ''}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
        </div>
      </div>
    </>
  )
}
