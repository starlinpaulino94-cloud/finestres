import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { assertOwnedReferences, assertOwner, ensureBalanceTracking, getSessionUser, serializeError } from "@/lib/finance";
import { kindMeta, round2 } from "@/lib/finance-core";
import { BASE_CURRENCY, amountToBase, exchangeRateToBase, normalizeCurrency } from "@/lib/currency";

const schema = z.object({
  concept: z.string().trim().min(1).max(180).optional(),
  amount: z.number().finite().positive().max(1_000_000_000).optional(),
  kind: z.enum(["gasto", "ingreso", "transferencia", "pago_tarjeta", "ajuste"]).optional(),
  spent_at: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Fecha no válida").optional(),
  category: z.string().min(1).max(120).nullable().optional(),
  bank_account: z.string().min(1).max(120).nullable().optional(),
  transfer_account: z.string().min(1).max(120).nullable().optional(),
  currency: z.enum(["DOP", "USD", "EUR", "GBP", "CAD"]).optional(),
  exchange_rate_to_base: z.number().finite().positive().max(1_000_000).nullable().optional(),
  notes: z.string().trim().max(1200).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "No hay cambios que aplicar");

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const { id } = await params;
    const owner = await assertOwner("transaction", id, user.id);
    if (!owner.ok) {
      return NextResponse.json({ ok: false, error: { message: owner.message } }, { status: owner.status || 403 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;

    const update: Record<string, any> = {};
    if (body.concept !== undefined) update.concept = String(body.concept);
    if (body.amount !== undefined) {
      update.amount = round2(body.amount);
    }
    if (body.kind !== undefined) {
      const meta = kindMeta(body.kind);
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
    if (meta.needsDestination) update.category = null;
    else if (update.kind !== undefined) update.transfer_account = null;
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

    const references = await assertOwnedReferences(user.id, [
      { table: "category", id: update.category, label: "Categoría" },
      { table: "bank_account", id: update.bank_account, label: "Cuenta de origen" },
      { table: "bank_account", id: update.transfer_account, label: "Cuenta de destino" },
    ]);
    if (!references.ok) {
      return NextResponse.json(
        { ok: false, error: { message: references.message } },
        { status: references.status || 400 }
      );
    }

    const originId = update.bank_account !== undefined
      ? update.bank_account
      : typeof owner.record.bank_account === "object" && owner.record.bank_account
        ? owner.record.bank_account._id
        : owner.record.bank_account;
    const destinationId = update.transfer_account !== undefined
      ? update.transfer_account
      : typeof owner.record.transfer_account === "object" && owner.record.transfer_account
        ? owner.record.transfer_account._id
        : owner.record.transfer_account;

    const origin = originId ? await assertOwner("bank_account", String(originId), user.id) : null;
    const destination = destinationId ? await assertOwner("bank_account", String(destinationId), user.id) : null;
    if (origin && !origin.ok) {
      return NextResponse.json({ ok: false, error: { message: origin.message } }, { status: origin.status || 400 });
    }
    if (destination && !destination.ok) {
      return NextResponse.json({ ok: false, error: { message: destination.message } }, { status: destination.status || 400 });
    }
    const originCurrency = normalizeCurrency(origin?.record?.currency || body.currency || owner.record.currency || BASE_CURRENCY);
    const destinationCurrency = destination ? normalizeCurrency(destination.record.currency) : originCurrency;
    if (origin && body.currency && normalizeCurrency(body.currency) !== originCurrency) {
      return NextResponse.json(
        { ok: false, error: { message: "La moneda del movimiento debe coincidir con la moneda de la cuenta" } },
        { status: 400 }
      );
    }
    if (meta.needsDestination && originCurrency !== destinationCurrency) {
      return NextResponse.json(
        { ok: false, error: { message: "Las transferencias entre monedas distintas requieren registrar dos movimientos separados" } },
        { status: 400 }
      );
    }
    const currency = normalizeCurrency(body.currency || originCurrency);
    const exchangeRate = exchangeRateToBase(
      currency,
      body.exchange_rate_to_base ?? origin?.record?.exchange_rate_to_base ?? owner.record.exchange_rate_to_base
    );
    if (currency !== BASE_CURRENCY && !exchangeRate) {
      return NextResponse.json(
        { ok: false, error: { message: "Indica la tasa hacia DOP para este movimiento en moneda extranjera" } },
        { status: 400 }
      );
    }
    update.currency = currency;
    update.exchange_rate_to_base = exchangeRate;
    update.amount_base = amountToBase(update.amount ?? owner.record.amount, currency, exchangeRate);

    const tracking = await ensureBalanceTracking(user.id, [originId, destinationId]);
    if (!tracking.ok) {
      return NextResponse.json(
        { ok: false, error: { message: tracking.message } },
        { status: tracking.status || 400 }
      );
    }
    update.balance_effective_at = new Date();

    const res = await totalumSdk.crud.editRecordById("transaction", id, update);
    console.info("[API] movimiento actualizado", { id, fields: Object.keys(update) });
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
