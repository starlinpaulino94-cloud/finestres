import { NextResponse } from "next/server";
import { totalumSdk } from "@/lib/totalum";
import { assertOwner, getSessionUser, serializeError } from "@/lib/finance";
import { kindMeta, round2 } from "@/lib/finance-core";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const { id } = await params;
    const owner = await assertOwner("transaction", id, user.id);
    if (!owner.ok) {
      return NextResponse.json({ ok: false, error: { message: owner.message } }, { status: owner.status || 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, any>;

    const update: Record<string, any> = {};
    if (body.concept !== undefined) update.concept = String(body.concept);
    if (body.amount !== undefined) {
      const amount = round2(body.amount);
      if (amount <= 0) {
        return NextResponse.json(
          { ok: false, error: { message: "El importe debe ser mayor que cero" } },
          { status: 400 }
        );
      }
      update.amount = amount;
    }
    if (body.kind !== undefined) {
      const meta = kindMeta(body.kind);
      if (meta.value !== body.kind) {
        return NextResponse.json({ ok: false, error: { message: "Tipo de movimiento no válido" } }, { status: 400 });
      }
      update.kind = meta.value;
      // Al pasar a un movimiento interno la categoría de gasto deja de tener sentido
      if (meta.needsDestination) update.category = null;
    }
    if (body.spent_at !== undefined) update.spent_at = new Date(body.spent_at);
    if (body.category !== undefined) update.category = body.category || null;
    if (body.bank_account !== undefined) update.bank_account = body.bank_account || null;
    if (body.transfer_account !== undefined) update.transfer_account = body.transfer_account || null;
    if (body.notes !== undefined) update.notes = body.notes;

    const finalKind = update.kind || owner.record.kind;
    const meta = kindMeta(finalKind);
    if (meta.needsDestination) {
      const origin =
        update.bank_account !== undefined
          ? update.bank_account
          : typeof owner.record.bank_account === "object" && owner.record.bank_account
            ? owner.record.bank_account._id
            : owner.record.bank_account;
      const destination =
        update.transfer_account !== undefined
          ? update.transfer_account
          : typeof owner.record.transfer_account === "object" && owner.record.transfer_account
            ? owner.record.transfer_account._id
            : owner.record.transfer_account;
      if (!origin || !destination) {
        return NextResponse.json(
          { ok: false, error: { message: `Este movimiento (${meta.label.toLowerCase()}) necesita cuenta de origen y de destino` } },
          { status: 400 }
        );
      }
      if (String(origin) === String(destination)) {
        return NextResponse.json(
          { ok: false, error: { message: "La cuenta de origen y la de destino no pueden ser la misma" } },
          { status: 400 }
        );
      }
    }

    const res = await totalumSdk.crud.editRecordById("transaction", id, update);
    console.log("[API] movimiento actualizado:", id, update);
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
    const owner = await assertOwner("transaction", id, user.id);
    if (!owner.ok) {
      return NextResponse.json({ ok: false, error: { message: owner.message } }, { status: owner.status || 403 });
    }

    await totalumSdk.crud.deleteRecordById("transaction", id);
    console.log("[API] movimiento eliminado:", id);
    return NextResponse.json({ ok: true, data: { _id: id } });
  } catch (err) {
    console.error("[API ERROR] DELETE /api/transactions/[id]", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
