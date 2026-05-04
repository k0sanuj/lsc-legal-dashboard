import { NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/cron-auth'
import { watchInboxes } from '@/lib/gmail'

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const watches = await watchInboxes()
    return NextResponse.json({ success: true, data: watches })
  } catch (error) {
    console.error('Gmail watch renewal failed:', error)
    return NextResponse.json({ error: 'Gmail watch renewal failed' }, { status: 500 })
  }
}
