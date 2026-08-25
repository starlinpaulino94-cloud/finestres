import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { getSessionUser, queryAllRecords, serializeError } from "@/lib/finance";
import { deriveAccountBalances } from "@/lib/finance-core";

const schema = z.object({
  name: z.string().trim().min(1).max(180),
  bank_name: z.string().trim().max(120).optional(),
  account_type: z.enum(["cuenta", "tarjeta_credito", "tarjeta_debito", "efectivo"]),
  last_four: z.string().regex(/^\d{4}$/).optional(),
  balance: z.number().finite().min(-1_000_000_000).max(1_000_000_000).optional(),
}).strict();

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const [accounts, movements] = await Promise.all([
      totalumSdk.crud.query("bank_account", {
        _filter: { user: user.id },
        _sort: { createdAt: "asc" },
        _limit: 50,
      }),
      queryAllRecords("transaction", {
        _filter: { user: user.id },
        bank_account: true,
        transfer_account: true,
      }),
    ]);
    return NextResponse.json({
      ok: true,
      data: deriveAccountBalances((accounts.data as any[]) || [], movements),
    });
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
      balance_as_of: new Date(),
      currency: "EUR",
      user: user.id,
    });
    console.info("[API] cuenta creada", { id: (res.data as any)?._id });
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] POST /api/accounts", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
