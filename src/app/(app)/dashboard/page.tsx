import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/DashboardClient'

export const dynamic = 'force-dynamic'

function fmtM(v: number) { return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2) }
function pct(v: number) { return (v * 100).toFixed(1) + '%' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: raw } = await supabase
    .from('trades')
    .select('symbol,date,open_time,close_time,gross,fees,net_pnl,buy_qty,sell_qty,max_size,mae,mfe')
    .eq('user_id', user.id)
    .order('date', { ascending: true })
    .order('open_time', { ascending: true })

  const trades = raw ?? []

  if (trades.length === 0) {
    return (
      <div className="p-8 text-[#e8ecf2]">
        <h1 className="text-2xl font-bold tracking-tight mb-6">Dashboard</h1>
        <div className="rounded-lg bg-[#11151f] border border-[#232a3a] p-12 text-center text-[#4a5266]">
          <p className="text-sm">No hay trades todavía.</p>
        </div>
      </div>
    )
  }

  // ── Compute stats ──────────────────────────────────────────
  const wins   = trades.filter(t => t.net_pnl >  0.001)
  const losses = trades.filter(t => t.net_pnl < -0.001)
  const be     = trades.filter(t => Math.abs(t.net_pnl) <= 0.001)
  const netTotal   = trades.reduce((s, t) => s + t.net_pnl, 0)
  const grossTotal = trades.reduce((s, t) => s + t.gross, 0)
  const feesTotal  = trades.reduce((s, t) => s + t.fees, 0)
  const totalShares = trades.reduce((s, t) => s + (t.buy_qty ?? 0) + (t.sell_qty ?? 0), 0)
  const sumWin  = wins.reduce((s, t) => s + t.net_pnl, 0)
  const sumLoss = Math.abs(losses.reduce((s, t) => s + t.net_pnl, 0))
  const avgWin  = wins.length  ? sumWin / wins.length : 0
  const avgLoss = losses.length ? sumLoss / losses.length : 0
  const profitFactor = sumLoss > 0 ? sumWin / sumLoss : sumWin > 0 ? Infinity : 0
  const rr = avgLoss > 0 ? avgWin / avgLoss : 0
  const winRate = wins.length / trades.length

  // Equity curve
  let cum = 0
  const equityCurve = trades.map(t => {
    cum += t.net_pnl
    const label = t.date
      ? t.date.slice(5) + (t.close_time ? ' ' + t.close_time.slice(0, 5) : '')
      : ''
    return { label, cum: parseFloat(cum.toFixed(2)), net: t.net_pnl }
  })

  // By symbol
  const symMap: Record<string, { gross: number; fees: number; net: number }> = {}
  for (const t of trades) {
    if (!symMap[t.symbol]) symMap[t.symbol] = { gross: 0, fees: 0, net: 0 }
    symMap[t.symbol].gross += t.gross
    symMap[t.symbol].fees  += t.fees
    symMap[t.symbol].net   += t.net_pnl
  }
  const bySymbol = Object.entries(symMap)
    .map(([symbol, v]) => ({ symbol, gross: parseFloat(v.gross.toFixed(2)), fees: parseFloat((-v.fees).toFixed(2)), net: parseFloat(v.net.toFixed(2)) }))
    .sort((a, b) => b.net - a.net)

  // Session split
  const preMarket  = trades.filter(t => (t.open_time ?? '') < '09:30')
  const regular    = trades.filter(t => (t.open_time ?? '') >= '09:30' && (t.open_time ?? '') < '16:00')
  const afterHours = trades.filter(t => (t.open_time ?? '') >= '16:00')
  const sessionRows = [
    { label: 'Pre-Market', ts: preMarket },
    { label: 'Regular',    ts: regular },
    { label: 'After-Hours', ts: afterHours },
  ]
    .filter(({ ts }) => ts.length > 0)
    .map(({ label, ts }) => {
      const w = ts.filter(t => t.net_pnl > 0.001)
      return {
        name: label,
        count: ts.length,
        wr: w.length / ts.length,
        net: ts.reduce((s, t) => s + t.net_pnl, 0),
        best: Math.max(...ts.map(t => t.net_pnl)),
        worst: Math.min(...ts.map(t => t.net_pnl)),
      }
    })

  const kpis = [
    {
      label: 'Net P&L',
      value: fmtM(netTotal),
      sub: `${trades.length} trades · ${totalShares.toLocaleString('en-US')} sh`,
      accent: netTotal >= 0 ? '#22c55e' : '#ef4444',
      valueColor: netTotal >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]',
    },
    {
      label: 'Win Rate',
      value: pct(winRate),
      sub: `${wins.length}W / ${losses.length}L${be.length ? ` / ${be.length}BE` : ''}`,
      accent: '#22c55e',
      valueColor: 'text-[#e8ecf2]',
    },
    {
      label: 'Profit Factor',
      value: isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞',
      sub: 'Σ wins ÷ Σ losses',
      accent: '#3b82f6',
      valueColor: 'text-[#e8ecf2]',
    },
    {
      label: 'R:R Ratio',
      value: rr.toFixed(2),
      sub: 'avg win ÷ avg loss',
      accent: '#f59e0b',
      valueColor: 'text-[#e8ecf2]',
    },
    {
      label: 'Fees',
      value: `-$${feesTotal.toFixed(2)}`,
      sub: `${grossTotal ? (feesTotal / Math.abs(grossTotal) * 100).toFixed(1) : '0.0'}% del bruto`,
      accent: feesTotal / Math.max(Math.abs(grossTotal), 1) > 0.2 ? '#ef4444' : '#f59e0b',
      valueColor: 'text-[#ef4444]',
    },
  ]

  return (
    <div className="p-8 text-[#e8ecf2]" style={{ fontFamily: 'Inter, sans-serif' }}>
      <h1 className="text-[18px] font-semibold tracking-tight mb-6">Dashboard</h1>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 mb-6">
        {kpis.map(k => (
          <div
            key={k.label}
            className="relative rounded-[10px] bg-[#11151f] border border-[#232a3a] px-[18px] py-4 overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: k.accent }} />
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6d7589] mb-2">{k.label}</div>
            <div className={`font-mono text-[24px] font-semibold leading-tight ${k.valueColor}`}>{k.value}</div>
            <div className="text-[11px] text-[#a4abbe] mt-1.5 font-mono">{k.sub}</div>
          </div>
        ))}
      </div>

      <DashboardClient
        equityCurve={equityCurve}
        bySymbol={bySymbol}
        sessionRows={sessionRows}
        plComp={{ sumWin, sumLoss, fees: feesTotal, net: netTotal }}
      />
    </div>
  )
}
