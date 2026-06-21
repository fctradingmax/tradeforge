import { NextResponse } from 'next/server'
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
