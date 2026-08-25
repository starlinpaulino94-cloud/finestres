import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { totalumSdk } from "@/lib/totalum";
import {
  computeBudgets,
  deriveAccountBalances,
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
      console.warn("[security] acceso a registro ajeno rechazado", { table, id });
      return { ok: false, status: 403, message: "Ese registro no es tuyo" };
    }
    return { ok: true, record };
  } catch (err) {
    console.error("[security] assertOwner error:", table, id, err);
    throw err;
  }
}

export interface OwnedReference {
  table: string;
  id?: string | null;
  label: string;
}

/** Valida las relaciones recibidas del cliente antes de persistirlas. */
export async function assertOwnedReferences(
  userId: string,
  references: OwnedReference[]
): Promise<OwnerCheck> {
  for (const reference of references) {
    if (!reference.id) continue;
    const check = await assertOwner(reference.table, reference.id, userId);
    if (!check.ok) {
      return {
        ok: false,
        status: check.status,
        message: `${reference.label}: ${check.message || "referencia no válida"}`,
      };
    }
  }
  return { ok: true };
}

/** Activa el ledger derivado conservando el saldo actual como snapshot inicial. */
export async function ensureBalanceTracking(userId: string, accountIds: (string | null | undefined)[]) {
  for (const id of new Set(accountIds.filter((value): value is string => Boolean(value)))) {
    const check = await assertOwner("bank_account", id, userId);
    if (!check.ok) return check;
    if (!check.record.balance_as_of) {
      await totalumSdk.crud.editRecordById("bank_account", id, { balance_as_of: new Date() });
    }
  }
  return { ok: true } as OwnerCheck;
}

export function serializeError(err: unknown) {
  const e = err as any;
  const publicError = ["VoiceRequestError", "AssistantActionError"].includes(String(e?.name || ""));
  return {
    message:
      process.env.NODE_ENV !== "production" || publicError
        ? String(e?.message || "Error desconocido")
        : "No se pudo completar la operación",
    code: typeof e?.code === "string" ? e.code.slice(0, 80) : null,
  };
}

/** Consulta paginada para evitar cálculos o exportaciones silenciosamente truncados. */
export async function queryAllRecords(
  table: string,
  options: Record<string, unknown>,
  pageSize = 500,
  maxRows = 20_000
): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const response = await totalumSdk.crud.query(table, {
      ...options,
      _limit: pageSize,
      _offset: offset,
    } as any);
    const page = (response.data as any[]) || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new Error(`La consulta de ${table} supera el límite seguro de ${maxRows} registros`);
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
 * Catálogo de categorías inicial. Es ESTRUCTURA, no datos de ejemplo:
 * ningún importe, ningún movimiento. El usuario puede editarlas y añadir
 * las suyas desde Planificación.
 * ------------------------------------------------------------------ */
export const DEFAULT_CATEGORIES: {
  name: string;
  kind: "gasto" | "ingreso";
  color: string;
  emoji: string;
}[] = [
  { name: "Vivienda", kind: "gasto", color: "#a78bfa", emoji: "🏠" },
  { name: "Supermercado", kind: "gasto", color: "#4ade80", emoji: "🛒" },
  { name: "Restaurantes y salidas", kind: "gasto", color: "#f97316", emoji: "🍽️" },
  { name: "Transporte", kind: "gasto", color: "#38bdf8", emoji: "🚇" },
  { name: "Servicios y facturas", kind: "gasto", color: "#60a5fa", emoji: "💡" },
  { name: "Suscripciones", kind: "gasto", color: "#f472b6", emoji: "🎬" },
  { name: "Salud", kind: "gasto", color: "#2dd4bf", emoji: "💊" },
  { name: "Compras", kind: "gasto", color: "#fbbf24", emoji: "🛍️" },
  { name: "Ocio", kind: "gasto", color: "#c084fc", emoji: "🎉" },
  { name: "Educación", kind: "gasto", color: "#818cf8", emoji: "📚" },
  { name: "Viajes", kind: "gasto", color: "#22d3ee", emoji: "✈️" },
  { name: "Familia", kind: "gasto", color: "#fb7185", emoji: "👨‍👩‍👧" },
  { name: "Seguros", kind: "gasto", color: "#94a3b8", emoji: "🛡️" },
  { name: "Impuestos", kind: "gasto", color: "#a3a3a3", emoji: "🧾" },
  { name: "Mascotas", kind: "gasto", color: "#facc15", emoji: "🐾" },
  { name: "Otros gastos", kind: "gasto", color: "#cbd5e1", emoji: "❔" },
  { name: "Nómina", kind: "ingreso", color: "#22c55e", emoji: "💼" },
  { name: "Trabajos y facturas", kind: "ingreso", color: "#16a34a", emoji: "🧑‍💻" },
  { name: "Otros ingresos", kind: "ingreso", color: "#84cc16", emoji: "✨" },
];

/** ------------------------------------------------------------------
 * Preparación de una cuenta nueva.
 *
 * Crea ÚNICAMENTE el catálogo de categorías y un aviso de bienvenida.
 * No crea movimientos, cuentas, presupuestos, metas ni salidas: todos los
 * datos financieros son del usuario y los introduce él (a mano o por voz).
 * Idempotente: sólo actúa si el usuario todavía no tiene categorías.
 * ------------------------------------------------------------------ */
export async function bootstrapUserData(userId: string): Promise<{ created: boolean }> {
  const existing = await totalumSdk.crud.query("category", {
    _filter: { user: userId },
    _limit: 1,
  });

  if ((existing.data as any[])?.length > 0) {
    console.info("[finance] catálogo ya preparado");
    return { created: false };
  }

  console.info("[finance] preparando catálogo inicial");

  for (const cat of DEFAULT_CATEGORIES) {
    await totalumSdk.crud.createRecord("category", {
      name: cat.name,
      kind: cat.kind,
      color: cat.color,
      emoji: cat.emoji,
      user: userId,
    });
  }

  await totalumSdk.crud.createRecord("notification", {
    title: "Bienvenido a Fintra",
    message:
      "Tu cuenta está vacía y lista para tus datos reales. Empieza por añadir tus cuentas con su saldo actual y registra tu primer movimiento a mano o con una nota de voz. Después define tus presupuestos y tus metas de ahorro.",
    severity: "info",
    is_read: "no",
    user: userId,
  });

  console.info("[finance] catálogo listo", { categories: DEFAULT_CATEGORIES.length });
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
    console.info("[finance] alerta de presupuesto creada");
  }
}

/** ------------------------------------------------------------------
 * Dashboard aggregation
 * ------------------------------------------------------------------ */
export async function buildDashboard(userId: string): Promise<DashboardData> {
  const now = new Date();
  const month = monthKey(now);
  const from = addMonths(now, -5);

  const [transactions, budgetsRes, goalsRes, outingsRes, accountsRes, notifRes] = await Promise.all([
    queryAllRecords("transaction", {
      _filter: { user: userId },
      _sort: { spent_at: "desc" },
      category: true,
      bank_account: true,
      transfer_account: true,
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

  const transactionRows = (transactions as Transaction[]).filter(
    (transaction) => new Date(transaction.spent_at) >= from
  );
  const monthTx = transactionRows.filter((t) => monthKey(new Date(t.spent_at)) === month);

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
    const rows = transactionRows.filter((t) => monthKey(new Date(t.spent_at)) === key);
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

  const accounts = deriveAccountBalances(
    ((accountsRes.data as any[]) || []) as any[],
    transactions as any[]
  );
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
    incomeDates: transactionRows.filter((t) => isIncome(t.kind)).map((t) => t.spent_at),
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
    recentTransactions: transactionRows.slice(0, 12),
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
    console.warn("[finance] respuesta JSON de IA no válida", { name: (err as Error)?.name });
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
  console.info("[finance] categoría automática creada", { id: created._id });
  return created._id;
}
