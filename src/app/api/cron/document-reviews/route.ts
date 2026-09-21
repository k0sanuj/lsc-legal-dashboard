/** Materialize each scheduled occurrence once; completing a task is always human. */
import { isAuthorizedCronRequest } from '@/lib/cron-auth'
import { materializeReviewTasks } from '@/lib/review-service'

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await materializeReviewTasks()
  return Response.json({ ok: true, ...result })
}
