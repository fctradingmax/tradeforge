import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function fmt(n: number) {
  return (n >= 0 ? '+' : '') + '$' + Math.abs(n).toFixed(2)
}

function fmtTime(sec: number | null) {
  if (!sec) return '—'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

export default async function TradesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: trades } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .order('open_time', { ascending: false })

  const rows = trades ?? []

  const wins = rows.filter((t) => t.net_pnl > 0.001)
  const losses = rows.filter((t) => t.net_pnl < -0.001)
  const netPnl = rows.reduce((s, t) => s + t.net_pnl, 0)
  const grossWins = wins.reduce((s, t) => s + t.net_pnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.net_pnl, 0))
  const profitFactor = grossLoss > 0 ? grossWins / grossLoss : wins.length > 0 ? Infinity : 0
  const winRate = rows.length ? (wins.length / rows.length) * 100 : 0
  const avgWin = wins.length ? grossWins / wins.length : 0
  const avgLoss = losses.length ? grossLoss / losses.length : 0

  const topStats = [
    { label: 'Net P&L', value: fmt(netPnl), pos: netPnl >= 0 },
    { label: 'Win Rate', value: `${winRate.toFixed(1)}%`, pos: winRate >= 50 },
    { label: 'Profit Factor', value: isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞', pos: profitFactor >= 1 },
    { label: 'Avg Win', value: fmt(avgWin), pos: true },
    { label: 'Avg Loss', value: `-$${avgLoss.toFixed(2)}`, pos: false },
    { label: 'Total Trades', value: rows.length.toString(), pos: true },
  ]

  return (
    <div className="p-8 text-[#e8ecf2]">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Trades</h1>

      {/* Stats strip */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {topStats.map((s) => (
          <div key={s.label} className="rounded-lg bg-[#11151f] border border-[#232a3a] p-3">
            <p className="text-[10px] text-[#6d7589] mb-1 uppercase tracking-wide">{s.label}</p>
            <p className={`text-lg font-bold font-mono tabular-nums ${s.pos ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg bg-[#11151f] border border-[#232a3a] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#232a3a] text-[#6d7589] text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Symbol</th>
              <th className="px-4 py-3 text-left">Side</th>
              <th className="px-4 py-3 text-right">Net P&L</th>
              <th className="px-4 py-3 text-right">Gross</th>
              <th className="px-4 py-3 text-right">Fees</th>
              <th className="px-4 py-3 text-right">Shares</th>
              <th className="px-4 py-3 text-right">Hold</th>
              <th className="px-4 py-3 text-left">Setup</th>
              <th className="px-4 py-3 text-left">Quality</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-[#4a5266]">
                  No trades found.
                </td>
              </tr>
            )}
            {rows.map((t) => {
              const pos = t.net_pnl >= 0
              return (
                <tr
                  key={t.id}
                  className="border-b border-[#1a1f2e] hover:bg-[#161b28] transition-colors"
                >
                  <td className="px-4 py-2.5 text-[#a4abbe] whitespace-nowrap">{t.date ?? '—'}</td>
                  <td className="px-4 py-2.5 font-semibold text-[#e8ecf2]">{t.symbol}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${t.open_side === 'B' ? 'bg-[rgba(34,197,94,0.1)] text-[#22c55e]' : 'bg-[rgba(239,68,68,0.1)] text-[#ef4444]'}`}>
                      {t.open_side === 'B' ? 'LONG' : t.open_side === 'S' ? 'SHORT' : '—'}
                    </span>
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${pos ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                    {fmt(t.net_pnl)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[#a4abbe]">{fmt(t.gross)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[#6d7589]">-${(t.fees ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[#a4abbe]">{t.max_size ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-[#6d7589]">{fmtTime(t.holding_sec)}</td>
                  <td className="px-4 py-2.5 text-[#a4abbe]">{t.setup ?? '—'}</td>
                  <td className="px-4 py-2.5 text-[#6d7589]">{t.quality ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
