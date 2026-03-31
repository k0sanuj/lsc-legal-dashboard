import { NextResponse } from 'next/server'
import { runAgent } from '@/lib/agents/orchestrator'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
