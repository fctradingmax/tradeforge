import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import YahooFinance from 'yahoo-finance2'

const yf = new YahooFinance()

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: entry } = await supabase
    .from('watchlist')
    .select('symbol')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const ago30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const result = await yf.chart(entry.symbol as string, {
      period1: ago30.toISOString().split('T')[0],
      interval: '1d',
    })

    const closes = result.quotes
      .filter(q => q.close != null)
      .map(q => ({ d: new Date(q.date).toISOString().split('T')[0], c: +q.close!.toFixed(2) }))

    return NextResponse.json(closes)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
