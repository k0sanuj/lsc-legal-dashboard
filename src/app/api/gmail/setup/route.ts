import { watchInbox } from '@/lib/gmail'
import { verifySessionToken } from '@/lib/session'

export async function POST(request: Request) {
  // Verify admin session
  const cookieHeader = request.headers.get('cookie') ?? ''
  const match = cookieHeader.match(/lsc_legal_session=([^;]+)/)
  const session = match?.[1] ? await verifySessionToken(match[1]) : null
  if (!session || !['PLATFORM_ADMIN', 'LEGAL_ADMIN'].includes(session.role)) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const result = await watchInbox()
    return Response.json({ success: true, data: result })
  } catch (error) {
    console.error('Gmail watch setup error:', error)
    return Response.json({ error: 'Failed to setup inbox watch' }, { status: 500 })
  }
}
