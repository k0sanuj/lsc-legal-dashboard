import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { AgentArchitectureView } from "./agent-architecture-view"
import { Bot } from "lucide-react"

export default async function AgentArchitecturePage() {
  await requireSession()

  // Fetch real agent activity and messages
  const [recentMessages, recentLogs, messageCounts] = await Promise.all([
    prisma.agentMessage.findMany({
      orderBy: { created_at: "desc" },
      take: 50,
    }),
    prisma.agentActivityLog.findMany({
      orderBy: { created_at: "desc" },
      take: 100,
    }),
    prisma.agentMessage.groupBy({
      by: ["intent"],
      _count: true,
      orderBy: { _count: { intent: "desc" } },
      take: 10,
    }),
  ])

  // Build message flow data from real DB records
  const messageFlows = recentMessages.map((m) => ({
    id: m.id,
    from: m.from_agent,
    to: m.to_agent,
    intent: m.intent,
    priority: m.priority,
    responded: m.responded,
    timestamp: m.created_at.toISOString(),
  }))

  const activityLog = recentLogs.map((l) => ({
    id: l.id,
    agentId: l.agent_id,
    agentName: l.agent_name,
    action: l.action,
    timestamp: l.created_at.toISOString(),
  }))

  const stats = {
    totalMessages: await prisma.agentMessage.count(),
    totalActions: await prisma.agentActivityLog.count(),
    pendingMessages: await prisma.agentMessage.count({ where: { responded: false } }),
    topIntents: messageCounts.map((m) => ({ intent: m.intent, count: m._count })),
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-purple-600">
          <Bot className="size-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent Architecture</h1>
          <p className="text-sm text-muted-foreground">
            Live agent communication topology and message flows
          </p>
        </div>
      </div>

      <AgentArchitectureView
        messageFlows={messageFlows}
        activityLog={activityLog}
        stats={stats}
      />
    </div>
  )
}
