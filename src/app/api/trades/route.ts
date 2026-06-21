import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')
  const date = searchParams.get('date')
  const limit = parseInt(searchParams.get('limit') ?? '2000')

  let query = supabase
    .from('trades')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .order('close_time', { ascending: false })
    .limit(limit)

  if (symbol) query = query.eq('symbol', symbol.toUpperCase())
  if (date) query = query.eq('date', date)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const trades = Array.isArray(body) ? body : [body]

  const rows = trades.map((t) => ({ ...t, user_id: user.id }))
  const { data, error } = await supabase.from('trades').insert(rows).select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
