/**
 * Núcleo financiero determinista de Fintra.
 *
 * Módulo PURO: sin I/O, sin SDK, sin imports de servidor. Todos los cálculos
 * críticos (saldo, patrimonio, disponible para gastar, presupuesto, salud
 * financiera) viven aquí para que:
 *   1) la app siga funcionando aunque la IA esté caída,
 *   2) la IA nunca calcule cifras: sólo interpreta las que produce este módulo,
 *   3) todo sea testeable con `npm run test:finance`.
 */

/* ------------------------------------------------------------------ *
 * Tipos de movimiento
 * ------------------------------------------------------------------ */

export type TxKind = "gasto" | "ingreso" | "transferencia" | "pago_tarjeta" | "ajuste";

export interface KindMeta {
  value: TxKind;
  label: string;
  /** Signo con el que se muestra en la interfaz */
  sign: "+" | "−" | "=";
  /** Cuenta como gasto real (presupuestos, informes, gráficas) */
  expense: boolean;
  /** Cuenta como ingreso real */
  income: boolean;
  /** Necesita cuenta destino (movimiento entre cuentas propias) */
  needsDestination: boolean;
  help: string;
}

export const TX_KINDS: KindMeta[] = [
  {
    value: "gasto",
    label: "Gasto",
    sign: "−",
    expense: true,
    income: false,
    needsDestination: false,
    help: "Dinero que sale de tu bolsillo. Cuenta en presupuestos e informes.",
  },
  {
    value: "ingreso",
    label: "Ingreso",
    sign: "+",
    expense: false,
    income: true,
    needsDestination: false,
    help: "Dinero que entra: nómina, facturas, ventas, intereses…",
  },
  {
    value: "transferencia",
    label: "Transferencia entre cuentas",
    sign: "=",
    expense: false,
    income: false,
    needsDestination: true,
    help: "Mueves dinero entre tus propias cuentas. No es un gasto ni un ingreso.",
  },
  {
    value: "pago_tarjeta",
    label: "Pago de tarjeta",
    sign: "=",
    expense: false,
    income: false,
    needsDestination: true,
    help: "Pagas el saldo de tu tarjeta desde una cuenta. El gasto ya se contó al comprar.",
  },
  {
    value: "ajuste",
    label: "Ajuste de saldo",
    sign: "=",
    expense: false,
    income: false,
    needsDestination: false,
    help: "Corrección para cuadrar un saldo con tu banco. No altera gastos ni ingresos.",
  },
];

const KIND_MAP: Record<string, KindMeta> = TX_KINDS.reduce(
  (acc, k) => ({ ...acc, [k.value]: k }),
  {} as Record<string, KindMeta>
);

/** Devuelve los metadatos del tipo. Los movimientos antiguos sin tipo se tratan como gasto. */
export function kindMeta(kind?: string | null): KindMeta {
  return KIND_MAP[String(kind || "gasto")] || KIND_MAP.gasto;
}

export function isExpense(kind?: string | null): boolean {
  return kindMeta(kind).expense;
}

export function isIncome(kind?: string | null): boolean {
  return kindMeta(kind).income;
}

/** Movimiento interno: ni gasto ni ingreso (transferencia, pago de tarjeta, ajuste). */
export function isInternal(kind?: string | null): boolean {
  const meta = kindMeta(kind);
  return !meta.expense && !meta.income;
}

/* ------------------------------------------------------------------ *
 * Integridad del dinero
 * ------------------------------------------------------------------ */

/**
 * Redondea a céntimos evitando la deriva del coma flotante.
 * Totalum sólo ofrece el tipo `number`, así que redondeamos en TODA frontera
 * (escritura en base de datos y agregación) para que las sumas no acumulen error.
 */
export function round2(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
}

/** Suma en céntimos enteros: 0.1 + 0.2 = 0.3 exacto. */
export function sumMoney(values: (number | null | undefined)[]): number {
  let cents = 0;
  for (const v of values) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    cents += Math.round(n * 100 + (n < 0 ? -1e-9 : 1e-9));
  }
  return cents / 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/* ------------------------------------------------------------------ *
 * Agregación de movimientos
 * ------------------------------------------------------------------ */

export interface AmountRow {
  amount?: number | null;
  kind?: string | null;
}

export interface Totals {
  income: number;
  expense: number;
  /** Volumen movido entre cuentas propias (no afecta al balance) */
  internal: number;
  /** Ingresos − gastos (los internos nunca entran) */
  net: number;
}

export function computeTotals(rows: AmountRow[]): Totals {
  const income = sumMoney(rows.filter((r) => isIncome(r.kind)).map((r) => r.amount));
  const expense = sumMoney(rows.filter((r) => isExpense(r.kind)).map((r) => r.amount));
  const internal = sumMoney(rows.filter((r) => isInternal(r.kind)).map((r) => r.amount));
  return { income, expense, internal, net: round2(income - expense) };
}

export interface CategorizedRow extends AmountRow {
  categoryId?: string | null;
}

/** Gasto real por categoría. Los movimientos internos nunca se contabilizan. */
export function spentByCategory(rows: CategorizedRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (!isExpense(row.kind)) continue;
    const key = row.categoryId || "sin-categoria";
    out[key] = round2((out[key] || 0) + round2(row.amount));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Cuentas y patrimonio neto
 * ------------------------------------------------------------------ */

export interface AccountLike {
  _id?: string;
  name?: string;
  account_type?: string | null;
  balance?: number | null;
}

export function isCreditCard(account: AccountLike): boolean {
  return account.account_type === "tarjeta_credito";
}

export interface NetWorth {
  /** Suma de saldos positivos */
  assets: number;
  /** Suma de saldos negativos, en positivo (deuda) */
  liabilities: number;
  netWorth: number;
  /** Dinero líquido disponible hoy (excluye tarjetas de crédito) */
  liquidity: number;
  /** Deuda de tarjetas de crédito pendiente de pago */
  cardDebt: number;
}

export function computeNetWorth(accounts: AccountLike[]): NetWorth {
  const balances = accounts.map((a) => ({ account: a, balance: round2(a.balance) }));
  const assets = sumMoney(balances.filter((b) => b.balance > 0).map((b) => b.balance));
  const liabilities = sumMoney(balances.filter((b) => b.balance < 0).map((b) => -b.balance));
  const liquidity = sumMoney(
    balances.filter((b) => b.balance > 0 && !isCreditCard(b.account)).map((b) => b.balance)
  );
  const cardDebt = sumMoney(
    balances.filter((b) => b.balance < 0 && isCreditCard(b.account)).map((b) => -b.balance)
  );
  return {
    assets,
    liabilities,
    netWorth: round2(assets - liabilities),
    liquidity,
    cardDebt,
  };
}

/* ------------------------------------------------------------------ *
 * Fechas
 * ------------------------------------------------------------------ */

export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/** Días naturales entre dos fechas (mínimo 1, para no dividir por cero). */
export function daysUntil(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.max(Math.ceil(ms / 86400000), 1);
}

/**
 * Estima la fecha del próximo ingreso a partir del historial real:
 * usa el día del mes más frecuente entre los ingresos anteriores.
 * Sin historial suficiente, asume el día 1 del mes siguiente.
 * Es una ESTIMACIÓN, nunca se presenta como dato cierto.
 */
export function estimateNextIncomeDate(incomeDates: (string | Date)[], today: Date): Date {
  const counts = new Map<number, number>();
  for (const raw of incomeDates) {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const day = d.getDate();
    counts.set(day, (counts.get(day) || 0) + 1);
  }

  let day = 1;
  let best = 0;
  for (const [candidate, count] of counts) {
    if (count > best || (count === best && candidate < day)) {
      day = candidate;
      best = count;
    }
  }

  const monthLength = daysInMonth(today);
  if (best > 0 && day > today.getDate() && day <= monthLength) {
    return new Date(today.getFullYear(), today.getMonth(), day, 0, 0, 0, 0);
  }

  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1, 0, 0, 0, 0);
  const nextLength = daysInMonth(next);
  next.setDate(Math.min(best > 0 ? day : 1, nextLength));
  return next;
}

/* ------------------------------------------------------------------ *
 * Disponible para gastar (safe to spend)
 * ------------------------------------------------------------------ */

export interface SafeToSpendInput {
  today: Date;
  accounts: AccountLike[];
  monthIncome: number;
  monthExpense: number;
  budgetTotal: number;
  budgetSpent: number;
  goals: { monthly_contribution?: number | null; status?: string | null }[];
  plannedOutings: {
    estimated_cost?: number | null;
    planned_at?: string | Date | null;
    status?: string | null;
  }[];
  /** Fechas de ingresos anteriores, para estimar el próximo cobro */
  incomeDates?: (string | Date)[];
  /** Colchón de seguridad sobre los ingresos del mes (5 % por defecto) */
  cushionRate?: number;
}

export interface BreakdownItem {
  label: string;
  amount: number;
  sign: "+" | "−";
  hint: string;
}

export interface SafeToSpend {
  /** Dinero realmente disponible hasta el próximo ingreso */
  available: number;
  dailyLimit: number;
  weeklyLimit: number;
  horizonDays: number;
  horizonLabel: string;
  nextIncomeDate: string;
  /** true si el límite lo marca el presupuesto y no la liquidez */
  budgetCapApplied: boolean;
  breakdown: BreakdownItem[];
}

/**
 * Disponible para gastar = liquidez
 *   − deuda de tarjeta pendiente
 *   − reserva de metas del periodo
 *   − salidas ya planificadas
 *   − colchón de seguridad
 * y además acotado por lo que queda de presupuesto (si hay presupuesto).
 * NO es el saldo del banco.
 */
export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpend {
  const {
    today,
    accounts,
    monthIncome,
    budgetTotal,
    budgetSpent,
    goals,
    plannedOutings,
    incomeDates = [],
    cushionRate = 0.05,
  } = input;

  const { liquidity, cardDebt } = computeNetWorth(accounts);

  const nextIncome = estimateNextIncomeDate(incomeDates, today);
  const horizonDays = daysUntil(today, nextIncome);
  const monthLength = daysInMonth(today);

  const monthlyGoalReserve = sumMoney(
    goals.filter((g) => (g.status || "activa") === "activa").map((g) => g.monthly_contribution)
  );
  const goalReserve = round2(monthlyGoalReserve * clamp(horizonDays / monthLength, 0, 1));

  const horizonEnd = startOfDay(nextIncome);
  const outingsCost = sumMoney(
    plannedOutings
      .filter((o) => (o.status || "planificada") === "planificada")
      .filter((o) => {
        if (!o.planned_at) return true;
        const d = new Date(o.planned_at);
        if (Number.isNaN(d.getTime())) return true;
        return startOfDay(d) >= startOfDay(today) && startOfDay(d) <= horizonEnd;
      })
      .map((o) => o.estimated_cost)
  );

  const cushion = round2(Math.max(monthIncome, 0) * cushionRate);

  const rawAvailable = round2(liquidity - cardDebt - goalReserve - outingsCost - cushion);
  const budgetRemaining = budgetTotal > 0 ? Math.max(round2(budgetTotal - budgetSpent), 0) : null;

  let available = Math.max(rawAvailable, 0);
  let budgetCapApplied = false;
  if (budgetRemaining !== null && budgetRemaining < available) {
    available = budgetRemaining;
    budgetCapApplied = true;
  }

  const breakdown: BreakdownItem[] = [
    {
      label: "Dinero líquido",
      amount: liquidity,
      sign: "+",
      hint: "Saldo de tus cuentas y efectivo (las tarjetas de crédito no cuentan como dinero disponible).",
    },
  ];
  if (cardDebt > 0) {
    breakdown.push({
      label: "Deuda de tarjeta pendiente",
      amount: cardDebt,
      sign: "−",
      hint: "Ya lo has gastado: está esperando el cargo del banco.",
    });
  }
  if (goalReserve > 0) {
    breakdown.push({
      label: "Reserva para tus metas",
      amount: goalReserve,
      sign: "−",
      hint: `Parte proporcional de los ${round2(monthlyGoalReserve)} € al mes que aportas a tus metas activas.`,
    });
  }
  if (outingsCost > 0) {
    breakdown.push({
      label: "Salidas ya planificadas",
      amount: outingsCost,
      sign: "−",
      hint: "Coste estimado de las salidas que tienes previstas en este periodo.",
    });
  }
  if (cushion > 0) {
    breakdown.push({
      label: "Colchón de seguridad",
      amount: cushion,
      sign: "−",
      hint: `${Math.round(cushionRate * 100)} % de tus ingresos del mes reservados para imprevistos.`,
    });
  }
  if (budgetCapApplied && budgetRemaining !== null) {
    breakdown.push({
      label: "Límite de tus presupuestos",
      amount: budgetRemaining,
      sign: "+",
      hint: "Tienes liquidez de sobra, así que manda lo que te queda de presupuesto este mes.",
    });
  }

  return {
    available,
    dailyLimit: round2(available / horizonDays),
    weeklyLimit: round2(Math.min((available / horizonDays) * 7, available)),
    horizonDays,
    horizonLabel:
      horizonDays === 1 ? "hasta mañana" : `durante los próximos ${horizonDays} días`,
    nextIncomeDate: nextIncome.toISOString(),
    budgetCapApplied,
    breakdown,
  };
}

/* ------------------------------------------------------------------ *
 * Simulador de compras
 * ------------------------------------------------------------------ */

export type PurchaseVerdict = "puedes" | "justo" | "espera" | "no";

export interface PurchaseSimulation {
  verdict: PurchaseVerdict;
  headline: string;
  /** Disponible que quedaría después de la compra */
  remaining: number;
  /** Días que tendrías que esperar para poder pagarla con holgura */
  waitDays: number;
  impacts: string[];
}

/** Simula el impacto de una compra usando SÓLO cifras deterministas. */
export function simulatePurchase(amount: number, safe: SafeToSpend): PurchaseSimulation {
  const cost = round2(amount);
  const remaining = round2(safe.available - cost);
  const impacts: string[] = [];

  if (remaining >= 0) {
    impacts.push(
      `Te quedarían ${remaining.toFixed(2)} € disponibles ${safe.horizonLabel} (${round2(
        remaining / safe.horizonDays
      ).toFixed(2)} € al día).`
    );
  } else {
    impacts.push(`Te faltan ${Math.abs(remaining).toFixed(2)} € para poder pagarla sin tocar tus reservas.`);
  }
  if (safe.budgetCapApplied) {
    impacts.push("Tu límite lo marca el presupuesto del mes, no la falta de dinero en cuenta.");
  }

  const dailyPace = safe.dailyLimit > 0 ? safe.dailyLimit : 0;
  const waitDays = remaining >= 0 ? 0 : dailyPace > 0 ? Math.ceil(Math.abs(remaining) / dailyPace) : 0;

  if (remaining >= safe.available * 0.35) {
    return { verdict: "puedes", headline: "Puedes comprarlo sin comprometer nada.", remaining, waitDays, impacts };
  }
  if (remaining >= 0) {
    impacts.push("Es viable, pero te quedarías con poco margen para el resto del periodo.");
    return { verdict: "justo", headline: "Puedes, pero vas justo.", remaining, waitDays, impacts };
  }
  if (waitDays > 0 && waitDays <= 45) {
    impacts.push(`Ahorrando a tu ritmo actual podrías comprarlo en unos ${waitDays} días.`);
    return { verdict: "espera", headline: `Mejor espera unos ${waitDays} días.`, remaining, waitDays, impacts };
  }
  impacts.push("Con tus cifras actuales tendrías que reducir gastos fijos o retrasar alguna meta.");
  return { verdict: "no", headline: "Ahora mismo no es recomendable.", remaining, waitDays, impacts };
}

/* ------------------------------------------------------------------ *
 * Salud financiera explicable
 * ------------------------------------------------------------------ */

export interface HealthInput {
  monthIncome: number;
  monthExpense: number;
  budgetTotal: number;
  budgetSpent: number;
  liquidity: number;
  cardDebt: number;
  /** Gasto medio mensual de los últimos meses */
  avgMonthlyExpense: number;
}

export interface HealthComponent {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface HealthScore {
  score: number;
  components: HealthComponent[];
}

/** Puntuación 0-100 con desglose: nunca un número arbitrario. */
export function computeHealthScore(input: HealthInput): HealthScore {
  const { monthIncome, monthExpense, budgetTotal, budgetSpent, liquidity, cardDebt, avgMonthlyExpense } =
    input;

  const savingsRate = monthIncome > 0 ? clamp((monthIncome - monthExpense) / monthIncome, 0, 1) : 0;
  const discipline = budgetTotal > 0 ? clamp(1 - budgetSpent / budgetTotal, 0, 1) : 0.5;
  const months = avgMonthlyExpense > 0 ? liquidity / avgMonthlyExpense : 0;
  const buffer = clamp(months / 3, 0, 1);
  const debtRatio = monthIncome > 0 ? clamp(cardDebt / monthIncome, 0, 1) : cardDebt > 0 ? 1 : 0;
  const debtHealth = 1 - debtRatio;

  const components: HealthComponent[] = [
    {
      key: "ahorro",
      label: "Tasa de ahorro",
      points: Math.round(savingsRate * 35),
      max: 35,
      detail: `Ahorras el ${Math.round(savingsRate * 100)} % de lo que ingresas este mes.`,
    },
    {
      key: "presupuesto",
      label: "Cumplimiento del presupuesto",
      points: Math.round(discipline * 25),
      max: 25,
      detail:
        budgetTotal > 0
          ? `Has usado el ${Math.round((budgetSpent / budgetTotal) * 100)} % de tu presupuesto.`
          : "Sin presupuestos definidos todavía.",
    },
    {
      key: "colchon",
      label: "Colchón de emergencia",
      points: Math.round(buffer * 20),
      max: 20,
      detail:
        avgMonthlyExpense > 0
          ? `Tu liquidez cubre ${months.toFixed(1)} meses de gastos (objetivo: 3).`
          : "Aún no hay historial de gastos para calcularlo.",
    },
    {
      key: "deuda",
      label: "Carga de deuda",
      points: Math.round(debtHealth * 20),
      max: 20,
      detail:
        cardDebt > 0
          ? `Debes ${round2(cardDebt).toFixed(2)} € de tarjeta, un ${Math.round(debtRatio * 100)} % de tus ingresos.`
          : "No tienes deuda de tarjeta pendiente.",
    },
  ];

  return {
    score: clamp(
      components.reduce((s, c) => s + c.points, 0),
      0,
      100
    ),
    components,
  };
}

/* ------------------------------------------------------------------ *
 * Presupuestos
 * ------------------------------------------------------------------ */

export interface BudgetInput {
  _id: string;
  month: string;
  limit_amount?: number | null;
  alert_threshold?: number | null;
  categoryId: string | null;
}

export interface BudgetComputed extends BudgetInput {
  limit_amount: number;
  alert_threshold: number;
  spent: number;
  pct: number;
  remaining: number;
}

/** Progreso de cada presupuesto contando SÓLO gastos reales. */
export function computeBudgets(budgets: BudgetInput[], rows: CategorizedRow[]): BudgetComputed[] {
  const spent = spentByCategory(rows);
  return budgets
    .map((b) => {
      const limit = round2(b.limit_amount);
      const used = b.categoryId ? spent[b.categoryId] || 0 : 0;
      return {
        ...b,
        limit_amount: limit,
        alert_threshold: b.alert_threshold || 80,
        spent: used,
        pct: limit > 0 ? round2((used / limit) * 100) : 0,
        remaining: round2(limit - used),
      };
    })
    .sort((a, b) => b.pct - a.pct);
}
