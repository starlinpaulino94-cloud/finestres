import { NextResponse } from "next/server";
import { totalumSdk } from "@/lib/totalum";
import { getSessionUser, serializeError } from "@/lib/finance";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;

    const update: Record<string, any> = {};
    if (body.concept !== undefined) update.concept = body.concept;
    if (body.amount !== undefined) update.amount = Number(body.amount);
    if (body.kind !== undefined) update.kind = body.kind;
    if (body.spent_at !== undefined) update.spent_at = new Date(body.spent_at);
    if (body.category !== undefined) update.category = body.category || null;
    if (body.bank_account !== undefined) update.bank_account = body.bank_account || null;
    if (body.notes !== undefined) update.notes = body.notes;

    const res = await totalumSdk.crud.editRecordById("transaction", id, update);
    console.log("[API] movimiento actualizado:", id);
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] PUT /api/transactions/[id]", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const { id } = await params;
    await totalumSdk.crud.deleteRecordById("transaction", id);
    console.log("[API] movimiento eliminado:", id);
    return NextResponse.json({ ok: true, data: { _id: id } });
  } catch (err) {
    console.error("[API ERROR] DELETE /api/transactions/[id]", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
