import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { assertOwner, getSessionUser, serializeError } from "@/lib/finance";
import { round2 } from "@/lib/finance-core";

const schema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  bank_name: z.string().trim().max(120).nullable().optional(),
  account_type: z.enum(["cuenta", "tarjeta_credito", "tarjeta_debito", "efectivo"]).optional(),
  last_four: z.string().regex(/^\d{4}$/).nullable().optional(),
  balance: z.number().finite().min(-1_000_000_000).max(1_000_000_000).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "No hay cambios que aplicar");

/** Updates an account: the user keeps its balance and details up to date manually */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const { id } = await params;
    const owner = await assertOwner("bank_account", id, user.id);
    if (!owner.ok) {
      return NextResponse.json({ ok: false, error: { message: owner.message } }, { status: owner.status || 403 });
    }
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;

    const update: Record<string, any> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.bank_name !== undefined) update.bank_name = body.bank_name;
    if (body.account_type !== undefined) update.account_type = body.account_type;
    if (body.last_four !== undefined) update.last_four = body.last_four;
    if (body.balance !== undefined) {
      update.balance = round2(body.balance);
      update.balance_as_of = new Date();
    }

    const res = await totalumSdk.crud.editRecordById("bank_account", id, update);
    console.info("[API] cuenta actualizada", { id, fields: Object.keys(update) });
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] PUT /api/accounts/[id]", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
