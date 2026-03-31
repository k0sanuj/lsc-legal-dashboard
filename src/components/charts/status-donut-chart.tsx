"use client"

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

interface StatusDonutData {
  name: string
  value: number
  color: string
}

interface StatusDonutChartProps {
  data: StatusDonutData[]
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: StatusDonutData }>
}) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  return (
    <div className="rounded-lg border px-3 py-2" style={{ background: "#0f172a", borderColor: "#1e293b" }}>
      <p className="text-sm font-medium" style={{ color: "#fff" }}>
        {item.name}
      </p>
      <p className="text-xs font-mono tabular-nums" style={{ color: "#94a3b8" }}>
        {item.value} document{item.value !== 1 ? "s" : ""}
      </p>
    </div>
  )
}

export function StatusDonutChart({ data }: StatusDonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold font-mono tabular-nums">{total}</span>
          <span className="text-xs text-muted-foreground">Total</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: d.color }}
            />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="font-mono tabular-nums font-medium">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
