"use client";

import { useMemo } from "react";

function money(value: number) {
  return `${(value || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;
}

/* ---------------------------------------------------------------------------
 * Flujo mensual: ingresos vs. gastos (área + línea)
 * ------------------------------------------------------------------------- */
export function MoneyFlowChart({
  data,
}: {
  data: { label: string; income: number; expense: number }[];
}) {
  const W = 720;
  const H = 240;
  const P = { top: 18, right: 12, bottom: 26, left: 44 };

  const max = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 100);
  const step = data.length > 1 ? (W - P.left - P.right) / (data.length - 1) : 0;
  const x = (i: number) => P.left + i * step;
  const y = (v: number) => H - P.bottom - (v / max) * (H - P.top - P.bottom);

  const line = (key: "income" | "expense") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  const area = (key: "income" | "expense") =>
    `${line(key)} L${x(data.length - 1).toFixed(1)},${H - P.bottom} L${x(0).toFixed(1)},${H - P.bottom} Z`;

  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));

  return (
    <div className="w-full">
      <div className="flex items-center gap-5 mb-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-4 rounded-full" style={{ background: "var(--chart-1)" }} /> Ingresos
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-4 rounded-full" style={{ background: "var(--chart-5)" }} /> Gastos
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[240px]" role="img" aria-label="Evolución mensual de ingresos y gastos">
        <defs>
          <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-5)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--chart-5)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={P.left}
              x2={W - P.right}
              y1={y(t)}
              y2={y(t)}
              stroke="currentColor"
              strokeOpacity="0.12"
              strokeDasharray="3 5"
            />
            <text x={8} y={y(t) + 4} className="tabular" fontSize="10" fill="currentColor" opacity="0.5">
              {money(t)}
            </text>
          </g>
        ))}

        <path d={area("income")} fill="url(#gradIncome)" />
        <path d={area("expense")} fill="url(#gradExpense)" />
        <path d={line("income")} fill="none" stroke="var(--chart-1)" strokeWidth="2.5" strokeLinecap="round" />
        <path d={line("expense")} fill="none" stroke="var(--chart-5)" strokeWidth="2.5" strokeLinecap="round" />

        {data.map((d, i) => (
          <g key={d.label + i}>
            <circle cx={x(i)} cy={y(d.income)} r="3.5" fill="var(--chart-1)" />
            <circle cx={x(i)} cy={y(d.expense)} r="3.5" fill="var(--chart-5)" />
            <text
              x={x(i)}
              y={H - 8}
              fontSize="11"
              textAnchor="middle"
              fill="currentColor"
              opacity="0.6"
            >
              {d.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Donut por categoría
 * ------------------------------------------------------------------------- */
export function CategoryDonut({
  data,
  total,
}: {
  data: { name: string; color: string; emoji: string; amount: number }[];
  total: number;
}) {
  const R = 74;
  const STROKE = 22;
  const C = 2 * Math.PI * R;

  const segments = useMemo(() => {
    const visible = data.slice(0, 7);
    return visible.map((d, index) => {
      const fraction = total > 0 ? d.amount / total : 0;
      const offset = visible.slice(0, index).reduce(
        (sum, previous) => sum + (total > 0 ? previous.amount / total : 0) * C,
        0
      );
      return { ...d, fraction, dash: fraction * C, offset };
    });
  }, [data, total, C]);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-7">
      <svg viewBox="0 0 200 200" className="w-[190px] h-[190px] shrink-0 -rotate-90">
        <circle cx="100" cy="100" r={R} fill="none" stroke="currentColor" strokeOpacity="0.09" strokeWidth={STROKE} />
        {segments.map((s) => (
          <circle
            key={s.name}
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={STROKE}
            strokeDasharray={`${Math.max(s.dash - 2, 0)} ${C}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <ul className="w-full space-y-2.5">
        {segments.length === 0 && (
          <li className="text-sm text-muted-foreground">Aún no hay gastos este mes.</li>
        )}
        {segments.map((s) => (
          <li key={s.name} className="flex items-center gap-3 text-sm">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="truncate flex-1">
              {s.emoji} {s.name}
            </span>
            <span className="tabular text-muted-foreground">{(s.fraction * 100).toFixed(0)}%</span>
            <span className="tabular font-medium w-20 text-right">{money(s.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Barras de gasto diario del mes
 * ------------------------------------------------------------------------- */
export function DailyBars({ data }: { data: { day: string; amount: number }[] }) {
  const max = Math.max(...data.map((d) => d.amount), 1);
  return (
    <div className="flex items-end gap-[3px] h-[110px]">
      {data.map((d) => (
        <div key={d.day} className="group relative flex-1 flex items-end h-full">
          <div
            className="w-full rounded-t-[3px] transition-all duration-300 group-hover:opacity-100"
            style={{
              height: `${Math.max((d.amount / max) * 100, d.amount > 0 ? 4 : 1.5)}%`,
              background:
                d.amount > 0 ? "color-mix(in oklch, var(--chart-1) 78%, transparent)" : "currentColor",
              opacity: d.amount > 0 ? 0.9 : 0.12,
            }}
          />
          <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-[10px] tabular opacity-0 shadow-lg ring-1 ring-border transition-opacity group-hover:opacity-100">
            día {d.day}: {money(d.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Anillo de salud financiera
 * ------------------------------------------------------------------------- */
export function ScoreRing({ score, label }: { score: number; label?: string }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const pct = Math.max(Math.min(score, 100), 0);
  const color = pct >= 66 ? "var(--chart-1)" : pct >= 40 ? "var(--chart-4)" : "var(--chart-5)";

  return (
    <div className="relative w-[136px] h-[136px]">
      <svg viewBox="0 0 130 130" className="w-full h-full -rotate-90">
        <circle cx="65" cy="65" r={R} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="12" />
        <circle
          cx="65"
          cy="65"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * C} ${C}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-3xl font-semibold">{pct}</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
          {label || "de 100"}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Barra de progreso de presupuesto / meta
 * ------------------------------------------------------------------------- */
export function Meter({
  value,
  max,
  color,
  height = 8,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const over = max > 0 && value > max;
  return (
    <div
      className="w-full rounded-full bg-muted overflow-hidden"
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${Math.max(pct, 1.5)}%`,
          background: over ? "var(--destructive)" : color || "var(--primary)",
        }}
      />
    </div>
  );
}
