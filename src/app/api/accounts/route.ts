import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { getSessionUser, serializeError } from "@/lib/finance";

const schema = z.object({
  name: z.string().min(1),
  bank_name: z.string().optional(),
  account_type: z.enum(["cuenta", "tarjeta_credito", "tarjeta_debito", "efectivo"]),
  last_four: z.string().optional(),
  balance: z.number().optional(),
});

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const res = await totalumSdk.crud.query("bank_account", {
      _filter: { user: user.id },
      _sort: { createdAt: "asc" },
      _limit: 50,
    });
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] GET /api/accounts", err);
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

    const res = await totalumSdk.crud.createRecord("bank_account", {
      ...parsed.data,
      balance: parsed.data.balance ?? 0,
      currency: "EUR",
      sync_status: parsed.data.account_type === "efectivo" ? "desconectada" : "conectada",
      last_sync_at: new Date(),
      user: user.id,
    });
    console.log("[API] cuenta creada:", (res.data as any)?._id, parsed.data.name);
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] POST /api/accounts", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
