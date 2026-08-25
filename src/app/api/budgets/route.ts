import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { assertOwnedReferences, getSessionUser, monthKey, serializeError } from "@/lib/finance";

const schema = z.object({
  category: z.string().min(1).max(120),
  limit_amount: z.number().finite().positive().max(1_000_000_000),
  alert_threshold: z.number().int().min(1).max(100).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
}).strict();

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const requestedMonth = new URL(req.url).searchParams.get("month");
    if (requestedMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)) {
      return NextResponse.json({ ok: false, error: { message: "Mes no válido" } }, { status: 400 });
    }
    const month = requestedMonth || monthKey(new Date());
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
    const references = await assertOwnedReferences(user.id, [
      { table: "category", id: parsed.data.category, label: "Categoría" },
    ]);
    if (!references.ok) {
      return NextResponse.json(
        { ok: false, error: { message: references.message } },
        { status: references.status || 400 }
      );
    }
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

    console.info("[API] presupuesto guardado", { month, operation: found ? "updated" : "created" });
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] POST /api/budgets", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
