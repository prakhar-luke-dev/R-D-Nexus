"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtPct } from "@/lib/meta";
import type { TrendPoint } from "@/lib/types";

// SVG presentation attributes don't resolve CSS variables, so charts use concrete values. They
// mirror the --chart-* tokens in globals.css (validated for the dark chart surface).
const C = {
  code: "#0f9e8d",
  validation: "#c98428",
  single: "#6f7fe8",
  grid: "#1f2733",
  faint: "#6b7686",
  muted: "#9aa4b2",
  surface: "#11161e",
  cursor: "#2f3a4a",
};

const AXIS = { stroke: C.grid, tick: { fill: C.faint, fontSize: 11 }, tickLine: false };

function TipBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border-strong bg-surface-2/95 px-3 py-2 text-xs shadow-xl shadow-black/40 backdrop-blur">{children}</div>;
}

/** Team progress over time: two series (code, validation) on one 0–100 axis, legend + end labels. */
export function TrendChart({ data, height = 220 }: { data: TrendPoint[]; height?: number }) {
  const rows = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
  }));
  const last = rows[rows.length - 1];
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: C.code }} /> Code</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: C.validation }} /> Validation</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 8, right: 118, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" {...AXIS} axisLine={false} minTickGap={24} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} {...AXIS} axisLine={false} unit="%" />
          <Tooltip
            cursor={{ stroke: C.cursor, strokeWidth: 1 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TipBox>
                  <div className="mb-1 text-faint">{label}</div>
                  {payload.map((p) => (
                    <div key={String(p.dataKey)} className="flex items-center gap-2 text-text">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                      <span className="text-muted">{p.dataKey === "code_progress" ? "Code" : "Validation"}</span>
                      <span className="ml-auto pl-3 font-medium tabular-nums">{fmtPct(p.value as number)}</span>
                    </div>
                  ))}
                </TipBox>
              ) : null
            }
          />
          {(["code_progress", "validation_progress"] as const).map((k) => (
            <Line
              key={k}
              dataKey={k}
              type="monotone"
              stroke={k === "code_progress" ? C.code : C.validation}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }}
              isAnimationActive={false}
              label={(props: { index?: number; x?: number | string; y?: number | string }) =>
                last && props.index === rows.length - 1 ? (
                  <text key={k} x={Number(props.x ?? 0) + 8} y={Number(props.y ?? 0) + 4} fontSize={11} fill={C.muted}>
                    {k === "code_progress" ? "Code" : "Validation"} {fmtPct(last[k])}
                  </text>
                ) : (
                  <g key={`${k}-${props.index}`} />
                )
              }
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One metric across experiments: a single series, so no legend; the title names it. */
export function MetricBars({ rows, metric, height = 220 }: { rows: { name: string; value: number }[]; metric: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: -12 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="name" {...AXIS} axisLine={{ stroke: C.grid }} interval={0} tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)} />
        <YAxis {...AXIS} axisLine={false} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipBox>
                <div className="text-faint">{payload[0].payload.name}</div>
                <div className="mt-0.5 text-text">
                  {metric}: <span className="font-semibold tabular-nums">{String(payload[0].value)}</span>
                </div>
              </TipBox>
            ) : null
          }
        />
        <Bar
          dataKey="value"
          fill={C.single}
          radius={[4, 4, 0, 0]}
          maxBarSize={44}
          isAnimationActive={false}
          label={{ position: "top", fill: C.muted, fontSize: 11 }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
