"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts"

interface TrackerBarData {
  name: string
  total: number
  complete: number
}

interface TrackerBarChartProps {
  data: TrackerBarData[]
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; name: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const complete = payload.find((p) => p.name === "complete")?.value ?? 0
  const remaining = payload.find((p) => p.name === "remaining")?.value ?? 0
  const total = complete + remaining
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0
  return (
    <div className="rounded-lg border px-3 py-2" style={{ background: "#0f172a", borderColor: "#1e293b" }}>
      <p className="text-sm font-medium" style={{ color: "#fff" }}>
        {label}
      </p>
      <p className="text-xs font-mono tabular-nums" style={{ color: "#94a3b8" }}>
        {complete} / {total} complete ({pct}%)
      </p>
    </div>
  )
}

export function TrackerBarChart({ data }: TrackerBarChartProps) {
  const chartData = data.map((d) => ({
    name: d.name,
    complete: d.complete,
    remaining: d.total - d.complete,
  }))

  return (
    <ResponsiveContainer width="100%" height={data.length * 44 + 20}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#1e293b" />
        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="complete" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
        <Bar dataKey="remaining" stackId="a" fill="#334155" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
