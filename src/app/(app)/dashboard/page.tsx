import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [tradesRes, watchlistRes, alertsRes] = await Promise.all([
    supabase.from('trades').select('net_pnl,date').eq('user_id', user.id).order('date', { ascending: false }).limit(500),
    supabase.from('watchlist').select('symbol').eq('user_id', user.id),
    supabase.from('alerts').select('id').eq('user_id', user.id).eq('is_read', false),
  ])

  console.log('[dashboard] user.id:', user.id)
  console.log('[dashboard] trades error:', tradesRes.error)
  console.log('[dashboard] trades count:', tradesRes.data?.length)

  const trades = tradesRes.data ?? []
  const netPnl = trades.reduce((s, t) => s + (t.net_pnl ?? 0), 0)
  const wins = trades.filter((t) => t.net_pnl > 0.001).length
  const winRate = trades.length ? (wins / trades.length) * 100 : 0

  const stats = [
    { label: 'Net P&L', value: `${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)}`, positive: netPnl >= 0 },
    { label: 'Trades', value: trades.length.toString(), positive: true },
    { label: 'Win Rate', value: `${winRate.toFixed(1)}%`, positive: winRate >= 50 },
    { label: 'Watchlist', value: (watchlistRes.data ?? []).length.toString(), positive: true },
  ]

  return (
    <div className="p-8 text-[#e8ecf2]">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-[#11151f] border border-[#232a3a] p-4">
            <p className="text-xs text-[#6d7589] mb-1">{s.label}</p>
            <p className={`text-2xl font-bold font-mono tabular-nums ${s.positive ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {(alertsRes.data ?? []).length > 0 && (
        <div className="rounded-lg bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.2)] px-4 py-3 text-sm text-[#f59e0b] mb-6">
          You have {alertsRes.data!.length} unread alert{alertsRes.data!.length > 1 ? 's' : ''} —{' '}
          <a href="/alerts" className="underline">view them</a>
        </div>
      )}

      <div className="rounded-lg bg-[#11151f] border border-[#232a3a] p-6 text-center text-[#6d7589]">
        <p className="text-sm">Full charts and breakdowns are in <a href="/trades" className="text-[#a4abbe] hover:text-[#e8ecf2] underline">Trades</a>.</p>
        <p className="text-sm mt-1">Ask the <a href="/chat" className="text-[#a4abbe] hover:text-[#e8ecf2] underline">AI Agent</a> anything about your data.</p>
      </div>
    </div>
  )
}
