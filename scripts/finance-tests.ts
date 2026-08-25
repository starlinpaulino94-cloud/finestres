/**
 * Tests unitarios del núcleo financiero determinista.
 * Ejecutar con: npm run test:finance
 *
 * Cubren los casos donde una app de finanzas se rompe de verdad:
 * transferencias, pagos de tarjeta, redondeo de céntimos, saldos negativos,
 * disponible para gastar, presupuestos y salud financiera.
 */
import {
  computeBudgets,
  computeHealthScore,
  computeNetWorth,
  computeSafeToSpend,
  computeTotals,
  deriveAccountBalances,
  estimateNextIncomeDate,
  isExpense,
  isInternal,
  round2,
  simulatePurchase,
  spentByCategory,
  sumMoney,
} from "../src/lib/finance-core";
import { assistantPlanSchema } from "../src/lib/assistant-plan";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` → ${detail}` : ""}`);
    console.log(`  ✗ ${name} ${detail}`);
  }
}

/** Fecha local en formato YYYY-MM-DD (nunca UTC: el usuario vive en su zona). */
function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function eq(name: string, actual: unknown, expected: unknown) {
  check(name, actual === expected, `esperado ${String(expected)}, obtenido ${String(actual)}`);
}

console.log("\n== Integridad del dinero ==");
eq("round2 redondea a céntimos", round2(10.005), 10.01);
eq("round2 mantiene el signo", round2(-3.456), -3.46);
eq("round2 ignora valores no numéricos", round2("hola"), 0);
eq("sumMoney evita la deriva del coma flotante", sumMoney([0.1, 0.2]), 0.3);
eq("sumMoney suma 100 céntimos exactos", sumMoney(Array.from({ length: 100 }, () => 0.01)), 1);

console.log("\n== Tipos de movimiento ==");
eq("un gasto cuenta como gasto", isExpense("gasto"), true);
eq("una transferencia NO cuenta como gasto", isExpense("transferencia"), false);
eq("un pago de tarjeta NO cuenta como gasto", isExpense("pago_tarjeta"), false);
eq("un ajuste es interno", isInternal("ajuste"), true);
eq("un movimiento antiguo sin tipo se trata como gasto", isExpense(undefined), true);

console.log("\n== Agregación ==");
const rows = [
  { amount: 100, kind: "gasto", categoryId: "cat-super" },
  { amount: 50.5, kind: "gasto", categoryId: "cat-super" },
  { amount: 2000, kind: "ingreso", categoryId: "cat-nomina" },
  { amount: 300, kind: "transferencia", categoryId: null },
  { amount: 250, kind: "pago_tarjeta", categoryId: null },
  { amount: 12, kind: "ajuste", categoryId: null },
];
const totals = computeTotals(rows);
eq("gastos del periodo", totals.expense, 150.5);
eq("ingresos del periodo", totals.income, 2000);
eq("balance = ingresos − gastos", totals.net, 1849.5);
eq("los movimientos internos se agrupan aparte", totals.internal, 562);
eq("gasto por categoría sólo suma gastos", spentByCategory(rows)["cat-super"], 150.5);
eq("una transferencia no crea categoría fantasma", spentByCategory(rows)["sin-categoria"], undefined);

console.log("\n== Cuentas, tarjetas y patrimonio ==");
const accounts = [
  { _id: "a1", name: "Cuenta corriente", account_type: "cuenta", balance: 2500.4 },
  { _id: "a2", name: "Tarjeta Visa", account_type: "tarjeta_credito", balance: -310.2 },
  { _id: "a3", name: "Efectivo", account_type: "efectivo", balance: 120 },
  { _id: "a4", name: "Cuenta en descubierto", account_type: "cuenta", balance: -40 },
];
const nw = computeNetWorth(accounts);
eq("activos", nw.assets, 2620.4);
eq("pasivos (incluye descubierto)", nw.liabilities, 350.2);
eq("patrimonio neto = activos − pasivos", nw.netWorth, 2270.2);
eq("la liquidez excluye la tarjeta de crédito", nw.liquidity, 2620.4);
eq("deuda de tarjeta", nw.cardDebt, 310.2);

const tracked = deriveAccountBalances(
  [
    { _id: "cash", balance: 1000, balance_as_of: "2026-08-20T10:00:00.000Z" },
    { _id: "card", account_type: "tarjeta_credito", balance: -100, balance_as_of: "2026-08-20T10:00:00.000Z" },
  ],
  [
    { amount: 50, kind: "gasto", bank_account: "cash", balance_effective_at: "2026-08-21T10:00:00.000Z" },
    { amount: 200, kind: "ingreso", bank_account: "cash", balance_effective_at: "2026-08-22T10:00:00.000Z" },
    { amount: 75, kind: "pago_tarjeta", bank_account: "cash", transfer_account: "card", balance_effective_at: "2026-08-23T10:00:00.000Z" },
    { amount: 999, kind: "gasto", bank_account: "cash", balance_effective_at: "2026-08-19T10:00:00.000Z" },
  ]
);
eq("el ledger deriva gastos, ingresos y transferencias posteriores", tracked[0].balance, 1075);
eq("pagar tarjeta reduce la deuda", tracked[1].balance, -25);
eq("un movimiento anterior al snapshot no se vuelve a contar", tracked[0].balance !== 76, true);

console.log("\n== Plan seguro del asistente ==");
eq(
  "acepta un borrador de gasto válido",
  assistantPlanSchema.safeParse({
    resumen: "Compra",
    consejo: "",
    acciones: [{ type: "create_transaction", concept: "Café", amount: 2.5, kind: "gasto" }],
  }).success,
  true
);
eq(
  "rechaza acciones desconocidas",
  assistantPlanSchema.safeParse({ resumen: "", consejo: "", acciones: [{ type: "run_code", code: "x" }] }).success,
  false
);
eq(
  "rechaza campos extra que podrían eludir la confirmación",
  assistantPlanSchema.safeParse({
    resumen: "",
    consejo: "",
    acciones: [{ type: "create_account", name: "Cuenta", account_type: "cuenta", balance: 0, execute: true }],
  }).success,
  false
);
eq(
  "permite saldos negativos de tarjeta",
  assistantPlanSchema.safeParse({
    resumen: "",
    consejo: "",
    acciones: [{ type: "create_account", name: "Visa", account_type: "tarjeta_credito", balance: -125 }],
  }).success,
  true
);

console.log("\n== Próximo ingreso ==");
const today = new Date(2026, 7, 21); // 21 de agosto de 2026
const nextIncome = estimateNextIncomeDate(
  [new Date(2026, 4, 1), new Date(2026, 5, 1), new Date(2026, 6, 1)],
  today
);
eq("cobra el día 1 → próximo cobro el 1 del mes siguiente", localDay(nextIncome), "2026-09-01");
const midMonth = estimateNextIncomeDate([new Date(2026, 6, 25), new Date(2026, 5, 25)], today);
eq("cobra el 25 → próximo cobro este mismo mes", localDay(midMonth), "2026-08-25");
const noHistory = estimateNextIncomeDate([], today);
eq("sin historial asume el día 1 del mes siguiente", localDay(noHistory), "2026-09-01");

console.log("\n== Disponible para gastar ==");
const safe = computeSafeToSpend({
  today,
  accounts,
  monthIncome: 2000,
  monthExpense: 900,
  budgetTotal: 0,
  budgetSpent: 0,
  goals: [{ monthly_contribution: 300, status: "activa" }, { monthly_contribution: 500, status: "pausada" }],
  plannedOutings: [{ estimated_cost: 60, planned_at: new Date(2026, 7, 25), status: "planificada" }],
  incomeDates: [new Date(2026, 6, 1), new Date(2026, 5, 1)],
});
// liquidez 2620,40 − deuda 310,20 − metas 300*(11/31)=106,45 − salidas 60 − colchón 100 = 2043,75
eq("no es el saldo del banco", safe.available !== nw.liquidity, true);
eq("disponible calculado", safe.available, 2043.75);
eq("horizonte hasta el próximo ingreso", safe.horizonDays, 11);
eq("límite diario recomendado", safe.dailyLimit, round2(2043.75 / 11));
eq("las metas pausadas no reservan dinero", safe.breakdown.some((b) => b.label.includes("metas")), true);

const capped = computeSafeToSpend({
  today,
  accounts,
  monthIncome: 2000,
  monthExpense: 900,
  budgetTotal: 1500,
  budgetSpent: 1400,
  goals: [],
  plannedOutings: [],
  incomeDates: [new Date(2026, 6, 1)],
});
eq("el presupuesto restante acota el disponible", capped.available, 100);
eq("y se indica al usuario", capped.budgetCapApplied, true);

const broke = computeSafeToSpend({
  today,
  accounts: [{ _id: "x", account_type: "cuenta", balance: -200 }],
  monthIncome: 0,
  monthExpense: 300,
  budgetTotal: 0,
  budgetSpent: 0,
  goals: [],
  plannedOutings: [],
  incomeDates: [],
});
eq("con saldo negativo el disponible nunca es negativo", broke.available, 0);

console.log("\n== Simulador de compras ==");
eq("una compra pequeña se puede", simulatePurchase(200, safe).verdict, "puedes");
eq("una compra al límite avisa", simulatePurchase(2000, safe).verdict, "justo");
const bigBuy = simulatePurchase(3000, safe);
check("una compra inasumible propone esperar o descartar", ["espera", "no"].includes(bigBuy.verdict), bigBuy.verdict);
eq("el disponible restante se calcula exacto", simulatePurchase(43.75, safe).remaining, 2000);

console.log("\n== Presupuestos ==");
const budgets = computeBudgets(
  [
    { _id: "b1", month: "2026-08", limit_amount: 320, alert_threshold: 80, categoryId: "cat-super" },
    { _id: "b2", month: "2026-08", limit_amount: 100, alert_threshold: null, categoryId: "cat-ocio" },
  ],
  rows
);
eq("presupuesto con más consumo primero", budgets[0]._id, "b1");
eq("gasto imputado al presupuesto", budgets[0].spent, 150.5);
eq("porcentaje consumido", budgets[0].pct, 47.03);
eq("restante del presupuesto", budgets[0].remaining, 169.5);
eq("umbral por defecto 80 %", budgets[1].alert_threshold, 80);
eq("un presupuesto sin gasto queda a 0 %", budgets[1].pct, 0);

console.log("\n== Salud financiera ==");
const health = computeHealthScore({
  monthIncome: 2000,
  monthExpense: 900,
  budgetTotal: 1500,
  budgetSpent: 900,
  liquidity: 2620.4,
  cardDebt: 310.2,
  avgMonthlyExpense: 1200,
});
eq("la puntuación es la suma de sus componentes", health.score, health.components.reduce((s, c) => s + c.points, 0));
check("la puntuación está entre 0 y 100", health.score >= 0 && health.score <= 100, String(health.score));
eq("siempre se explica con 4 componentes", health.components.length, 4);
const worst = computeHealthScore({
  monthIncome: 1000,
  monthExpense: 1400,
  budgetTotal: 500,
  budgetSpent: 900,
  liquidity: 0,
  cardDebt: 1200,
  avgMonthlyExpense: 1400,
});
eq("gastar más de lo que entras hunde la puntuación", worst.score, 0);

console.log(`\n${failures.length === 0 ? "✅" : "❌"} ${passed} comprobaciones correctas, ${failures.length} fallos`);
if (failures.length > 0) {
  for (const f of failures) console.log(`   - ${f}`);
  process.exit(1);
}
