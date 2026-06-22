import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('setups')
    .select('name')
    .eq('user_id', user.id)
    .order('name')

  return NextResponse.json((data ?? []).map(r => r.name))
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  // Upsert — ignore conflict if setup already exists
  const { error } = await supabase
    .from('setups')
    .upsert({ name: name.trim(), user_id: user.id }, { onConflict: 'name,user_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ name: name.trim() }, { status: 201 })
}
