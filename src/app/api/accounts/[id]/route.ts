import { NextResponse } from "next/server";
import { totalumSdk } from "@/lib/totalum";
import { getSessionUser, serializeError } from "@/lib/finance";

/** Updates an account: the user keeps its balance and details up to date manually */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;

    const update: Record<string, any> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.bank_name !== undefined) update.bank_name = body.bank_name;
    if (body.account_type !== undefined) update.account_type = body.account_type;
    if (body.last_four !== undefined) update.last_four = body.last_four;
    if (body.balance !== undefined) update.balance = Number(body.balance);

    const res = await totalumSdk.crud.editRecordById("bank_account", id, update);
    console.log("[API] cuenta actualizada:", id, update);
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] PUT /api/accounts/[id]", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
