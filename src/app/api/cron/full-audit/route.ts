import { NextResponse } from 'next/server'
import { runAgent } from '@/lib/agents/orchestrator'
import { isAuthorizedCronRequest } from '@/lib/cron-auth'

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runAgent('compliance-audit')
    return NextResponse.json({ success: true, data: result.data })
  } catch (error) {
    console.error('Full audit failed:', error)
    return NextResponse.json({ error: 'Full audit failed' }, { status: 500 })
  }
}
