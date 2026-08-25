"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrency } from "@/components/CurrencyProvider";

/**
 * Ancho real en píxeles del contenedor. Los SVG usan `viewBox`, así que al
 * encogerse en un móvil el texto se encoge con ellos y queda ilegible: con
 * esta medida compensamos el tamaño de fuente para que siempre se lea.
 */
function useRenderedWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

/**
 * Las gráficas reciben importes YA convertidos a la moneda principal del
 * usuario, así que aquí sólo hace falta el formateador de esa moneda. Sin
 * decimales: en un eje o una etiqueta corta los céntimos sólo estorban.
 */
function useChartMoney() {
  const { money } = useCurrency();
  return (value: number) => money(value || 0, undefined, { decimals: 0 });
}

/* ---------------------------------------------------------------------------
 * Flujo mensual: ingresos vs. gastos (área + línea)
 * ------------------------------------------------------------------------- */
export function MoneyFlowChart({
  data,
}: {
  data: { label: string; income: number; expense: number }[];
}) {
  const money = useChartMoney();
  const { ref, width: rendered } = useRenderedWidth<HTMLDivElement>();
  const compact = rendered > 0 && rendered < 520;

  // En móvil usamos un lienzo más estrecho: así el gráfico conserva altura
  // útil en vez de quedar aplastado al escalarse a un ancho de teléfono.
  const W = compact ? 420 : 720;
  const H = compact ? 250 : 240;
  // Factor de compensación: cuánto se encoge el SVG respecto a su viewBox.
  const k = rendered > 0 ? Math.min(Math.max(W / rendered, 1), 2.6) : 1;
  const fs = (size: number) => +(size * k).toFixed(1);
  const P = { top: 18, right: 12, bottom: compact ? 34 : 26, left: compact ? 30 + 26 * k : 44 };

  const max = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 100);
  const step = data.length > 1 ? (W - P.left - P.right) / (data.length - 1) : 0;
  const x = (i: number) => P.left + i * step;
  const y = (v: number) => H - P.bottom - (v / max) * (H - P.top - P.bottom);

  const line = (key: "income" | "expense") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  const area = (key: "income" | "expense") =>
    `${line(key)} L${x(data.length - 1).toFixed(1)},${H - P.bottom} L${x(0).toFixed(1)},${H - P.bottom} Z`;

  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  // Con la fuente agrandada las etiquetas chocan: dejamos solo las que caben.
  const labelEvery = compact ? Math.max(1, Math.ceil((data.length * fs(11) * 3.4) / W)) : 1;

  return (
    <div className="w-full" ref={ref}>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-4 rounded-full" style={{ background: "var(--chart-1)" }} /> Ingresos
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-4 rounded-full" style={{ background: "var(--chart-5)" }} /> Gastos
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Evolución mensual de ingresos y gastos">
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
            <text
              x={4}
              y={y(t) + fs(4)}
              className="tabular"
              fontSize={fs(10)}
              fill="currentColor"
              opacity="0.55"
            >
              {money(t)}
            </text>
          </g>
        ))}

        <path d={area("income")} fill="url(#gradIncome)" />
        <path d={area("expense")} fill="url(#gradExpense)" />
        <path d={line("income")} fill="none" stroke="var(--chart-1)" strokeWidth="2.5" strokeLinecap="round" />
        <path d={line("expense")} fill="none" stroke="var(--chart-5)" strokeWidth="2.5" strokeLinecap="round" />

        {data.map((d, i) => {
          const showLabel = i % labelEvery === 0 || i === data.length - 1;
          return (
            <g key={d.label + i}>
              <circle cx={x(i)} cy={y(d.income)} r={Math.min(3.5 * k, 6)} fill="var(--chart-1)" />
              <circle cx={x(i)} cy={y(d.expense)} r={Math.min(3.5 * k, 6)} fill="var(--chart-5)" />
              {showLabel && (
                <text
                  x={x(i)}
                  y={H - fs(8)}
                  fontSize={fs(11)}
                  textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                  fill="currentColor"
                  opacity="0.65"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
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
  const money = useChartMoney();
  const R = 74;
  const STROKE = 22;
  const C = 2 * Math.PI * R;

  const segments = useMemo(() => {
    let offset = 0;
    return data.slice(0, 7).map((d) => {
      const fraction = total > 0 ? d.amount / total : 0;
      const seg = { ...d, fraction, dash: fraction * C, offset };
      offset += fraction * C;
      return seg;
    });
  }, [data, total, C]);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
      <svg viewBox="0 0 200 200" className="h-[160px] w-[160px] shrink-0 -rotate-90 sm:h-[190px] sm:w-[190px]">
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
            <span className="tabular w-[4.5rem] shrink-0 text-right font-medium sm:w-20">{money(s.amount)}</span>
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
  const money = useChartMoney();
  const max = Math.max(...data.map((d) => d.amount), 1);
  // En móvil no hay hover. Además, un tooltip flotante por barra ensanchaba el
  // layout y empujaba las tarjetas fuera de la pantalla: mostramos el detalle
  // en una línea fija que se actualiza al tocar (o pasar el ratón por) la barra.
  const [active, setActive] = useState<string | null>(null);
  const current = data.find((d) => d.day === active);

  return (
    <div>
      <p className="mb-2 h-5 text-xs text-muted-foreground">
        {current ? (
          <span className="text-foreground">
            Día {current.day} · <span className="tabular font-medium">{money(current.amount)}</span>
          </span>
        ) : (
          "Toca una barra para ver el gasto del día"
        )}
      </p>
      <div className="flex h-[110px] items-end gap-[3px]">
        {data.map((d) => {
          const open = active === d.day;
          return (
            <button
              key={d.day}
              type="button"
              onClick={() => setActive(open ? null : d.day)}
              onMouseEnter={() => setActive(d.day)}
              onMouseLeave={() => setActive((cur) => (cur === d.day ? null : cur))}
              aria-label={`Día ${d.day}: ${money(d.amount)}`}
              className="flex h-full min-w-0 flex-1 items-end outline-none"
            >
              <span
                className="w-full rounded-t-[3px] transition-all duration-300"
                style={{
                  height: `${Math.max((d.amount / max) * 100, d.amount > 0 ? 4 : 1.5)}%`,
                  background:
                    d.amount > 0 ? "color-mix(in oklch, var(--chart-1) 78%, transparent)" : "currentColor",
                  opacity: open ? 1 : d.amount > 0 ? 0.9 : 0.12,
                }}
              />
            </button>
          );
        })}
      </div>
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
