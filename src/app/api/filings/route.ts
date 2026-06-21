import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')
  const only_new = searchParams.get('new') === 'true'

  // Only return filings for symbols on the user's watchlist
  const { data: watchlist } = await supabase
    .from('watchlist')
    .select('symbol')
    .eq('user_id', user.id)

  const watchedSymbols = (watchlist ?? []).map((w) => w.symbol)

  if (watchedSymbols.length === 0) return NextResponse.json([])

  let query = supabase
    .from('filings')
    .select('*')
    .in('symbol', symbol ? [symbol.toUpperCase()] : watchedSymbols)
    .order('filing_date', { ascending: false })
    .limit(200)

  if (only_new) query = query.eq('is_new', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

/** Mark filings as read */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await request.json() as { ids: string[] }
  const { error } = await supabase
    .from('filings')
    .update({ is_new: false })
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
