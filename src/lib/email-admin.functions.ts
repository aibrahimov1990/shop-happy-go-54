import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'

const inputSchema = z.object({
  range: z.enum(['24h', '7d', '30d']).default('7d'),
  templateFilter: z.string().nullable().optional(),
  statusFilter: z.string().nullable().optional(),
})

export const getEmailStats = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: userId,
      _role: 'admin',
    })
    if (!isAdmin) throw new Error('Forbidden')

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const since = new Date()
    if (data.range === '24h') since.setHours(since.getHours() - 24)
    else if (data.range === '7d') since.setDate(since.getDate() - 7)
    else since.setDate(since.getDate() - 30)

    // Fetch all rows in range, then dedupe client-side by message_id (latest)
    const { data: rows, error } = await (supabaseAdmin as any)
      .from('email_send_log')
      .select('id, message_id, template_name, recipient_email, status, error_message, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(2000)

    if (error) throw new Error(error.message)
    const typedRows = (rows ?? []) as Array<{
      id: string
      message_id: string | null
      template_name: string | null
      recipient_email: string
      status: string
      error_message: string | null
      created_at: string
    }>

    const dedupMap = new Map<string, typeof typedRows[number]>()
    for (const r of typedRows) {
      const key = r.message_id ?? `__no_id_${r.id}`
      if (!dedupMap.has(key)) dedupMap.set(key, r)
    }
    let latest = Array.from(dedupMap.values())

    const stats = {
      total: latest.length,
      sent: latest.filter((r) => r.status === 'sent').length,
      failed: latest.filter((r) => r.status === 'dlq' || r.status === 'failed' || r.status === 'bounced').length,
      suppressed: latest.filter((r) => r.status === 'suppressed' || r.status === 'complained').length,
      pending: latest.filter((r) => r.status === 'pending').length,
    }

    const templates = Array.from(
      new Set(latest.map((r) => r.template_name).filter((t): t is string => !!t)),
    )

    if (data.templateFilter) latest = latest.filter((r) => r.template_name === data.templateFilter)
    if (data.statusFilter) latest = latest.filter((r) => r.status === data.statusFilter)

    return {
      stats,
      templates,
      rows: latest.slice(0, 100),
    }
  })
