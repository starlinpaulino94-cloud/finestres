import { NextResponse } from "next/server";
import { z } from "zod";
import { askAi, buildDashboard, formatCurrency, getSessionUser, serializeError } from "@/lib/finance";
import { round2, simulatePurchase } from "@/lib/finance-core";

const schema = z.object({
  amount: z.number().positive(),
  concept: z.string().optional(),
});

/**
 * Simulador de compras: "¿puedo permitirme X?".
 * El veredicto y todas las cifras son DETERMINISTAS (finance-core).
 * La IA sólo redacta la explicación y nunca puede cambiar el resultado.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const amount = round2(parsed.data.amount);
    const concept = (parsed.data.concept || "esta compra").trim();

    const dashboard = await buildDashboard(user.id);
    const simulation = simulatePurchase(amount, dashboard.safeToSpend);

    const goalsAtRisk = dashboard.goals
      .filter((g) => (g.status || "activa") === "activa" && (g.monthly_contribution || 0) > 0)
      .slice(0, 3)
      .map((g) => `${g.title} (${formatCurrency(g.monthly_contribution || 0)}/mes)`);

    let explanation = "";
    try {
      explanation = await askAi(
        "Eres un asesor financiero personal español. NO calculas: te dan las cifras ya calculadas y las explicas con claridad. Máximo 3 frases, tono cercano, siempre con las cifras que te dan.",
        `El usuario quiere gastar ${formatCurrency(amount)} en "${concept}".
Cifras calculadas por el motor financiero (no las cambies):
- Veredicto: ${simulation.verdict} (${simulation.headline})
- Disponible ahora: ${formatCurrency(dashboard.safeToSpend.available)} ${dashboard.safeToSpend.horizonLabel}
- Quedaría disponible: ${formatCurrency(simulation.remaining)}
- Límite diario actual: ${formatCurrency(dashboard.safeToSpend.dailyLimit)}
- Días de espera sugeridos: ${simulation.waitDays}
- Metas activas: ${goalsAtRisk.join("; ") || "ninguna"}
- Presupuesto del mes: ${formatCurrency(dashboard.budgetTotal)} (gastado ${formatCurrency(dashboard.budgetSpent)})

Explícale el resultado y qué debería hacer.`,
        { maxTokens: 260, temperature: 0.4 }
      );
    } catch (aiErr) {
      console.error("[API] /api/simulate explicación IA no disponible:", aiErr);
    }

    console.log("[API] simulación de compra:", { amount, verdict: simulation.verdict, remaining: simulation.remaining });

    return NextResponse.json({
      ok: true,
      data: {
        amount,
        concept,
        ...simulation,
        available: dashboard.safeToSpend.available,
        dailyLimit: dashboard.safeToSpend.dailyLimit,
        horizonLabel: dashboard.safeToSpend.horizonLabel,
        explanation: explanation.trim(),
      },
    });
  } catch (err) {
    console.error("[API ERROR] POST /api/simulate", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
