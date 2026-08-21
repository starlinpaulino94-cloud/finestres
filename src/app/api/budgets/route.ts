import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { getSessionUser, monthKey, serializeError } from "@/lib/finance";

const schema = z.object({
  category: z.string().min(1),
  limit_amount: z.number().min(0),
  alert_threshold: z.number().min(1).max(100).optional(),
  month: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const month = new URL(req.url).searchParams.get("month") || monthKey(new Date());
    const res = await totalumSdk.crud.query("budget", {
      _filter: { user: user.id, month },
      _limit: 100,
      category: true,
    });
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] GET /api/budgets", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}

/** Upsert: one budget per (category, month) */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const month = parsed.data.month || monthKey(new Date());
    const existing = await totalumSdk.crud.query("budget", {
      _filter: { user: user.id, month, category: parsed.data.category },
      _limit: 1,
    });

    const payload = {
      month,
      limit_amount: parsed.data.limit_amount,
      alert_threshold: parsed.data.alert_threshold ?? 80,
      category: parsed.data.category,
      user: user.id,
    };

    const found = (existing.data as any[])?.[0];
    const res = found
      ? await totalumSdk.crud.editRecordById("budget", found._id, payload)
      : await totalumSdk.crud.createRecord("budget", payload);

    console.log("[API] presupuesto guardado:", month, parsed.data.limit_amount, found ? "(editado)" : "(nuevo)");
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] POST /api/budgets", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
