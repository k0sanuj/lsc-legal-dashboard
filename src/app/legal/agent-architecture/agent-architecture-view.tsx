'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Bot,
  ShieldCheck,
  FileText,
  Mail,
  Gavel,
  UserCheck,
  Lock,
  ClipboardCheck,
  ArrowRight,
  Activity,
  Zap,
  CircleDot,
} from 'lucide-react'

// ─── Agent Node Definitions ──────────────────────────────────────────────────

interface AgentNode {
  id: string
  name: string
  shortName: string
  icon: keyof typeof ICON_MAP
  color: string
  ring: 'core' | 'inner' | 'outer'
  children?: string[]
  description: string
}

const ICON_MAP = {
  Bot,
  ShieldCheck,
  FileText,
  Mail,
  Gavel,
  UserCheck,
  Lock,
  ClipboardCheck,
}

const AGENTS: AgentNode[] = [
  {
    id: 'orchestrator',
    name: 'Central Legal Orchestrator',
    shortName: 'Orchestrator',
    icon: 'Bot',
    color: 'from-violet-500 to-purple-600',
    ring: 'core',
    children: ['compliance', 'agreement-analyzer', 'email-inbox', 'litigation', 'kyc', 'compliance-audit', 'data-compliance-officer'],
    description: 'Routes messages, resolves conflicts, maintains global state graph',
  },
  {
    id: 'compliance',
    name: 'Compliance Agent',
    shortName: 'Compliance',
    icon: 'ShieldCheck',
    color: 'from-emerald-500 to-green-600',
    ring: 'inner',
    children: ['compliance.jurisdiction', 'compliance.data-protection', 'compliance.renewal-tracker'],
    description: 'Per-entity compliance scanning every 15 days',
  },
  {
    id: 'agreement-analyzer',
    name: 'Agreement Analyzer',
    shortName: 'Agreements',
    icon: 'FileText',
    color: 'from-blue-500 to-cyan-600',
    ring: 'inner',
    children: ['agreement-analyzer.categorization', 'agreement-analyzer.clause-extraction', 'agreement-analyzer.clickwrap-tracker'],
    description: 'AI-powered document categorization and clause extraction',
  },
  {
    id: 'email-inbox',
    name: 'Email / Inbox Agent',
    shortName: 'Email Intel',
    icon: 'Mail',
    color: 'from-amber-500 to-orange-600',
    ring: 'inner',
    children: ['email-inbox.invoice-detection', 'email-inbox.notice-detection', 'email-inbox.deadline-extraction'],
    description: 'Monitors legal@leaguesportsco.com, detects invoices and notices',
  },
  {
    id: 'litigation',
    name: 'Litigation Agent',
    shortName: 'Litigation',
    icon: 'Gavel',
    color: 'from-rose-500 to-red-600',
    ring: 'inner',
    children: ['litigation.case-tracker', 'litigation.finance-liaison'],
    description: 'Case tracking and financial exposure to Finance Dashboard',
  },
  {
    id: 'kyc',
    name: 'KYC Agent',
    shortName: 'KYC',
    icon: 'UserCheck',
    color: 'from-sky-500 to-blue-600',
    ring: 'inner',
    children: ['kyc.admin-accounts', 'kyc.vendor-verification'],
    description: 'KYC document verification and admin account tracking',
  },
  {
    id: 'compliance-audit',
    name: 'Compliance Audit Agent',
    shortName: 'Auditor',
    icon: 'ClipboardCheck',
    color: 'from-fuchsia-500 to-pink-600',
    ring: 'inner',
    children: ['compliance-audit.entity-scanner', 'compliance-audit.office-tracker', 'compliance-audit.email-checker'],
    description: 'Adversarial 15-day full compliance audit',
  },
  {
    id: 'data-compliance-officer',
    name: 'Data Compliance Officer',
    shortName: 'Data Officer',
    icon: 'Lock',
    color: 'from-teal-500 to-emerald-600',
    ring: 'inner',
    children: ['data-compliance-officer.gdpr', 'data-compliance-officer.jurisdiction-policy', 'data-compliance-officer.officer-assignment'],
    description: 'GDPR/PDPL compliance, DPO assignments, health scores',
  },
]

// ─── Scenario Definitions (the ontology flows) ──────────────────────────────

interface FlowStep {
  from: string
  to: string
  label: string
  intent: string
  delay: number
}

interface Scenario {
  name: string
  trigger: string
  description: string
  color: string
  steps: FlowStep[]
}

const SCENARIOS: Scenario[] = [
  {
    name: 'Document Upload',
    trigger: 'User uploads a new agreement',
    description: 'When a document is uploaded, the Agreement Analyzer auto-categorizes it, extracts clauses, checks compliance implications, and notifies finance if it has cost impact.',
    color: 'text-blue-400',
    steps: [
      { from: 'platform', to: 'orchestrator', label: 'New document uploaded', intent: 'document_uploaded', delay: 0 },
      { from: 'orchestrator', to: 'agreement-analyzer', label: 'Analyze document', intent: 'analyze_document', delay: 800 },
      { from: 'agreement-analyzer', to: 'agreement-analyzer.categorization', label: 'Auto-categorize', intent: 'categorize', delay: 1400 },
      { from: 'agreement-analyzer', to: 'agreement-analyzer.clause-extraction', label: 'Extract clauses', intent: 'extract_clauses', delay: 1600 },
      { from: 'agreement-analyzer', to: 'orchestrator', label: 'Analysis complete', intent: 'analysis_result', delay: 2800 },
      { from: 'orchestrator', to: 'compliance', label: 'Check compliance impact', intent: 'compliance_check', delay: 3400 },
      { from: 'compliance', to: 'compliance.jurisdiction', label: 'Jurisdiction check', intent: 'jurisdiction_check', delay: 4000 },
      { from: 'compliance', to: 'orchestrator', label: 'Compliance OK', intent: 'compliance_result', delay: 4800 },
      { from: 'orchestrator', to: 'finance', label: 'Financial impact update', intent: 'finance_cost_update', delay: 5400 },
    ],
  },
  {
    name: 'Email Invoice',
    trigger: 'Invoice email arrives at legal@leaguesportsco.com',
    description: 'Incoming email is scanned, invoice detected, math verified, tagged, and routed — TBR invoices go directly to the Finance Dashboard.',
    color: 'text-amber-400',
    steps: [
      { from: 'gmail', to: 'email-inbox', label: 'New email received', intent: 'email_received', delay: 0 },
      { from: 'email-inbox', to: 'email-inbox.invoice-detection', label: 'Scan for invoice', intent: 'detect_invoice', delay: 600 },
      { from: 'email-inbox.invoice-detection', to: 'email-inbox', label: 'Invoice detected!', intent: 'invoice_found', delay: 1400 },
      { from: 'email-inbox', to: 'orchestrator', label: 'Invoice verified', intent: 'invoice_verified', delay: 2000 },
      { from: 'orchestrator', to: 'kyc', label: 'Verify vendor KYC', intent: 'vendor_check', delay: 2600 },
      { from: 'kyc', to: 'kyc.vendor-verification', label: 'Check vendor records', intent: 'verify_vendor', delay: 3200 },
      { from: 'kyc', to: 'orchestrator', label: 'Vendor verified', intent: 'vendor_result', delay: 3800 },
      { from: 'orchestrator', to: 'finance', label: 'Route TBR invoice to Finance', intent: 'route_to_finance', delay: 4400 },
    ],
  },
  {
    name: 'Legal Notice',
    trigger: 'Legal notice received from regulator',
    description: 'A legal notice triggers deadline extraction, jurisdiction lookup, compliance officer assignment, and escalation tracking.',
    color: 'text-rose-400',
    steps: [
      { from: 'gmail', to: 'email-inbox', label: 'Notice email detected', intent: 'email_received', delay: 0 },
      { from: 'email-inbox', to: 'email-inbox.notice-detection', label: 'Classify as legal notice', intent: 'detect_notice', delay: 700 },
      { from: 'email-inbox', to: 'email-inbox.deadline-extraction', label: 'Extract deadlines', intent: 'extract_deadline', delay: 900 },
      { from: 'email-inbox', to: 'orchestrator', label: 'Notice + deadline', intent: 'notice_detected', delay: 1600 },
      { from: 'orchestrator', to: 'compliance', label: 'Assign to compliance', intent: 'assign_notice', delay: 2200 },
      { from: 'compliance', to: 'compliance.jurisdiction', label: 'Jurisdiction response rules', intent: 'jurisdiction_deadline', delay: 2800 },
      { from: 'compliance', to: 'data-compliance-officer', label: 'Data protection check', intent: 'dpo_check', delay: 3200 },
      { from: 'data-compliance-officer', to: 'data-compliance-officer.officer-assignment', label: 'Assign DPO', intent: 'assign_officer', delay: 3800 },
      { from: 'orchestrator', to: 'litigation', label: 'Flag for litigation review', intent: 'litigation_flag', delay: 4400 },
    ],
  },
  {
    name: '15-Day Audit',
    trigger: 'Cron job fires /api/cron/full-audit',
    description: 'The Compliance Audit Agent runs an adversarial scan across all entities, jurisdictions, KYC, emails, offices, and admin accounts — poking holes and generating a full report.',
    color: 'text-fuchsia-400',
    steps: [
      { from: 'cron', to: 'orchestrator', label: 'Audit triggered', intent: 'audit_start', delay: 0 },
      { from: 'orchestrator', to: 'compliance-audit', label: 'Run full audit', intent: 'run_audit', delay: 600 },
      { from: 'compliance-audit', to: 'compliance-audit.entity-scanner', label: 'Scan LSC/TBR/FSP', intent: 'scan_entities', delay: 1200 },
      { from: 'compliance-audit', to: 'compliance-audit.office-tracker', label: 'Check offices', intent: 'check_offices', delay: 1400 },
      { from: 'compliance-audit', to: 'compliance-audit.email-checker', label: 'Check emails', intent: 'check_emails', delay: 1600 },
      { from: 'compliance-audit', to: 'compliance', label: 'Cross-check compliance records', intent: 'compliance_crosscheck', delay: 2400 },
      { from: 'compliance-audit', to: 'kyc', label: 'Cross-check KYC docs', intent: 'kyc_crosscheck', delay: 2800 },
      { from: 'compliance-audit', to: 'orchestrator', label: 'Audit report ready', intent: 'audit_complete', delay: 3800 },
      { from: 'orchestrator', to: 'platform', label: 'Notify compliance officers', intent: 'notify_officers', delay: 4400 },
    ],
  },
  {
    name: 'Litigation Exposure',
    trigger: 'New litigation case filed',
    description: 'A litigation case creates financial exposure that must be communicated to the Finance Dashboard, with ongoing status updates.',
    color: 'text-red-400',
    steps: [
      { from: 'platform', to: 'orchestrator', label: 'Case created', intent: 'case_created', delay: 0 },
      { from: 'orchestrator', to: 'litigation', label: 'Process new case', intent: 'new_case', delay: 600 },
      { from: 'litigation', to: 'litigation.case-tracker', label: 'Track case status', intent: 'track_case', delay: 1200 },
      { from: 'litigation', to: 'litigation.finance-liaison', label: 'Calculate exposure', intent: 'calc_exposure', delay: 1400 },
      { from: 'litigation.finance-liaison', to: 'orchestrator', label: 'Exposure: AED 500K', intent: 'exposure_update', delay: 2200 },
      { from: 'orchestrator', to: 'finance', label: 'Financial exposure alert', intent: 'finance_exposure', delay: 2800 },
      { from: 'orchestrator', to: 'compliance', label: 'Regulatory implications', intent: 'regulatory_check', delay: 3200 },
    ],
  },
]

// ─── Types ───────────────────────────────────────────────────────────────────

interface MessageFlow {
  id: string
  from: string
  to: string
  intent: string
  priority: string
  responded: boolean
  timestamp: string
}

interface ActivityEntry {
  id: string
  agentId: string
  agentName: string
  action: string
  timestamp: string
}

interface Stats {
  totalMessages: number
  totalActions: number
  pendingMessages: number
  topIntents: { intent: string; count: number }[]
}

interface Props {
  messageFlows: MessageFlow[]
  activityLog: ActivityEntry[]
  stats: Stats
}

// ─── Animated Particle ──────────────────────────────────────────────────────

interface Particle {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  progress: number
  color: string
  label: string
  intent: string
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function AgentArchitectureView({ messageFlows, activityLog, stats }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeScenario, setActiveScenario] = useState<number>(0)
  const [particles, setParticles] = useState<Particle[]>([])
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set())
  const [currentStep, setCurrentStep] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(true)
  const [liveLog, setLiveLog] = useState<{ text: string; color: string; time: string }[]>([])
  const animRef = useRef<number>(0)
  const timeoutsRef = useRef<NodeJS.Timeout[]>([])

  // Agent positions on the radial layout
  const getAgentPosition = useCallback((agentId: string, width: number, height: number): { x: number; y: number } => {
    const cx = width / 2
    const cy = height / 2
    const innerAgents = AGENTS.filter((a) => a.ring === 'inner')
    const idx = innerAgents.findIndex((a) => a.id === agentId)

    if (agentId === 'orchestrator') return { x: cx, y: cy }
    if (agentId === 'platform') return { x: cx - 260, y: cy - 200 }
    if (agentId === 'finance') return { x: cx + 260, y: cy - 200 }
    if (agentId === 'gmail') return { x: cx - 260, y: cy + 180 }
    if (agentId === 'cron') return { x: cx + 260, y: cy + 180 }

    // Sub-agents
    if (agentId.includes('.')) {
      const parentId = agentId.split('.')[0]
      const parent = getAgentPosition(parentId, width, height)
      const parentAgent = AGENTS.find((a) => a.id === parentId)
      const childIdx = parentAgent?.children?.indexOf(agentId) ?? 0
      const childCount = parentAgent?.children?.length ?? 1
      const spreadAngle = 0.4
      const baseAngle = Math.atan2(parent.y - cy, parent.x - cx)
      const angle = baseAngle + (childIdx - (childCount - 1) / 2) * spreadAngle
      const dist = 80
      return { x: parent.x + Math.cos(angle) * dist, y: parent.y + Math.sin(angle) * dist }
    }

    if (idx === -1) return { x: cx, y: cy }
    const angle = (idx / innerAgents.length) * Math.PI * 2 - Math.PI / 2
    const radius = Math.min(width, height) * 0.32
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius }
  }, [])

  // Run scenario animation
  const runScenario = useCallback((scenarioIdx: number) => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
    setParticles([])
    setActiveAgents(new Set())
    setCurrentStep(-1)
    setLiveLog([])

    const scenario = SCENARIOS[scenarioIdx]
    if (!scenario) return

    const container = containerRef.current
    if (!container) return
    const width = container.clientWidth
    const height = 500

    scenario.steps.forEach((step, i) => {
      const t = setTimeout(() => {
        setCurrentStep(i)
        setActiveAgents((prev) => new Set([...prev, step.from, step.to]))

        const fromPos = getAgentPosition(step.from, width, height)
        const toPos = getAgentPosition(step.to, width, height)

        const particleId = `p-${scenarioIdx}-${i}-${Date.now()}`
        setParticles((prev) => [
          ...prev,
          {
            id: particleId,
            fromX: fromPos.x,
            fromY: fromPos.y,
            toX: toPos.x,
            toY: toPos.y,
            progress: 0,
            color: scenario.color.replace('text-', ''),
            label: step.label,
            intent: step.intent,
          },
        ])

        setLiveLog((prev) => [
          {
            text: `${step.from} → ${step.to}: ${step.label}`,
            color: scenario.color,
            time: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 14),
        ])

        // Remove particle after animation
        const removeT = setTimeout(() => {
          setParticles((prev) => prev.filter((p) => p.id !== particleId))
        }, 1200)
        timeoutsRef.current.push(removeT)
      }, step.delay)
      timeoutsRef.current.push(t)
    })

    // Auto-advance to next scenario
    const totalDuration = Math.max(...scenario.steps.map((s) => s.delay)) + 3000
    const nextT = setTimeout(() => {
      if (isPlaying) {
        const next = (scenarioIdx + 1) % SCENARIOS.length
        setActiveScenario(next)
        runScenario(next)
      }
    }, totalDuration)
    timeoutsRef.current.push(nextT)
  }, [getAgentPosition, isPlaying])

  useEffect(() => {
    if (isPlaying) {
      runScenario(activeScenario)
    }
    return () => {
      timeoutsRef.current.forEach(clearTimeout)
    }
  }, [activeScenario, isPlaying])

  // Animate particles
  useEffect(() => {
    const animate = () => {
      setParticles((prev) =>
        prev.map((p) => ({ ...p, progress: Math.min(p.progress + 0.025, 1) }))
      )
      animRef.current = requestAnimationFrame(animate)
    }
    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [])

  // Draw canvas connections
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = container.clientWidth
    const height = 500
    canvas.width = width * 2
    canvas.height = height * 2
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(2, 2)

    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      // Draw base connections (orchestrator to inner agents)
      const orchPos = getAgentPosition('orchestrator', width, height)
      AGENTS.filter((a) => a.ring === 'inner').forEach((agent) => {
        const pos = getAgentPosition(agent.id, width, height)
        const isActive = activeAgents.has(agent.id)
        ctx.beginPath()
        ctx.moveTo(orchPos.x, orchPos.y)
        ctx.lineTo(pos.x, pos.y)
        ctx.strokeStyle = isActive ? 'rgba(139, 92, 246, 0.4)' : 'rgba(100, 116, 139, 0.12)'
        ctx.lineWidth = isActive ? 1.5 : 0.5
        ctx.setLineDash(isActive ? [] : [4, 4])
        ctx.stroke()
        ctx.setLineDash([])

        // Draw sub-agent connections
        agent.children?.forEach((childId) => {
          const childPos = getAgentPosition(childId, width, height)
          const childActive = activeAgents.has(childId)
          ctx.beginPath()
          ctx.moveTo(pos.x, pos.y)
          ctx.lineTo(childPos.x, childPos.y)
          ctx.strokeStyle = childActive ? 'rgba(139, 92, 246, 0.3)' : 'rgba(100, 116, 139, 0.08)'
          ctx.lineWidth = childActive ? 1 : 0.5
          ctx.setLineDash(childActive ? [] : [2, 4])
          ctx.stroke()
          ctx.setLineDash([])
        })
      })

      // Draw external connections
      const externals = ['platform', 'finance', 'gmail', 'cron']
      externals.forEach((ext) => {
        const pos = getAgentPosition(ext, width, height)
        const isActive = activeAgents.has(ext)
        ctx.beginPath()
        ctx.moveTo(orchPos.x, orchPos.y)
        ctx.lineTo(pos.x, pos.y)
        ctx.strokeStyle = isActive ? 'rgba(234, 179, 8, 0.4)' : 'rgba(100, 116, 139, 0.08)'
        ctx.lineWidth = isActive ? 1 : 0.5
        ctx.setLineDash([6, 4])
        ctx.stroke()
        ctx.setLineDash([])
      })

      // Draw animated particles
      particles.forEach((p) => {
        const x = p.fromX + (p.toX - p.fromX) * p.progress
        const y = p.fromY + (p.toY - p.fromY) * p.progress
        const alpha = p.progress < 0.1 ? p.progress * 10 : p.progress > 0.9 ? (1 - p.progress) * 10 : 1

        // Glow
        ctx.beginPath()
        ctx.arc(x, y, 8, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(139, 92, 246, ${alpha * 0.3})`
        ctx.fill()

        // Core
        ctx.beginPath()
        ctx.arc(x, y, 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(167, 139, 250, ${alpha})`
        ctx.fill()

        // Trail
        const trailLen = 5
        for (let t = 1; t <= trailLen; t++) {
          const tp = Math.max(0, p.progress - t * 0.02)
          const tx = p.fromX + (p.toX - p.fromX) * tp
          const ty = p.fromY + (p.toY - p.fromY) * tp
          ctx.beginPath()
          ctx.arc(tx, ty, 2 - t * 0.3, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(167, 139, 250, ${alpha * (1 - t / trailLen) * 0.5})`
          ctx.fill()
        }

        // Label
        if (p.progress > 0.3 && p.progress < 0.7) {
          ctx.font = '10px system-ui'
          ctx.fillStyle = `rgba(203, 213, 225, ${alpha})`
          ctx.textAlign = 'center'
          ctx.fillText(p.intent, x, y - 14)
        }
      })

      requestAnimationFrame(draw)
    }
    draw()
  }, [particles, activeAgents, getAgentPosition])

  const scenario = SCENARIOS[activeScenario]

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-violet-400" />
              <span className="text-xs text-muted-foreground">Total Messages</span>
            </div>
            <p className="text-xl font-bold font-mono tabular-nums mt-1">{stats.totalMessages}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">Agent Actions</span>
            </div>
            <p className="text-xl font-bold font-mono tabular-nums mt-1">{stats.totalActions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <CircleDot className="size-4 text-rose-400" />
              <span className="text-xs text-muted-foreground">Pending</span>
            </div>
            <p className="text-xl font-bold font-mono tabular-nums mt-1">{stats.pendingMessages}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">Active Agents</span>
            </div>
            <p className="text-xl font-bold font-mono tabular-nums mt-1">{AGENTS.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Scenario selector */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Live Flow Simulation</CardTitle>
              <CardDescription>Select a scenario to see how agents communicate in real-time</CardDescription>
            </div>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-3 py-1 rounded-md text-xs font-medium bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {SCENARIOS.map((s, i) => (
              <button
                key={s.name}
                onClick={() => { setActiveScenario(i); runScenario(i) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeScenario === i
                    ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
          {scenario && (
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              <span className={`font-medium ${scenario.color}`}>{scenario.trigger}</span>
              {' — '}{scenario.description}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Architecture visualization */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div ref={containerRef} className="relative" style={{ height: 500 }}>
            <canvas ref={canvasRef} className="absolute inset-0" />

            {/* Orchestrator node */}
            <AgentNodeView
              agent={AGENTS[0]}
              position={getAgentPosition('orchestrator', containerRef.current?.clientWidth ?? 800, 500)}
              isActive={activeAgents.has('orchestrator')}
              isCore
            />

            {/* Inner agent nodes */}
            {AGENTS.filter((a) => a.ring === 'inner').map((agent) => (
              <AgentNodeView
                key={agent.id}
                agent={agent}
                position={getAgentPosition(agent.id, containerRef.current?.clientWidth ?? 800, 500)}
                isActive={activeAgents.has(agent.id)}
              />
            ))}

            {/* Sub-agent dots */}
            {AGENTS.filter((a) => a.ring === 'inner').flatMap((agent) =>
              (agent.children ?? []).map((childId) => {
                const pos = getAgentPosition(childId, containerRef.current?.clientWidth ?? 800, 500)
                const isActive = activeAgents.has(childId)
                return (
                  <div
                    key={childId}
                    className={`absolute flex items-center justify-center rounded-full transition-all duration-300 ${
                      isActive ? 'size-6 bg-violet-500/30 ring-1 ring-violet-400/50' : 'size-4 bg-muted/50'
                    }`}
                    style={{ left: pos.x - (isActive ? 12 : 8), top: pos.y - (isActive ? 12 : 8) }}
                    title={childId}
                  >
                    <div className={`rounded-full ${isActive ? 'size-2.5 bg-violet-400' : 'size-1.5 bg-muted-foreground/30'}`} />
                  </div>
                )
              })
            )}

            {/* External system nodes */}
            {[
              { id: 'platform', label: 'Platform UI', color: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
              { id: 'finance', label: 'Finance Dashboard', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
              { id: 'gmail', label: 'Gmail / Pub/Sub', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
              { id: 'cron', label: 'Vercel Cron', color: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30' },
            ].map((ext) => {
              const pos = getAgentPosition(ext.id, containerRef.current?.clientWidth ?? 800, 500)
              return (
                <div
                  key={ext.id}
                  className={`absolute px-2.5 py-1 rounded-md text-[10px] font-medium border transition-all duration-300 ${ext.color} ${
                    activeAgents.has(ext.id) ? 'scale-110 ring-1 ring-white/10' : 'opacity-60'
                  }`}
                  style={{ left: pos.x - 45, top: pos.y - 12 }}
                >
                  {ext.label}
                </div>
              )
            })}
          </div>
        </Card>

        {/* Live message log */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
              </span>
              Live Message Feed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
              {liveLog.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">
                  Waiting for agent activity...
                </p>
              ) : (
                liveLog.map((entry, i) => (
                  <div
                    key={i}
                    className={`text-[11px] leading-relaxed transition-opacity duration-500 ${
                      i === 0 ? 'opacity-100' : i < 5 ? 'opacity-80' : 'opacity-40'
                    }`}
                  >
                    <span className="text-muted-foreground/50 font-mono text-[10px]">
                      {entry.time}
                    </span>{' '}
                    <span className={entry.color}>{entry.text}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scenario steps detail */}
      {scenario && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              Flow Steps — {scenario.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {scenario.steps.map((step, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-all duration-300 ${
                    i <= currentStep
                      ? 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/20'
                      : 'bg-muted/30 text-muted-foreground/50'
                  }`}
                >
                  <span className="font-medium">{step.from}</span>
                  <ArrowRight className="size-2.5" />
                  <span className="font-medium">{step.to}</span>
                  {i <= currentStep && (
                    <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-violet-500/20">
                      {step.intent}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* DB activity table */}
      {activityLog.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent Agent Activity (from DB)</CardTitle>
            <CardDescription>{activityLog.length} recent log entries</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {activityLog.slice(0, 30).map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 text-xs py-1 border-b border-border/30 last:border-0">
                  <Badge variant="outline" className="text-[10px] shrink-0">{entry.agentName}</Badge>
                  <span className="text-muted-foreground">{entry.action}</span>
                  <span className="ml-auto text-muted-foreground/50 font-mono text-[10px] shrink-0">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Agent Node Component ───────────────────────────────────────────────────

function AgentNodeView({
  agent,
  position,
  isActive,
  isCore,
}: {
  agent: AgentNode
  position: { x: number; y: number }
  isActive: boolean
  isCore?: boolean
}) {
  const Icon = ICON_MAP[agent.icon] ?? Bot
  const size = isCore ? 56 : 40

  return (
    <div
      className={`absolute flex flex-col items-center transition-all duration-300 ${
        isActive ? 'scale-110 z-10' : 'z-0'
      }`}
      style={{ left: position.x - size / 2, top: position.y - size / 2 }}
      title={agent.description}
    >
      <div
        className={`flex items-center justify-center rounded-xl bg-linear-to-br ${agent.color} transition-all duration-300 ${
          isActive ? 'ring-2 ring-white/20 shadow-lg shadow-violet-500/20' : ''
        }`}
        style={{ width: size, height: size }}
      >
        <Icon className={isCore ? 'size-6' : 'size-4'} style={{ color: 'white' }} />
        {isActive && (
          <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-2.5 bg-emerald-500" />
          </span>
        )}
      </div>
      <span className={`mt-1 text-[10px] font-medium whitespace-nowrap transition-colors ${
        isActive ? 'text-foreground' : 'text-muted-foreground/60'
      }`}>
        {agent.shortName}
      </span>
    </div>
  )
}
