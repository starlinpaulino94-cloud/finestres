import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { assertOwnedReferences, assertOwner, ensureBalanceTracking, enrichTransactionCurrency, getSessionUser, serializeError } from "@/lib/finance";
import { kindMeta, round2 } from "@/lib/finance-core";
import { BASE_CURRENCY, amountToBase, exchangeRateToBase, normalizeCurrency } from "@/lib/currency";

const schema = z.object({
  concept: z.string().trim().min(1).max(180),
  amount: z.number().finite().positive().max(1_000_000_000),
  kind: z.enum(["gasto", "ingreso", "transferencia", "pago_tarjeta", "ajuste"]),
  spent_at: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Fecha no válida").optional(),
  category: z.string().min(1).max(120).optional(),
  bank_account: z.string().min(1).max(120).optional(),
  /** Cuenta destino: obligatoria en transferencias y pagos de tarjeta */
  transfer_account: z.string().min(1).max(120).optional(),
  currency: z.enum(["DOP", "USD", "EUR", "GBP", "CAD"]).optional(),
  exchange_rate_to_base: z.number().finite().positive().max(1_000_000).optional(),
  notes: z.string().trim().max(1200).optional(),
}).strict();

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    const categoryId = url.searchParams.get("category");
    const accountId = url.searchParams.get("account");
    const search = url.searchParams.get("q");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 300, 1000);

    const filter: any = { user: user.id };
    if (kind && kindMeta(kind).value === kind) filter.kind = kind;
    if (categoryId) filter.category = categoryId;
    if (accountId) filter.bank_account = accountId;
    if (search) filter.concept = { regex: search, options: "i" };

    const res = await totalumSdk.crud.query("transaction", {
      _filter: filter,
      _sort: { spent_at: "desc" },
      _limit: limit,
      category: true,
      bank_account: true,
      transfer_account: true,
    });
    return NextResponse.json({ ok: true, data: ((res.data as any[]) || []).map(enrichTransactionCurrency) });
  } catch (err) {
    console.error("[API ERROR] GET /api/transactions", err);
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
    const meta = kindMeta(data.kind);

    // Integridad: un movimiento entre cuentas propias necesita origen y destino distintos
    if (meta.needsDestination) {
      if (!data.bank_account || !data.transfer_account) {
        return NextResponse.json(
          {
            ok: false,
            error: { message: `Este movimiento (${meta.label.toLowerCase()}) necesita cuenta de origen y cuenta de destino` },
          },
          { status: 400 }
        );
      }
      if (data.bank_account === data.transfer_account) {
        return NextResponse.json(
          { ok: false, error: { message: "La cuenta de origen y la de destino no pueden ser la misma" } },
          { status: 400 }
        );
      }
    }

    const references = await assertOwnedReferences(user.id, [
      { table: "category", id: data.category, label: "Categoría" },
      { table: "bank_account", id: data.bank_account, label: "Cuenta de origen" },
      { table: "bank_account", id: data.transfer_account, label: "Cuenta de destino" },
    ]);
    if (!references.ok) {
      return NextResponse.json(
        { ok: false, error: { message: references.message } },
        { status: references.status || 400 }
      );
    }

    const origin = data.bank_account ? await assertOwner("bank_account", data.bank_account, user.id) : null;
    const destination = data.transfer_account ? await assertOwner("bank_account", data.transfer_account, user.id) : null;
    if (origin && !origin.ok) {
      return NextResponse.json({ ok: false, error: { message: origin.message } }, { status: origin.status || 400 });
    }
    if (destination && !destination.ok) {
      return NextResponse.json({ ok: false, error: { message: destination.message } }, { status: destination.status || 400 });
    }
    const originCurrency = normalizeCurrency(origin?.record?.currency || data.currency || BASE_CURRENCY);
    const destinationCurrency = destination ? normalizeCurrency(destination.record.currency) : originCurrency;
    if (origin && data.currency && normalizeCurrency(data.currency) !== originCurrency) {
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
    const currency = originCurrency;
    const exchangeRate = exchangeRateToBase(
      currency,
      data.exchange_rate_to_base || origin?.record?.exchange_rate_to_base
    );
    if (currency !== BASE_CURRENCY && !exchangeRate) {
      return NextResponse.json(
        { ok: false, error: { message: "Indica la tasa hacia DOP para este movimiento en moneda extranjera" } },
        { status: 400 }
      );
    }

    const tracking = await ensureBalanceTracking(user.id, [data.bank_account, data.transfer_account]);
    if (!tracking.ok) {
      return NextResponse.json(
        { ok: false, error: { message: tracking.message } },
        { status: tracking.status || 400 }
      );
    }

    const res = await totalumSdk.crud.createRecord("transaction", {
      concept: data.concept,
      amount: round2(data.amount),
      amount_base: amountToBase(data.amount, currency, exchangeRate),
      currency,
      exchange_rate_to_base: exchangeRate,
      kind: data.kind,
      spent_at: data.spent_at ? new Date(data.spent_at) : new Date(),
      source: "manual",
      auto_categorized: "no",
      balance_effective_at: new Date(),
      notes: data.notes,
      // Los movimientos internos no llevan categoría de gasto
      ...(data.category && !meta.needsDestination ? { category: data.category } : {}),
      ...(data.bank_account ? { bank_account: data.bank_account } : {}),
      ...(meta.needsDestination && data.transfer_account ? { transfer_account: data.transfer_account } : {}),
      user: user.id,
    });
    console.info("[API] movimiento creado", { id: (res.data as any)?._id, kind: data.kind });
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] POST /api/transactions", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
