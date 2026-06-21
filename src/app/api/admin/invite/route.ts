import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only owner can invite
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden: only owners can invite users' }, { status: 403 })
  }

  const { email, role } = await request.json() as { email: string; role: string }

  if (!email || !['team', 'client'].includes(role)) {
    return NextResponse.json({ error: 'email and role (team|client) are required' }, { status: 400 })
  }

  const service = createServiceClient()

  // Send Supabase Auth invite — the user receives an email to set their password
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    data: { role },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/login`,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pre-set role on the profile row (trigger creates it, but role defaults to 'team')
  if (data.user) {
    await service
      .from('profiles')
      .upsert({ id: data.user.id, email, role }, { onConflict: 'id' })
  }

  return NextResponse.json({ ok: true, user_id: data.user?.id })
}
