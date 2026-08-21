"use client";

import { useCallback, useEffect, useState } from "react";
import { Calculator, CalendarClock, PiggyBank, Plus, Sparkles, Target, Wallet } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Meter } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureBootstrap } from "@/lib/ensure-bootstrap";
import type { BudgetProgress, Category, DashboardData, OutingPlan, SavingsGoal } from "@/types/finance";

/** Resultado del simulador de compras: todas las cifras las calcula el backend */
interface PurchaseSimulationResult {
  amount: number;
  concept: string;
  verdict: "puedes" | "justo" | "espera" | "no";
  headline: string;
  remaining: number;
  waitDays: number;
  impacts: string[];
  available: number;
  dailyLimit: number;
  horizonLabel: string;
  explanation: string;
}

const VERDICT_STYLE: Record<string, { label: string; className: string }> = {
  puedes: { label: "Puedes permitírtelo", className: "border-primary/40 bg-primary/[0.08] text-primary" },
  justo: { label: "Vas justo", className: "border-amber-500/40 bg-amber-500/10 text-amber-500" },
  espera: { label: "Mejor espera", className: "border-amber-500/40 bg-amber-500/10 text-amber-500" },
  no: { label: "No es recomendable", className: "border-destructive/40 bg-destructive/10 text-destructive" },
};
import { toast } from "sonner";

function money(v: number) {
  return `${(v || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export default function PlanificacionPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [budgetEdits, setBudgetEdits] = useState<Record<string, string>>({});
  const [savingBudget, setSavingBudget] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [budgetForm, setBudgetForm] = useState({ category: "", limit: "" });
  const [creatingBudget, setCreatingBudget] = useState(false);

  const [goalForm, setGoalForm] = useState({ title: "", target: "", deadline: "" });
  const [creatingGoal, setCreatingGoal] = useState(false);

  const [outingForm, setOutingForm] = useState({ title: "", cost: "", date: "" });
  const [planning, setPlanning] = useState(false);
  const [lastAdvice, setLastAdvice] = useState<{ max: number; advice: string } | null>(null);

  const [simForm, setSimForm] = useState({ amount: "", concept: "" });
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<PurchaseSimulationResult | null>(null);

  const load = useCallback(async () => {
    const [res, catRes] = await Promise.all([
      api.get<DashboardData>("/api/dashboard"),
      api.get<Category[]>("/api/categories"),
    ]);
    if (catRes.ok && catRes.data) {
      setCategories(catRes.data);
    } else {
      console.error("[Planificación] error cargando categorías:", catRes.error);
    }
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

  const createBudget = async () => {
    const value = Number(budgetForm.limit.replace(",", "."));
    if (!budgetForm.category) {
      toast.error("Elige la categoría que quieres limitar");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Introduce un límite mayor que cero");
      return;
    }
    setCreatingBudget(true);
    const res = await api.post("/api/budgets", {
      category: budgetForm.category,
      limit_amount: value,
      alert_threshold: 80,
    });
    setCreatingBudget(false);
    if (!res.ok) {
      console.error("[Planificación] error creando presupuesto:", res.error);
      toast.error("No he podido crear el presupuesto");
      return;
    }
    const cat = categories.find((c) => c._id === budgetForm.category);
    console.log("[Planificación] presupuesto creado:", cat?.name, value);
    toast.success(`Presupuesto de ${cat?.name || "la categoría"} fijado en ${money(value)}`);
    setBudgetForm({ category: "", limit: "" });
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

  const simulate = async () => {
    const amount = Number(simForm.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Escribe el importe que quieres gastar");
      return;
    }
    setSimulating(true);
    const res = await api.post<PurchaseSimulationResult>("/api/simulate", {
      amount,
      concept: simForm.concept.trim() || undefined,
    });
    setSimulating(false);
    if (!res.ok || !res.data) {
      console.error("[Planificación] error simulando compra:", res.error);
      toast.error("No he podido simular la compra");
      return;
    }
    console.log("[Planificación] simulación:", res.data.verdict, res.data.remaining);
    setSimResult(res.data);
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

  /** Categorías de gasto que todavía no tienen límite este mes */
  const budgetedIds = new Set(data.budgets.map((b) => b.category?._id).filter(Boolean));
  const availableForBudget = categories.filter((c) => c.kind === "gasto" && !budgetedIds.has(c._id));

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
          <TabsTrigger value="simulador" className="rounded-full">
            <Calculator className="mr-2 h-4 w-4" /> Simulador
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
                    Todavía no tienes límites este mes. Crea el primero en «Nuevo presupuesto», aquí al lado, o
                    pídeselo al asistente por voz.
                  </li>
                )}
              </ul>
            </Card>

            <div className="space-y-4">
              <Card className="rounded-3xl p-6">
                <h3 className="mb-1 font-display text-lg">Nuevo presupuesto</h3>
                <p className="mb-5 text-xs text-muted-foreground">
                  Elige una categoría de gasto y el máximo que quieres gastar en ella este mes.
                </p>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="budget-category">Categoría</Label>
                    <Select
                      value={budgetForm.category}
                      onValueChange={(v) => setBudgetForm({ ...budgetForm, category: v })}
                    >
                      <SelectTrigger id="budget-category" className="mt-1.5 w-full rounded-xl">
                        <SelectValue placeholder={availableForBudget.length ? "Elegir categoría" : "Todas tienen límite"} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableForBudget.map((c) => (
                          <SelectItem key={c._id} value={c._id}>
                            {c.emoji} {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="budget-limit">Límite del mes (€)</Label>
                    <Input
                      id="budget-limit"
                      inputMode="decimal"
                      value={budgetForm.limit}
                      onChange={(e) => setBudgetForm({ ...budgetForm, limit: e.target.value })}
                      placeholder="250"
                      className="mt-1.5 rounded-xl"
                    />
                  </div>
                  <Button
                    className="w-full rounded-full"
                    onClick={createBudget}
                    disabled={creatingBudget || availableForBudget.length === 0}
                  >
                    {creatingBudget ? "Guardando…" : (
                      <>
                        <Plus className="mr-2 h-4 w-4" /> Crear presupuesto
                      </>
                    )}
                  </Button>
                  {availableForBudget.length === 0 && categories.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Ya tienes un límite en todas tus categorías de gasto. Edítalos en la lista de la izquierda.
                    </p>
                  )}
                </div>
              </Card>
              <Card className="rounded-3xl border-primary/30 bg-primary/[0.06] p-6">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Máximo diario recomendado
                </p>
                <p className="tabular mt-2 text-4xl font-semibold text-primary">
                  {money(data.safeToSpend.dailyLimit)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Tienes {money(data.safeToSpend.available)} disponibles {data.safeToSpend.horizonLabel}, ya
                  descontadas tus obligaciones y reservas.
                </p>
                <ul className="mt-4 space-y-1.5 border-t border-primary/20 pt-3">
                  {data.safeToSpend.breakdown.map((item) => (
                    <li key={item.label} className="flex justify-between gap-3 text-[11px] text-muted-foreground">
                      <span>
                        {item.sign} {item.label}
                      </span>
                      <span className="tabular">{money(item.amount)}</span>
                    </li>
                  ))}
                </ul>
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

        {/* ---------------- Simulador de compras ---------------- */}
        <TabsContent value="simulador">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Card className="rounded-3xl p-6">
              <h2 className="font-display text-xl">¿Puedo permitírmelo?</h2>
              <p className="mb-6 text-xs text-muted-foreground">
                Dime cuánto te quieres gastar y calculo el impacto real sobre tu disponible, tu presupuesto y tus
                metas. Las cifras las calcula la app, la IA sólo te lo explica.
              </p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="sim-concept">¿En qué?</Label>
                  <Input
                    id="sim-concept"
                    value={simForm.concept}
                    onChange={(e) => setSimForm({ ...simForm, concept: e.target.value })}
                    placeholder="Portátil nuevo"
                    className="mt-1.5 rounded-xl"
                  />
                </div>
                <div>
                  <Label htmlFor="sim-amount">Importe (€)</Label>
                  <Input
                    id="sim-amount"
                    inputMode="decimal"
                    value={simForm.amount}
                    onChange={(e) => setSimForm({ ...simForm, amount: e.target.value })}
                    placeholder="900"
                    className="mt-1.5 rounded-xl"
                  />
                </div>
                <Button onClick={simulate} disabled={simulating} className="w-full rounded-full">
                  {simulating ? "Calculando…" : "Simular la compra"}
                </Button>
                <div className="rounded-2xl bg-secondary/60 p-4 text-xs text-muted-foreground">
                  Ahora mismo tienes{" "}
                  <span className="tabular font-medium text-foreground">{money(data.safeToSpend.available)}</span>{" "}
                  disponibles {data.safeToSpend.horizonLabel} ({money(data.safeToSpend.dailyLimit)} al día).
                </div>
              </div>
            </Card>

            <Card className="rounded-3xl p-6">
              <h2 className="mb-5 font-display text-xl">Resultado</h2>
              {!simResult ? (
                <p className="text-sm text-muted-foreground">
                  Aún no has simulado nada. Prueba con una compra que estés valorando y te diré si te la puedes
                  permitir, si tendrías que esperar o qué meta se retrasaría.
                </p>
              ) : (
                <div className="space-y-4">
                  <div
                    className={`rounded-2xl border p-4 ${
                      VERDICT_STYLE[simResult.verdict]?.className || "border-border"
                    }`}
                  >
                    <p className="text-[11px] uppercase tracking-[0.16em]">
                      {VERDICT_STYLE[simResult.verdict]?.label || "Resultado"}
                    </p>
                    <p className="mt-1 text-lg font-semibold">{simResult.headline}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-border p-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Compra</p>
                      <p className="tabular mt-1 text-lg font-semibold">{money(simResult.amount)}</p>
                    </div>
                    <div className="rounded-2xl border border-border p-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Te quedaría</p>
                      <p
                        className={`tabular mt-1 text-lg font-semibold ${
                          simResult.remaining < 0 ? "text-destructive" : ""
                        }`}
                      >
                        {money(simResult.remaining)}
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {simResult.impacts.map((impact, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        {impact}
                      </li>
                    ))}
                  </ul>
                  {simResult.explanation && (
                    <div className="rounded-2xl bg-secondary/60 p-4">
                      <p className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5" /> Lo que opina tu asistente
                      </p>
                      <p className="text-sm leading-relaxed">{simResult.explanation}</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
