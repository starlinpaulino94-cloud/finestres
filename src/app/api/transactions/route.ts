import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { getSessionUser, serializeError } from "@/lib/finance";
import { kindMeta, round2 } from "@/lib/finance-core";

const schema = z.object({
  concept: z.string().min(1),
  amount: z.number().positive(),
  kind: z.enum(["gasto", "ingreso", "transferencia", "pago_tarjeta", "ajuste"]),
  spent_at: z.string().optional(),
  category: z.string().optional(),
  bank_account: z.string().optional(),
  /** Cuenta destino: obligatoria en transferencias y pagos de tarjeta */
  transfer_account: z.string().optional(),
  notes: z.string().optional(),
});

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
    return NextResponse.json({ ok: true, data: res.data });
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

    const res = await totalumSdk.crud.createRecord("transaction", {
      concept: data.concept,
      amount: round2(data.amount),
      kind: data.kind,
      spent_at: data.spent_at ? new Date(data.spent_at) : new Date(),
      source: "manual",
      auto_categorized: "no",
      notes: data.notes,
      // Los movimientos internos no llevan categoría de gasto
      ...(data.category && !meta.needsDestination ? { category: data.category } : {}),
      ...(data.bank_account ? { bank_account: data.bank_account } : {}),
      ...(meta.needsDestination && data.transfer_account ? { transfer_account: data.transfer_account } : {}),
      user: user.id,
    });
    console.log("[API] movimiento creado:", (res.data as any)?._id, data.kind, data.concept, round2(data.amount));
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] POST /api/transactions", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
