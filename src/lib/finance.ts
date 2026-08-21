import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { totalumSdk } from "@/lib/totalum";
import {
  computeBudgets,
  computeHealthScore,
  computeNetWorth,
  computeSafeToSpend,
  computeTotals,
  isExpense,
  isIncome,
  round2,
  sumMoney,
} from "@/lib/finance-core";
import type {
  BudgetProgress,
  DashboardData,
  Transaction,
} from "@/types/finance";

/** ------------------------------------------------------------------
 * Session helpers
 * ------------------------------------------------------------------ */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;
    // IMPORTANT: the auth session user uses `id`, never `_id`
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name || session.user.email,
    };
  } catch (err) {
    console.error("[finance] getSessionUser error:", err);
    return null;
  }
}

/**
 * Comprueba que el registro pertenece al usuario de la sesión antes de
 * modificarlo o borrarlo. Protege contra IDOR: sin esto, cualquier usuario
 * autenticado podría editar los movimientos, metas o cuentas de otro
 * simplemente cambiando el id de la URL.
 */
export interface OwnerCheck {
  ok: boolean;
  record?: any;
  status?: number;
  message?: string;
}

export async function assertOwner(table: string, id: string, userId: string): Promise<OwnerCheck> {
  if (!id || typeof id !== "string") {
    return { ok: false, status: 400, message: "Identificador no válido" };
  }
  try {
    const res = await totalumSdk.crud.query(table, { _filter: { _id: id }, _limit: 1 });
    const record = ((res.data as any[]) || [])[0];
    if (!record) return { ok: false, status: 404, message: "No existe ese registro" };
    const owner = typeof record.user === "object" && record.user ? record.user._id : record.user;
    if (String(owner) !== String(userId)) {
      console.warn("[security] intento de acceso a un registro de otro usuario:", { table, id, userId });
      return { ok: false, status: 403, message: "Ese registro no es tuyo" };
    }
    return { ok: true, record };
  } catch (err) {
    console.error("[security] assertOwner error:", table, id, err);
    throw err;
  }
}

export function serializeError(err: unknown) {
  const e = err as any;
  return {
    message: e?.message ?? "Error desconocido",
    code: e?.code ?? null,
    status: e?.response?.status ?? null,
    responseData: e?.response?.data ?? null,
  };
}

/** ------------------------------------------------------------------
 * Date helpers
 * ------------------------------------------------------------------ */
export const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1, 0, 0, 0, 0);
}

export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** ------------------------------------------------------------------
 * Default categories used when a user starts using the app
 * ------------------------------------------------------------------ */
export const DEFAULT_CATEGORIES: {
  name: string;
  kind: "gasto" | "ingreso";
  color: string;
  emoji: string;
  budget?: number;
}[] = [
  { name: "Supermercado", kind: "gasto", color: "#4ade80", emoji: "🛒", budget: 320 },
  { name: "Restaurantes y salidas", kind: "gasto", color: "#f97316", emoji: "🍽️", budget: 220 },
  { name: "Transporte", kind: "gasto", color: "#38bdf8", emoji: "🚇", budget: 90 },
  { name: "Vivienda", kind: "gasto", color: "#a78bfa", emoji: "🏠", budget: 750 },
  { name: "Ocio y suscripciones", kind: "gasto", color: "#f472b6", emoji: "🎬", budget: 80 },
  { name: "Salud", kind: "gasto", color: "#2dd4bf", emoji: "💊", budget: 60 },
  { name: "Compras", kind: "gasto", color: "#fbbf24", emoji: "🛍️", budget: 120 },
  { name: "Nómina", kind: "ingreso", color: "#22c55e", emoji: "💼" },
  { name: "Ingresos extra", kind: "ingreso", color: "#84cc16", emoji: "✨" },
];

/** ------------------------------------------------------------------
 * Bootstrap: creates categories, accounts, budgets and a realistic
 * starting history so the user never sees an empty dashboard.
 * Idempotent — it only runs when the user has no categories yet.
 * ------------------------------------------------------------------ */
export async function bootstrapUserData(userId: string): Promise<{ created: boolean }> {
  const existing = await totalumSdk.crud.query("category", {
    _filter: { user: userId },
    _limit: 1,
  });

  if ((existing.data as any[])?.length > 0) {
    console.log("[finance] bootstrap skipped, user already has data:", userId);
    return { created: false };
  }

  console.log("[finance] bootstrapping starter data for user:", userId);

  const categoryIds: Record<string, string> = {};
  for (const cat of DEFAULT_CATEGORIES) {
    const res = await totalumSdk.crud.createRecord("category", {
      name: cat.name,
      kind: cat.kind,
      color: cat.color,
      emoji: cat.emoji,
      user: userId,
    });
    categoryIds[cat.name] = (res.data as any)._id;
  }

  const accounts = [
    { name: "Cuenta corriente", bank_name: "BBVA", account_type: "cuenta", last_four: "4821", balance: 2480.55 },
    { name: "Tarjeta Visa", bank_name: "Santander", account_type: "tarjeta_credito", last_four: "9037", balance: -310.2 },
    { name: "Efectivo", bank_name: "Cartera", account_type: "efectivo", last_four: "", balance: 120 },
  ];
  const accountIds: string[] = [];
  for (const acc of accounts) {
    const res = await totalumSdk.crud.createRecord("bank_account", {
      ...acc,
      currency: "EUR",
      user: userId,
    });
    accountIds.push((res.data as any)._id);
  }

  const now = new Date();
  const currentMonth = monthKey(now);
  for (const cat of DEFAULT_CATEGORIES) {
    if (!cat.budget) continue;
    await totalumSdk.crud.createRecord("budget", {
      month: currentMonth,
      limit_amount: cat.budget,
      alert_threshold: 80,
      category: categoryIds[cat.name],
      user: userId,
    });
  }

  // Deterministic pseudo-random generator so the seed history looks natural
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const expenseTemplates = [
    { concept: "Compra semanal Mercadona", category: "Supermercado", min: 28, max: 74 },
    { concept: "Café con leche", category: "Restaurantes y salidas", min: 2, max: 5 },
    { concept: "Cena con amigos", category: "Restaurantes y salidas", min: 18, max: 46 },
    { concept: "Abono transporte", category: "Transporte", min: 12, max: 35 },
    { concept: "Netflix + Spotify", category: "Ocio y suscripciones", min: 9, max: 22 },
    { concept: "Farmacia", category: "Salud", min: 6, max: 28 },
    { concept: "Zapatillas nuevas", category: "Compras", min: 20, max: 65 },
    { concept: "Cine", category: "Ocio y suscripciones", min: 8, max: 16 },
  ];

  const transactions: any[] = [];
  for (let monthOffset = 3; monthOffset >= 0; monthOffset--) {
    const base = addMonths(now, -monthOffset);
    const monthDays = monthOffset === 0 ? now.getDate() : daysInMonth(base);

    // Rent + salary every month
    transactions.push({
      concept: "Alquiler del piso",
      amount: 720,
      kind: "gasto",
      spent_at: new Date(base.getFullYear(), base.getMonth(), 2, 9, 30),
      source: "manual",
      auto_categorized: "no",
      category: categoryIds["Vivienda"],
      bank_account: accountIds[0],
      user: userId,
    });
    transactions.push({
      concept: "Nómina mensual",
      amount: 2150,
      kind: "ingreso",
      spent_at: new Date(base.getFullYear(), base.getMonth(), 1, 8, 0),
      source: "manual",
      auto_categorized: "no",
      category: categoryIds["Nómina"],
      bank_account: accountIds[0],
      user: userId,
    });

    // Movimientos internos: demuestran que un pago de tarjeta o un traspaso
    // entre cuentas propias NO se contabiliza como gasto.
    transactions.push({
      concept: "Pago de la tarjeta Visa",
      amount: 240,
      kind: "pago_tarjeta",
      spent_at: new Date(base.getFullYear(), base.getMonth(), 5, 12, 0),
      source: "manual",
      auto_categorized: "no",
      bank_account: accountIds[0],
      transfer_account: accountIds[1],
      user: userId,
    });
    transactions.push({
      concept: "Retirada de efectivo en el cajero",
      amount: 100,
      kind: "transferencia",
      spent_at: new Date(base.getFullYear(), base.getMonth(), 3, 12, 30),
      source: "manual",
      auto_categorized: "no",
      bank_account: accountIds[0],
      transfer_account: accountIds[2],
      user: userId,
    });

    const count = 9 + Math.floor(rnd() * 4);
    for (let i = 0; i < count; i++) {
      const tpl = expenseTemplates[Math.floor(rnd() * expenseTemplates.length)];
      const day = 1 + Math.floor(rnd() * Math.max(monthDays - 1, 1));
      transactions.push({
        concept: tpl.concept,
        amount: Math.round((tpl.min + rnd() * (tpl.max - tpl.min)) * 100) / 100,
        kind: "gasto",
        spent_at: new Date(base.getFullYear(), base.getMonth(), day, 10 + Math.floor(rnd() * 11), 15),
        source: rnd() > 0.45 ? "voz" : "manual",
        auto_categorized: rnd() > 0.4 ? "yes" : "no",
        category: categoryIds[tpl.category],
        bank_account: accountIds[Math.floor(rnd() * accountIds.length)],
        user: userId,
      });
    }
  }

  for (const tx of transactions) {
    await totalumSdk.crud.createRecord("transaction", tx);
  }

  await totalumSdk.crud.createRecord("savings_goal", {
    title: "Viaje a Japón",
    target_amount: 3000,
    saved_amount: 850,
    monthly_contribution: 180,
    deadline: new Date(now.getFullYear() + 1, 3, 1),
    status: "activa",
    notes: "Vuelos + 12 noches. Reservar con antelación en temporada baja.",
    user: userId,
  });
  await totalumSdk.crud.createRecord("savings_goal", {
    title: "Colchón de emergencia",
    target_amount: 6000,
    saved_amount: 2100,
    monthly_contribution: 250,
    deadline: new Date(now.getFullYear() + 1, 11, 31),
    status: "activa",
    notes: "Objetivo: 3 meses de gastos fijos.",
    user: userId,
  });

  await totalumSdk.crud.createRecord("outing_plan", {
    title: "Cena de cumpleaños de Marta",
    planned_at: new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 4, 28), 21, 0),
    estimated_cost: 55,
    max_recommended: 45,
    ai_advice:
      "Con tu ritmo de gasto actual puedes permitirte 45 € en esta cena. Si eliges menú cerrado y pagas en efectivo te será más fácil no pasarte.",
    status: "planificada",
    user: userId,
  });
  await totalumSdk.crud.createRecord("outing_plan", {
    title: "Escapada de fin de semana",
    planned_at: new Date(now.getFullYear(), now.getMonth() + 1, 8, 10, 0),
    estimated_cost: 210,
    max_recommended: 165,
    ai_advice:
      "Reserva alojamiento antes de fin de mes y reparte el gasto entre dos meses para no comprometer tu meta de ahorro.",
    status: "planificada",
    user: userId,
  });

  await totalumSdk.crud.createRecord("notification", {
    title: "Bienvenido a Fintra",
    message:
      "He preparado tus categorías, presupuestos y un historial de ejemplo. Mándame una nota de voz para registrar tus gastos del día.",
    severity: "info",
    is_read: "no",
    user: userId,
  });

  console.log("[finance] bootstrap complete for user:", userId, "transactions:", transactions.length);
  return { created: true };
}

/** ------------------------------------------------------------------
 * Alerts: creates notifications when a budget gets close to its limit
 * ------------------------------------------------------------------ */
export async function refreshBudgetAlerts(userId: string, budgets: BudgetProgress[]) {
  const month = monthKey(new Date());
  const existing = await totalumSdk.crud.query("notification", {
    _filter: { user: userId },
    _sort: { createdAt: "desc" },
    _limit: 60,
  });
  const existingTitles = new Set(((existing.data as any[]) || []).map((n) => n.title));

  for (const b of budgets) {
    if (!b.category || !b.limit_amount) continue;
    const threshold = b.alert_threshold || 80;
    if (b.pct < threshold) continue;

    const exceeded = b.pct >= 100;
    const title = `${exceeded ? "Límite superado" : "Cerca del límite"}: ${b.category.name} (${month})`;
    if (existingTitles.has(title)) continue;

    await totalumSdk.crud.createRecord("notification", {
      title,
      message: exceeded
        ? `Has gastado ${formatCurrency(b.spent)} de los ${formatCurrency(b.limit_amount)} presupuestados en ${b.category.name}. Frena este gasto el resto del mes.`
        : `Llevas ${formatCurrency(b.spent)} de ${formatCurrency(b.limit_amount)} (${b.pct.toFixed(0)} %) en ${b.category.name}. Te quedan ${formatCurrency(b.limit_amount - b.spent)} este mes.`,
      severity: exceeded ? "critica" : "aviso",
      is_read: "no",
      user: userId,
      category: b.category._id,
      budget: b._id,
    });
    console.log("[finance] alert created:", title);
  }
}

/** ------------------------------------------------------------------
 * Dashboard aggregation
 * ------------------------------------------------------------------ */
export async function buildDashboard(userId: string): Promise<DashboardData> {
  const now = new Date();
  const month = monthKey(now);
  const from = addMonths(now, -5);

  const [txRes, budgetsRes, goalsRes, outingsRes, accountsRes, notifRes] = await Promise.all([
    totalumSdk.crud.query("transaction", {
      _filter: { user: userId, spent_at: { gte: from.toISOString() } },
      _sort: { spent_at: "desc" },
      _limit: 1000,
      category: true,
      bank_account: true,
    }),
    totalumSdk.crud.query("budget", {
      _filter: { user: userId, month },
      _limit: 100,
      category: true,
    }),
    totalumSdk.crud.query("savings_goal", {
      _filter: { user: userId },
      _sort: { createdAt: "desc" },
      _limit: 50,
    }),
    totalumSdk.crud.query("outing_plan", {
      _filter: { user: userId },
      _sort: { planned_at: "asc" },
      _limit: 50,
    }),
    totalumSdk.crud.query("bank_account", { _filter: { user: userId }, _limit: 50 }),
    totalumSdk.crud.query("notification", {
      _filter: { user: userId },
      _sort: { createdAt: "desc" },
      _limit: 20,
    }),
  ]);

  const transactions = ((txRes.data as any[]) || []) as Transaction[];
  const monthTx = transactions.filter((t) => monthKey(new Date(t.spent_at)) === month);

  // Todos los importes salen del núcleo determinista (src/lib/finance-core.ts):
  // las transferencias, los pagos de tarjeta y los ajustes NUNCA cuentan como
  // gasto ni como ingreso.
  const monthTotals = computeTotals(monthTx as any);
  const income = monthTotals.income;
  const expense = monthTotals.expense;

  const categoryIdOf = (t: Transaction) =>
    (typeof t.category === "object" && t.category ? (t.category as any)._id : t.category) || null;
  const monthRows = monthTx.map((t) => ({
    amount: t.amount,
    kind: t.kind,
    categoryId: categoryIdOf(t),
  }));

  // Budgets with real spending
  const budgetRows = ((budgetsRes.data as any[]) || []).map((b) => ({
    _id: b._id,
    month: b.month,
    limit_amount: b.limit_amount,
    alert_threshold: b.alert_threshold,
    categoryId: typeof b.category === "object" && b.category ? b.category._id : b.category || null,
    _category: typeof b.category === "object" && b.category ? b.category : null,
  }));
  const budgets: BudgetProgress[] = computeBudgets(budgetRows as any, monthRows).map((b) => {
    const cat = (b as any)._category;
    return {
      _id: b._id,
      month: b.month,
      limit_amount: b.limit_amount,
      alert_threshold: b.alert_threshold,
      spent: b.spent,
      pct: b.pct,
      category: cat
        ? { _id: cat._id, name: cat.name, color: cat.color || "#4ade80", emoji: cat.emoji || "💸" }
        : null,
    };
  });

  // Category breakdown for the current month
  const breakdownMap = new Map<string, { name: string; color: string; emoji: string; amount: number }>();
  for (const t of monthTx) {
    if (!isExpense(t.kind)) continue;
    const cat: any = typeof t.category === "object" && t.category ? t.category : null;
    const key = cat?._id || "sin-categoria";
    const current = breakdownMap.get(key) || {
      name: cat?.name || "Sin categoría",
      color: cat?.color || "#94a3b8",
      emoji: cat?.emoji || "❔",
      amount: 0,
    };
    current.amount += t.amount || 0;
    breakdownMap.set(key, current);
  }
  const categoryBreakdown = [...breakdownMap.values()].sort((a, b) => b.amount - a.amount);

  // Last 6 months series
  const monthlySeries = Array.from({ length: 6 }, (_, i) => {
    const d = addMonths(now, -(5 - i));
    const key = monthKey(d);
    const rows = transactions.filter((t) => monthKey(new Date(t.spent_at)) === key);
    const totals = computeTotals(rows as any);
    return {
      month: key,
      label: MONTH_NAMES[d.getMonth()].slice(0, 3),
      income: totals.income,
      expense: totals.expense,
    };
  });

  // Daily expenses for the current month
  const totalDays = daysInMonth(now);
  const dailySeries = Array.from({ length: totalDays }, (_, i) => {
    const day = i + 1;
    const amount = sumMoney(
      monthTx
        .filter((t) => isExpense(t.kind) && new Date(t.spent_at).getDate() === day)
        .map((t) => t.amount)
    );
    return { day: String(day), amount };
  });

  const goals = ((goalsRes.data as any[]) || []) as any[];
  const savedTotal = sumMoney(goals.map((g) => g.saved_amount));
  const savingsTarget = sumMoney(goals.map((g) => g.target_amount));

  const budgetTotal = sumMoney(budgets.map((b) => b.limit_amount));
  const budgetSpent = sumMoney(budgets.map((b) => b.spent));
  const daysLeft = Math.max(totalDays - now.getDate() + 1, 1);

  const accounts = ((accountsRes.data as any[]) || []) as any[];
  const outings = (((outingsRes.data as any[]) || []) as any[]).filter((o) => o.status !== "cancelada");

  // Patrimonio neto = activos − pasivos (las tarjetas en negativo son deuda)
  const netWorth = computeNetWorth(accounts);

  // "Disponible para gastar": liquidez menos obligaciones, reservas y colchón.
  // NUNCA es el saldo del banco, y el desglose se muestra al usuario.
  const safeToSpend = computeSafeToSpend({
    today: now,
    accounts,
    monthIncome: income,
    monthExpense: expense,
    budgetTotal,
    budgetSpent,
    goals,
    plannedOutings: outings,
    incomeDates: transactions.filter((t) => isIncome(t.kind)).map((t) => t.spent_at),
  });

  const pastMonths = monthlySeries.filter((m) => m.month !== month && m.expense > 0);
  const avgMonthlyExpense = pastMonths.length
    ? round2(sumMoney(pastMonths.map((m) => m.expense)) / pastMonths.length)
    : expense;

  const health = computeHealthScore({
    monthIncome: income,
    monthExpense: expense,
    budgetTotal,
    budgetSpent,
    liquidity: netWorth.liquidity,
    cardDebt: netWorth.cardDebt,
    avgMonthlyExpense,
  });

  const notifications = ((notifRes.data as any[]) || []) as any[];

  return {
    month,
    monthLabel: monthLabel(month),
    income,
    expense,
    internalMoved: monthTotals.internal,
    balance: monthTotals.net,
    budgetTotal,
    budgetSpent,
    safeToSpend,
    netWorth,
    // Compatibilidad: el límite diario ya viene del motor determinista
    dailySafeSpend: safeToSpend.dailyLimit,
    daysLeft,
    savedTotal,
    savingsTarget,
    healthScore: health.score,
    healthComponents: health.components,
    avgMonthlyExpense,
    budgets,
    categoryBreakdown,
    monthlySeries,
    dailySeries,
    goals: goals as any,
    outings: outings as any,
    recentTransactions: transactions.slice(0, 12),
    accounts: accounts as any,
    notifications: notifications as any,
    unreadCount: notifications.filter((n) => n.is_read !== "yes").length,
  };
}

/** ------------------------------------------------------------------
 * OpenAI helpers (Totalum built-in integration, no API key needed)
 * ------------------------------------------------------------------ */
export async function askAi(
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number; model?: string } = {}
): Promise<string> {
  const result = await totalumSdk.openai.createChatCompletion({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    model: opts.model || "gpt-4.1-mini",
    max_tokens: opts.maxTokens ?? 900,
    temperature: opts.temperature ?? 0.4,
  } as any);
  const text = (result.data as any)?.choices?.[0]?.message?.content || "";
  return text;
}

export function extractJson<T>(text: string): T | null {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch (err) {
    console.error("[finance] extractJson failed:", err, cleaned.slice(0, 400));
    return null;
  }
}

export function formatCurrency(value: number): string {
  return `${(value || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** ------------------------------------------------------------------
 * Automatic categorization of concepts with AI
 * Returns a map: concept -> categoryId
 * ------------------------------------------------------------------ */
export async function categorizeConcepts(
  concepts: string[],
  categories: { _id: string; name: string; kind: string }[]
): Promise<Record<string, string>> {
  const expenseCats = categories.filter((c) => c.kind !== "ingreso");
  if (concepts.length === 0 || expenseCats.length === 0) return {};

  const prompt = `Categorías disponibles (usa exactamente estos nombres):
${expenseCats.map((c) => `- ${c.name}`).join("\n")}

Conceptos a categorizar:
${concepts.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Devuelve SOLO un JSON con la forma {"asignaciones":[{"concepto":"...","categoria":"..."}]}`;

  try {
    const text = await askAi(
      "Eres un motor de categorización de gastos personales. Respondes únicamente con JSON válido, sin explicaciones.",
      prompt,
      { temperature: 0, maxTokens: 700 }
    );
    const parsed = extractJson<{ asignaciones?: { concepto: string; categoria: string }[] }>(text);
    const map: Record<string, string> = {};
    for (const item of parsed?.asignaciones || []) {
      const cat = expenseCats.find(
        (c) => c.name.toLowerCase() === String(item.categoria || "").toLowerCase()
      );
      if (cat) map[item.concepto] = cat._id;
    }
    console.log("[finance] categorizeConcepts mapped", Object.keys(map).length, "of", concepts.length);
    return map;
  } catch (err) {
    console.error("[finance] categorizeConcepts error:", err);
    return {};
  }
}

/** Finds a category by (fuzzy) name for the given user, or creates it. */
export async function findOrCreateCategory(
  userId: string,
  name: string,
  kind: "gasto" | "ingreso",
  categories: { _id: string; name: string; kind: string }[]
): Promise<string> {
  const normalized = name.trim().toLowerCase();
  const found = categories.find(
    (c) => c.name.toLowerCase() === normalized || c.name.toLowerCase().includes(normalized)
  );
  if (found) return found._id;

  const palette = ["#4ade80", "#38bdf8", "#f97316", "#a78bfa", "#f472b6", "#fbbf24", "#2dd4bf"];
  const res = await totalumSdk.crud.createRecord("category", {
    name: name.trim() || "Otros",
    kind,
    color: palette[categories.length % palette.length],
    emoji: kind === "ingreso" ? "💰" : "💸",
    user: userId,
  });
  const created = res.data as any;
  categories.push({ _id: created._id, name: created.name, kind });
  console.log("[finance] category created on the fly:", created.name);
  return created._id;
}
