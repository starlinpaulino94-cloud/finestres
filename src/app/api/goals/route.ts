import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { askAi, getSessionUser, serializeError } from "@/lib/finance";
import { formatBaseCurrency } from "@/lib/currency";

const schema = z.object({
  title: z.string().min(1),
  target_amount: z.number().positive(),
  saved_amount: z.number().min(0).optional(),
  deadline: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const res = await totalumSdk.crud.query("savings_goal", {
      _filter: { user: user.id },
      _sort: { createdAt: "desc" },
      _limit: 100,
    });
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] GET /api/goals", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}

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
    const saved = data.saved_amount ?? 0;
    const deadline = data.deadline ? new Date(data.deadline) : null;
    const monthsLeft = deadline
      ? Math.max(
          Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.4)),
          1
        )
      : 12;
    const monthlyContribution = Math.max(
      Math.round(((data.target_amount - saved) / monthsLeft) * 100) / 100,
      0
    );

    const res = await totalumSdk.crud.createRecord("savings_goal", {
      title: data.title,
      target_amount: data.target_amount,
      saved_amount: saved,
      monthly_contribution: monthlyContribution,
      ...(deadline ? { deadline } : {}),
      status: "activa",
      notes: data.notes,
      user: user.id,
    });

    // Non-critical: an AI tip about the new goal, logged but never blocking
    let advice = "";
    try {
      advice = await askAi(
        "Eres un asesor financiero personal español, directo y práctico. Máximo 2 frases.",
        `Meta de ahorro: "${data.title}". Objetivo ${formatBaseCurrency(data.target_amount)}, ya ahorrados ${formatBaseCurrency(saved)}, plazo ${monthsLeft} meses (aporte necesario ${formatBaseCurrency(monthlyContribution)}/mes). Dame un consejo concreto para conseguirla.`,
        { maxTokens: 160, temperature: 0.6 }
      );
    } catch (aiErr) {
      console.error("[API] /api/goals consejo IA no disponible:", aiErr);
    }

    if (advice) {
      await totalumSdk.crud.createRecord("notification", {
        title: `Nueva meta: ${data.title}`,
        message: `${advice}\n\nAporte sugerido: ${formatBaseCurrency(monthlyContribution)}/mes durante ${monthsLeft} meses.`,
        severity: "info",
        is_read: "no",
        user: user.id,
      });
    }

    console.log("[API] meta creada:", (res.data as any)?._id, data.title);
    return NextResponse.json({ ok: true, data: { goal: res.data, advice, monthlyContribution } });
  } catch (err) {
    console.error("[API ERROR] POST /api/goals", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
