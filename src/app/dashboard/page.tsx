"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  CalendarClock,
  HeartPulse,
  Info,
  Landmark,
  Mic,
  PiggyBank,
  Plus,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { CategoryDonut, DailyBars, Meter, MoneyFlowChart, ScoreRing } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureBootstrap } from "@/lib/ensure-bootstrap";
import type { DashboardData } from "@/types/finance";
import { toast } from "sonner";

function money(v: number) {
  return `${(v || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await api.get<DashboardData>("/api/dashboard");
    if (res.ok && res.data) {
      setData(res.data);
      console.log("[Dashboard] datos cargados", {
        gasto: res.data.expense,
        presupuestos: res.data.budgets.length,
        alertas: res.data.unreadCount,
      });
    } else {
      console.error("[Dashboard] error:", res.error);
      toast.error("No he podido cargar tu panel");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await ensureBootstrap();
      await load();
    })();
  }, [load]);

  return (
    <AppShell>
      <PageHeader
        eyebrow={data ? data.monthLabel : "cargando"}
        title="Tu panel financiero"
        description="Todo lo que necesitas saber sobre tu mes: cuánto puedes gastar hoy, dónde se te va el dinero y cómo van tus metas."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/movimientos">
                <Plus className="mr-2 h-4 w-4" /> Añadir gasto
              </Link>
            </Button>
            <Button asChild className="rounded-full">
              <Link href="/asistente">
                <Mic className="mr-2 h-4 w-4" /> Nota de voz
              </Link>
            </Button>
          </div>
        }
      />

      {loading || !data ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-3xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="rise rounded-3xl border-primary/30 bg-primary/[0.07] p-6">
              <div className="flex items-start justify-between">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Disponible para gastar
                </p>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-primary transition-colors hover:bg-primary/10"
                      aria-label="Ver cómo se calcula el disponible para gastar"
                    >
                      <Info className="h-3.5 w-3.5" /> Cómo lo calculo
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 rounded-2xl" align="end">
                    <p className="text-sm font-medium">No es el saldo de tu banco</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Partimos de tu dinero líquido y restamos lo que ya está comprometido:
                    </p>
                    <ul className="mt-3 space-y-2">
                      {data.safeToSpend.breakdown.map((item) => (
                        <li key={item.label} className="flex items-start justify-between gap-3 text-xs">
                          <span>
                            <span className="font-medium">
                              {item.sign} {item.label}
                            </span>
                            <span className="block text-muted-foreground">{item.hint}</span>
                          </span>
                          <span className="tabular shrink-0 font-medium">{money(item.amount)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
                      <span className="font-medium">Disponible</span>
                      <span className="tabular font-semibold text-primary">
                        {money(data.safeToSpend.available)}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Estimamos tu próximo ingreso el{" "}
                      {new Date(data.safeToSpend.nextIncomeDate).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "long",
                      })}{" "}
                      según tu historial. Es una estimación, no un dato del banco.
                    </p>
                  </PopoverContent>
                </Popover>
              </div>
              <p className="tabular mt-3 text-4xl font-semibold text-primary">
                {money(data.safeToSpend.available)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {money(data.safeToSpend.dailyLimit)} al día · {money(data.safeToSpend.weeklyLimit)} a la semana,{" "}
                {data.safeToSpend.horizonLabel}
              </p>
              {data.safeToSpend.budgetCapApplied && (
                <p className="mt-1 text-[11px] text-primary">Límite marcado por tu presupuesto del mes</p>
              )}
            </Card>

            <Card className="rise rounded-3xl p-6 [animation-delay:60ms]">
              <div className="flex items-start justify-between">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Patrimonio neto</p>
                <Landmark className="h-4 w-4 text-primary" />
              </div>
              <p className="tabular mt-3 text-3xl font-semibold">{money(data.netWorth.netWorth)}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {money(data.netWorth.assets)} en activos − {money(data.netWorth.liabilities)} en deudas
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Líquido disponible hoy: <span className="tabular">{money(data.netWorth.liquidity)}</span>
              </p>
            </Card>

            <Card className="rise rounded-3xl p-6 [animation-delay:120ms]">
              <div className="flex items-start justify-between">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Gastos del mes</p>
                <ArrowDownRight className="h-4 w-4" style={{ color: "var(--chart-5)" }} />
              </div>
              <p className="tabular mt-3 text-3xl font-semibold">{money(data.expense)}</p>
              <div className="mt-3">
                <Meter value={data.budgetSpent} max={data.budgetTotal} />
                <p className="mt-2 text-xs text-muted-foreground">
                  {money(data.budgetSpent)} de {money(data.budgetTotal)} presupuestados
                </p>
              </div>
            </Card>

            <Card className="rise rounded-3xl p-6 [animation-delay:180ms]">
              <div className="flex items-start justify-between">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Ingresos del mes</p>
                <ArrowUpRight className="h-4 w-4 text-primary" />
              </div>
              <p className="tabular mt-3 text-3xl font-semibold">{money(data.income)}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Balance: <span className="tabular">{money(data.balance)}</span>
              </p>
              {data.internalMoved > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {money(data.internalMoved)} movidos entre tus cuentas (no cuentan como gasto)
                </p>
              )}
            </Card>
          </div>

          {/* Gráficas */}
          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <Card className="rise rounded-3xl p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl">Progreso mensual</h2>
                  <p className="text-xs text-muted-foreground">Ingresos frente a gastos, últimos 6 meses</p>
                </div>
              </div>
              <MoneyFlowChart data={data.monthlySeries} />
            </Card>

            <Card className="rise rounded-3xl p-6 [animation-delay:80ms]">
              <div className="mb-5">
                <h2 className="font-display text-xl">Reparto por categoría</h2>
                <p className="text-xs text-muted-foreground">Gastos de {data.monthLabel}</p>
              </div>
              <CategoryDonut data={data.categoryBreakdown} total={data.expense} />
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            {/* Presupuestos */}
            <Card className="rise rounded-3xl p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl">Presupuestos y límites</h2>
                  <p className="text-xs text-muted-foreground">Con alerta automática al llegar al umbral</p>
                </div>
                <Button asChild variant="ghost" size="sm" className="rounded-full">
                  <Link href="/planificacion">Ajustar</Link>
                </Button>
              </div>
              <ul className="space-y-4">
                {data.budgets.length === 0 && (
                  <li className="text-sm text-muted-foreground">
                    Aún no tienes presupuestos.{" "}
                    <Link href="/planificacion" className="text-primary underline underline-offset-4">
                      Crea el primero
                    </Link>
                    .
                  </li>
                )}
                {data.budgets.slice(0, 6).map((b) => (
                  <li key={b._id}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">
                        {b.category?.emoji} {b.category?.name || "Sin categoría"}
                      </span>
                      <span className="tabular shrink-0 text-xs text-muted-foreground">
                        {money(b.spent)} / {money(b.limit_amount)}
                        <span
                          className={`ml-2 font-medium ${
                            b.pct >= 100 ? "text-destructive" : b.pct >= b.alert_threshold ? "text-amber-500" : ""
                          }`}
                        >
                          {b.pct.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                    <Meter value={b.spent} max={b.limit_amount} color={b.category?.color} />
                  </li>
                ))}
              </ul>
            </Card>

            {/* Ritmo diario + alertas */}
            <div className="space-y-4">
              <Card className="rise rounded-3xl p-6 [animation-delay:60ms]">
                <h2 className="font-display text-xl">Ritmo diario</h2>
                <p className="mb-4 text-xs text-muted-foreground">Gasto de cada día de {data.monthLabel}</p>
                <DailyBars data={data.dailySeries} />
              </Card>

              <Card className="rise rounded-3xl p-6 [animation-delay:100ms]">
                <div className="mb-4 flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-xl">Salud financiera</h2>
                </div>
                <div className="flex items-center gap-5">
                  <ScoreRing score={data.healthScore} label="salud" />
                  <ul className="flex-1 space-y-2">
                    {data.healthComponents.map((c) => (
                      <li key={c.key}>
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="truncate">{c.label}</span>
                          <span className="tabular shrink-0 text-muted-foreground">
                            {c.points}/{c.max}
                          </span>
                        </div>
                        <Meter value={c.points} max={c.max} />
                        <p className="mt-1 text-[11px] text-muted-foreground">{c.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>

              <Card className="rise rounded-3xl p-6 [animation-delay:120ms]">
                <div className="mb-4 flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-xl">Alertas recientes</h2>
                </div>
                <ul className="space-y-3">
                  {data.notifications.slice(0, 3).map((n) => (
                    <li key={n._id} className="rounded-2xl border border-border p-3.5">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                    </li>
                  ))}
                  {data.notifications.length === 0 && (
                    <li className="text-sm text-muted-foreground">Sin alertas: vas dentro de tus límites.</li>
                  )}
                </ul>
              </Card>
            </div>
          </div>

          {/* Metas, salidas y movimientos */}
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="rise rounded-3xl p-6">
              <div className="mb-5 flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-primary" />
                <h2 className="font-display text-xl">Metas de ahorro</h2>
              </div>
              <ul className="space-y-5">
                {data.goals.slice(0, 3).map((g) => (
                  <li key={g._id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm">{g.title}</span>
                      <span className="tabular text-xs text-muted-foreground">
                        {money(g.saved_amount || 0)} / {money(g.target_amount)}
                      </span>
                    </div>
                    <Meter value={g.saved_amount || 0} max={g.target_amount} />
                    {g.monthly_contribution ? (
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Aporte sugerido {money(g.monthly_contribution)}/mes
                      </p>
                    ) : null}
                  </li>
                ))}
                {data.goals.length === 0 && (
                  <li className="text-sm text-muted-foreground">
                    Cuéntale tus metas al asistente y las organizará por ti.
                  </li>
                )}
              </ul>
            </Card>

            <Card className="rise rounded-3xl p-6 [animation-delay:60ms]">
              <div className="mb-5 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                <h2 className="font-display text-xl">Próximas salidas</h2>
              </div>
              <ul className="space-y-4">
                {data.outings
                  .filter((o) => o.status === "planificada")
                  .slice(0, 3)
                  .map((o) => (
                    <li key={o._id} className="rounded-2xl border border-border p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium">{o.title}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {o.planned_at ? new Date(o.planned_at).toLocaleDateString("es-ES") : ""}
                        </p>
                      </div>
                      <p className="tabular mt-2 text-sm">
                        Máximo recomendado:{" "}
                        <span className="font-semibold text-primary">{money(o.max_recommended || 0)}</span>
                      </p>
                      {o.ai_advice && (
                        <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">{o.ai_advice}</p>
                      )}
                    </li>
                  ))}
                {data.outings.filter((o) => o.status === "planificada").length === 0 && (
                  <li className="text-sm text-muted-foreground">No tienes salidas planificadas.</li>
                )}
              </ul>
            </Card>

            <Card className="rise rounded-3xl p-6 [animation-delay:120ms]">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-display text-xl">Últimos movimientos</h2>
                <Button asChild variant="ghost" size="sm" className="rounded-full">
                  <Link href="/movimientos">Ver todos</Link>
                </Button>
              </div>
              <ul className="divide-y divide-border">
                {data.recentTransactions.slice(0, 6).map((t) => {
                  const cat = typeof t.category === "object" && t.category ? t.category : null;
                  return (
                    <li key={t._id} className="flex items-center gap-3 py-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-secondary text-sm">
                        {cat?.emoji || "💸"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{t.concept}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(t.spent_at).toLocaleDateString("es-ES")} · {t.source}
                        </p>
                      </div>
                      <span
                        className={`tabular text-sm font-medium ${
                          t.kind === "ingreso" ? "text-primary" : ""
                        }`}
                      >
                        {t.kind === "ingreso" ? "+" : "−"}
                        {money(t.amount)}
                      </span>
                    </li>
                  );
                })}
                {data.recentTransactions.length === 0 && (
                  <li className="py-3 text-sm text-muted-foreground">Sin movimientos todavía.</li>
                )}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}
