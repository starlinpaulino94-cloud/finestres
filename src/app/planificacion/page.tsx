"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, PiggyBank, Plus, Sparkles, Target, Wallet } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Meter } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureBootstrap } from "@/lib/ensure-bootstrap";
import type { BudgetProgress, DashboardData, OutingPlan, SavingsGoal } from "@/types/finance";
import { toast } from "sonner";

function money(v: number) {
  return `${(v || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export default function PlanificacionPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [budgetEdits, setBudgetEdits] = useState<Record<string, string>>({});
  const [savingBudget, setSavingBudget] = useState<string | null>(null);

  const [goalForm, setGoalForm] = useState({ title: "", target: "", deadline: "" });
  const [creatingGoal, setCreatingGoal] = useState(false);

  const [outingForm, setOutingForm] = useState({ title: "", cost: "", date: "" });
  const [planning, setPlanning] = useState(false);
  const [lastAdvice, setLastAdvice] = useState<{ max: number; advice: string } | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<DashboardData>("/api/dashboard");
    if (res.ok && res.data) {
      setData(res.data);
      setBudgetEdits(
        Object.fromEntries(res.data.budgets.map((b) => [b._id, String(b.limit_amount)]))
      );
    } else {
      console.error("[Planificación] error:", res.error);
      toast.error("No he podido cargar tu planificación");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await ensureBootstrap();
      await load();
    })();
  }, [load]);

  const saveBudget = async (b: BudgetProgress) => {
    const value = Number((budgetEdits[b._id] ?? "").replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Introduce un límite válido");
      return;
    }
    if (!b.category) return;
    setSavingBudget(b._id);
    const res = await api.post("/api/budgets", {
      category: b.category._id,
      limit_amount: value,
      alert_threshold: b.alert_threshold,
    });
    setSavingBudget(null);
    if (!res.ok) {
      console.error("[Planificación] error guardando presupuesto:", res.error);
      toast.error("No he podido guardar el presupuesto");
      return;
    }
    toast.success(`Límite de ${b.category.name} actualizado`);
    window.dispatchEvent(new Event("fintra:refresh"));
    await load();
  };

  const createGoal = async () => {
    const target = Number(goalForm.target.replace(",", "."));
    if (!goalForm.title.trim() || !Number.isFinite(target) || target <= 0) {
      toast.error("Indica el nombre de la meta y el importe objetivo");
      return;
    }
    setCreatingGoal(true);
    const res = await api.post<{ advice: string; monthlyContribution: number }>("/api/goals", {
      title: goalForm.title.trim(),
      target_amount: target,
      deadline: goalForm.deadline ? new Date(goalForm.deadline).toISOString() : undefined,
    });
    setCreatingGoal(false);
    if (!res.ok) {
      console.error("[Planificación] error creando meta:", res.error);
      toast.error("No he podido crear la meta");
      return;
    }
    toast.success(
      `Meta creada · aporte sugerido ${money(res.data?.monthlyContribution || 0)}/mes`
    );
    setGoalForm({ title: "", target: "", deadline: "" });
    window.dispatchEvent(new Event("fintra:refresh"));
    await load();
  };

  const addToGoal = async (goal: SavingsGoal, amount: number) => {
    const res = await api.put(`/api/goals/${goal._id}`, {
      saved_amount: (goal.saved_amount || 0) + amount,
    });
    if (!res.ok) {
      console.error("[Planificación] error aportando a meta:", res.error);
      toast.error("No he podido registrar el aporte");
      return;
    }
    toast.success(`+${money(amount)} en «${goal.title}»`);
    await load();
  };

  const planOuting = async () => {
    if (!outingForm.title.trim()) {
      toast.error("Dime qué plan tienes");
      return;
    }
    setPlanning(true);
    const res = await api.post<{ maxRecommended: number; advice: string }>("/api/outings", {
      title: outingForm.title.trim(),
      estimated_cost: outingForm.cost ? Number(outingForm.cost.replace(",", ".")) : undefined,
      planned_at: outingForm.date ? new Date(outingForm.date).toISOString() : undefined,
    });
    setPlanning(false);
    if (!res.ok || !res.data) {
      console.error("[Planificación] error planificando salida:", res.error);
      toast.error("No he podido planificar la salida");
      return;
    }
    setLastAdvice({ max: res.data.maxRecommended, advice: res.data.advice });
    toast.success(`Máximo recomendado: ${money(res.data.maxRecommended)}`);
    setOutingForm({ title: "", cost: "", date: "" });
    window.dispatchEvent(new Event("fintra:refresh"));
    await load();
  };

  const closeOuting = async (outing: OutingPlan, realCost: number) => {
    const res = await api.put(`/api/outings/${outing._id}`, { status: "realizada", real_cost: realCost });
    if (!res.ok) {
      toast.error("No he podido cerrar la salida");
      return;
    }
    toast.success("Salida marcada como realizada");
    await load();
  };

  if (loading || !data) {
    return (
      <AppShell>
        <PageHeader eyebrow="planificación" title="Presupuestos, metas y salidas" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-3xl" />
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={data.monthLabel}
        title="Presupuestos, metas y salidas"
        description="Define tus límites, organiza tus metas de ahorro y deja que la IA calcule cuánto puedes gastar en cada plan."
      />

      <Tabs defaultValue="presupuestos" className="rise">
        <TabsList className="mb-6 rounded-full">
          <TabsTrigger value="presupuestos" className="rounded-full">
            <Wallet className="mr-2 h-4 w-4" /> Presupuestos
          </TabsTrigger>
          <TabsTrigger value="metas" className="rounded-full">
            <PiggyBank className="mr-2 h-4 w-4" /> Metas
          </TabsTrigger>
          <TabsTrigger value="salidas" className="rounded-full">
            <CalendarClock className="mr-2 h-4 w-4" /> Salidas
          </TabsTrigger>
        </TabsList>

        {/* ---------------- Presupuestos ---------------- */}
        <TabsContent value="presupuestos">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card className="rounded-3xl p-6">
              <h2 className="font-display text-xl">Límites de {data.monthLabel}</h2>
              <p className="mb-6 text-xs text-muted-foreground">
                Recibirás una alerta automática al alcanzar el {data.budgets[0]?.alert_threshold || 80} % de cada límite.
              </p>
              <ul className="space-y-5">
                {data.budgets.map((b) => (
                  <li key={b._id}>
                    <div className="mb-2 flex flex-wrap items-center gap-3">
                      <span className="flex-1 truncate text-sm">
                        {b.category?.emoji} {b.category?.name}
                      </span>
                      <span className="tabular text-xs text-muted-foreground">
                        gastado {money(b.spent)}
                      </span>
                      <div className="flex items-center gap-2">
                        <Input
                          value={budgetEdits[b._id] ?? ""}
                          onChange={(e) => setBudgetEdits({ ...budgetEdits, [b._id]: e.target.value })}
                          inputMode="decimal"
                          className="h-9 w-24 rounded-xl text-right"
                          aria-label={`Límite de ${b.category?.name}`}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-xl"
                          onClick={() => saveBudget(b)}
                          disabled={savingBudget === b._id}
                        >
                          {savingBudget === b._id ? "…" : "Guardar"}
                        </Button>
                      </div>
                    </div>
                    <Meter value={b.spent} max={b.limit_amount} color={b.category?.color} />
                  </li>
                ))}
                {data.budgets.length === 0 && (
                  <li className="text-sm text-muted-foreground">
                    Todavía no hay presupuestos este mes. Pídeselo al asistente por voz o crea uno desde una categoría.
                  </li>
                )}
              </ul>
            </Card>

            <div className="space-y-4">
              <Card className="rounded-3xl border-primary/30 bg-primary/[0.06] p-6">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Máximo diario seguro
                </p>
                <p className="tabular mt-2 text-4xl font-semibold text-primary">{money(data.dailySafeSpend)}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Te quedan {money(Math.max(data.budgetTotal - data.budgetSpent, 0))} para {data.daysLeft} días.
                </p>
              </Card>
              <Card className="rounded-3xl p-6">
                <h3 className="mb-3 font-display text-lg">Categorías al límite</h3>
                <ul className="space-y-3">
                  {data.budgets
                    .filter((b) => b.pct >= b.alert_threshold)
                    .map((b) => (
                      <li key={b._id} className="rounded-2xl border border-border p-3.5 text-sm">
                        <div className="flex justify-between">
                          <span>
                            {b.category?.emoji} {b.category?.name}
                          </span>
                          <span className={`tabular ${b.pct >= 100 ? "text-destructive" : "text-amber-500"}`}>
                            {b.pct.toFixed(0)}%
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {b.pct >= 100
                            ? `Te has pasado ${money(b.spent - b.limit_amount)}.`
                            : `Te quedan ${money(b.limit_amount - b.spent)} este mes.`}
                        </p>
                      </li>
                    ))}
                  {data.budgets.filter((b) => b.pct >= b.alert_threshold).length === 0 && (
                    <li className="text-sm text-muted-foreground">Ninguna categoría en riesgo. Buen trabajo.</li>
                  )}
                </ul>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ---------------- Metas ---------------- */}
        <TabsContent value="metas">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card className="rounded-3xl p-6">
              <h2 className="mb-6 font-display text-xl">Tus metas de ahorro</h2>
              <ul className="space-y-6">
                {data.goals.map((g) => {
                  const pct = g.target_amount > 0 ? ((g.saved_amount || 0) / g.target_amount) * 100 : 0;
                  return (
                    <li key={g._id}>
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{g.title}</span>
                        <span className="tabular text-xs text-muted-foreground">
                          {money(g.saved_amount || 0)} / {money(g.target_amount)} · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <Meter value={g.saved_amount || 0} max={g.target_amount} height={10} />
                      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {g.deadline && <span>Objetivo: {new Date(g.deadline).toLocaleDateString("es-ES")}</span>}
                        {g.monthly_contribution ? <span>· {money(g.monthly_contribution)}/mes</span> : null}
                        <div className="ml-auto flex gap-1.5">
                          {[25, 50, 100].map((amount) => (
                            <button
                              key={amount}
                              onClick={() => addToGoal(g, amount)}
                              className="rounded-full border border-border px-2.5 py-1 transition-colors hover:border-primary/50 hover:text-foreground"
                            >
                              +{amount} €
                            </button>
                          ))}
                        </div>
                      </div>
                      {g.notes && <p className="mt-2 text-xs text-muted-foreground">{g.notes}</p>}
                    </li>
                  );
                })}
                {data.goals.length === 0 && (
                  <li className="text-sm text-muted-foreground">Aún no tienes metas. Crea la primera aquí al lado.</li>
                )}
              </ul>
            </Card>

            <Card className="rounded-3xl p-6">
              <h3 className="mb-1 font-display text-lg">Nueva meta</h3>
              <p className="mb-5 text-xs text-muted-foreground">
                Calculo el aporte mensual que necesitas y te doy un consejo para conseguirla.
              </p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="goal-title">¿Para qué ahorras?</Label>
                  <Input
                    id="goal-title"
                    value={goalForm.title}
                    onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                    placeholder="Viaje a Japón"
                    className="mt-1.5 rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="goal-target">Objetivo (€)</Label>
                    <Input
                      id="goal-target"
                      inputMode="decimal"
                      value={goalForm.target}
                      onChange={(e) => setGoalForm({ ...goalForm, target: e.target.value })}
                      placeholder="3000"
                      className="mt-1.5 rounded-xl"
                    />
                  </div>
                  <div>
                    <Label htmlFor="goal-deadline">Fecha límite</Label>
                    <Input
                      id="goal-deadline"
                      type="date"
                      value={goalForm.deadline}
                      onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })}
                      className="mt-1.5 rounded-xl"
                    />
                  </div>
                </div>
                <Button className="w-full rounded-full" onClick={createGoal} disabled={creatingGoal}>
                  {creatingGoal ? "Creando…" : (
                    <>
                      <Plus className="mr-2 h-4 w-4" /> Crear meta
                    </>
                  )}
                </Button>
                <div className="rounded-2xl border border-border p-4">
                  <p className="text-xs text-muted-foreground">Ahorrado en total</p>
                  <p className="tabular mt-1 text-2xl font-semibold">{money(data.savedTotal)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">de {money(data.savingsTarget)} objetivo</p>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------- Salidas ---------------- */}
        <TabsContent value="salidas">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Card className="rounded-3xl p-6">
              <h3 className="mb-1 font-display text-lg">Planificar una salida</h3>
              <p className="mb-5 text-xs text-muted-foreground">
                Dime el plan y calculo el máximo que puedes gastar sin romper tu presupuesto ni tus metas.
              </p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="outing-title">Plan</Label>
                  <Input
                    id="outing-title"
                    value={outingForm.title}
                    onChange={(e) => setOutingForm({ ...outingForm, title: e.target.value })}
                    placeholder="Cena de cumpleaños"
                    className="mt-1.5 rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="outing-cost">Coste estimado (€)</Label>
                    <Input
                      id="outing-cost"
                      inputMode="decimal"
                      value={outingForm.cost}
                      onChange={(e) => setOutingForm({ ...outingForm, cost: e.target.value })}
                      placeholder="55"
                      className="mt-1.5 rounded-xl"
                    />
                  </div>
                  <div>
                    <Label htmlFor="outing-date">Fecha</Label>
                    <Input
                      id="outing-date"
                      type="date"
                      value={outingForm.date}
                      onChange={(e) => setOutingForm({ ...outingForm, date: e.target.value })}
                      className="mt-1.5 rounded-xl"
                    />
                  </div>
                </div>
                <Button className="w-full rounded-full" onClick={planOuting} disabled={planning}>
                  {planning ? "Calculando…" : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" /> Calcular mi máximo
                    </>
                  )}
                </Button>

                {lastAdvice && (
                  <div className="rounded-2xl border border-primary/30 bg-primary/[0.07] p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-primary">Máximo recomendado</p>
                    <p className="tabular mt-1 text-3xl font-semibold">{money(lastAdvice.max)}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{lastAdvice.advice}</p>
                  </div>
                )}
              </div>
            </Card>

            <Card className="rounded-3xl p-6">
              <h2 className="mb-5 flex items-center gap-2 font-display text-xl">
                <Target className="h-4 w-4 text-primary" /> Salidas planificadas
              </h2>
              <ul className="space-y-4">
                {data.outings.map((o) => (
                  <li key={o._id} className="rounded-2xl border border-border p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium">{o.title}</p>
                      <span className="text-xs text-muted-foreground">
                        {o.planned_at ? new Date(o.planned_at).toLocaleDateString("es-ES") : ""}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Estimado <span className="tabular">{money(o.estimated_cost || 0)}</span>
                      </span>
                      <span>
                        Máximo{" "}
                        <span className="tabular font-medium text-primary">{money(o.max_recommended || 0)}</span>
                      </span>
                      {o.status === "realizada" && (
                        <span>
                          Real <span className="tabular">{money(o.real_cost || 0)}</span>
                        </span>
                      )}
                    </div>
                    {o.ai_advice && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{o.ai_advice}</p>}
                    {o.status === "planificada" && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => closeOuting(o, o.max_recommended || o.estimated_cost || 0)}
                        >
                          Marcar como realizada
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
                {data.outings.length === 0 && (
                  <li className="text-sm text-muted-foreground">No hay salidas planificadas todavía.</li>
                )}
              </ul>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
