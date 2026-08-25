import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import {
  askAi,
  buildDashboard,
  extractJson,
  formatCurrency,
  getSessionUser,
  serializeError,
} from "@/lib/finance";
import { clamp, round2 } from "@/lib/finance-core";

const schema = z.object({
  title: z.string().trim().min(1).max(180),
  planned_at: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Fecha no válida").optional(),
  estimated_cost: z.number().finite().min(0).max(1_000_000_000).optional(),
}).strict();

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const res = await totalumSdk.crud.query("outing_plan", {
      _filter: { user: user.id },
      _sort: { planned_at: "asc" },
      _limit: 100,
    });
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] GET /api/outings", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}

/** Creates an outing and asks the AI for the maximum the user can safely spend */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const dashboard = await buildDashboard(user.id);
    const plannedOther = dashboard.outings
      .filter((o) => o.status === "planificada")
      .reduce((s, o) => s + (o.estimated_cost || 0), 0);

    const context = `Datos financieros del usuario (mes ${dashboard.monthLabel}):
- Ingresos del mes: ${formatCurrency(dashboard.income)}
- Gastos del mes: ${formatCurrency(dashboard.expense)}
- Presupuesto total del mes: ${formatCurrency(dashboard.budgetTotal)} (gastado ${formatCurrency(dashboard.budgetSpent)})
- Disponible real para gastar (calculado por la app, no lo recalcules): ${formatCurrency(dashboard.safeToSpend.available)} ${dashboard.safeToSpend.horizonLabel}
- Límite diario recomendado: ${formatCurrency(dashboard.safeToSpend.dailyLimit)}
- Aportes mensuales comprometidos en metas de ahorro: ${formatCurrency(
      dashboard.goals.reduce((s, g) => s + (g.monthly_contribution || 0), 0)
    )}
- Otras salidas ya planificadas este mes: ${formatCurrency(plannedOther)}
- Presupuesto de "Restaurantes y salidas": ${
      dashboard.budgets.find((b) => b.category?.name?.toLowerCase().includes("restaurante"))
        ? `${formatCurrency(
            dashboard.budgets.find((b) => b.category?.name?.toLowerCase().includes("restaurante"))!.limit_amount
          )} con ${formatCurrency(
            dashboard.budgets.find((b) => b.category?.name?.toLowerCase().includes("restaurante"))!.spent
          )} ya gastados`
        : "no definido"
    }

Nueva salida: "${data.title}"${data.planned_at ? `, fecha ${new Date(data.planned_at).toLocaleDateString("es-ES")}` : ""}${
      data.estimated_cost ? `, coste estimado por el usuario ${formatCurrency(data.estimated_cost)}` : ""
    }.

Devuelve SOLO JSON: {"maximo_recomendado": number, "consejo": "2 o 3 frases en español, tono cercano y concreto"}`;

    // Base determinista: nunca por encima de lo realmente disponible
    const available = dashboard.safeToSpend.available;
    let maxRecommended = round2(
      Math.min(Math.max(dashboard.safeToSpend.dailyLimit * 1.5 - plannedOther * 0.1, 0), available)
    );
    let advice = "";

    try {
      const text = await askAi(
        "Eres un asesor financiero personal español. Calculas cuánto puede gastar alguien en una salida sin comprometer su presupuesto ni sus metas de ahorro. Respondes solo con JSON válido.",
        context,
        { maxTokens: 400, temperature: 0.4 }
      );
      const parsedAi = extractJson<{ maximo_recomendado: number; consejo: string }>(text);
      if (parsedAi && Number.isFinite(Number(parsedAi.maximo_recomendado))) {
        // La IA propone, el motor determinista manda: nunca por encima del disponible real
        maxRecommended = round2(clamp(Number(parsedAi.maximo_recomendado), 0, available));
        advice = parsedAi.consejo || "";
      }
    } catch (aiErr) {
      console.error("[API] /api/outings IA no disponible, usando cálculo local:", aiErr);
    }

    if (!advice) {
      advice = `Con tus cifras actuales puedes gastar hasta ${formatCurrency(
        maxRecommended
      )} en esta salida sin comprometer tus metas ni tu presupuesto. Tienes ${formatCurrency(
        available
      )} disponibles ${dashboard.safeToSpend.horizonLabel} (${formatCurrency(
        dashboard.safeToSpend.dailyLimit
      )} al día).`;
    }

    const res = await totalumSdk.crud.createRecord("outing_plan", {
      title: data.title,
      planned_at: data.planned_at ? new Date(data.planned_at) : new Date(),
      estimated_cost: data.estimated_cost ?? 0,
      max_recommended: maxRecommended,
      ai_advice: advice,
      status: "planificada",
      user: user.id,
    });

    if ((data.estimated_cost ?? 0) > maxRecommended) {
      await totalumSdk.crud.createRecord("notification", {
        title: `Ojo con "${data.title}"`,
        message: `Tu estimación (${formatCurrency(
          data.estimated_cost ?? 0
        )}) supera el máximo recomendado de ${formatCurrency(maxRecommended)}. ${advice}`,
        severity: "aviso",
        is_read: "no",
        user: user.id,
      });
    }

    console.info("[API] salida planificada", { id: (res.data as any)?._id });
    return NextResponse.json({ ok: true, data: { outing: res.data, maxRecommended, advice } });
  } catch (err) {
    console.error("[API ERROR] POST /api/outings", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
