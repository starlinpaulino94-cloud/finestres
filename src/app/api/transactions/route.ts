import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { getSessionUser, serializeError } from "@/lib/finance";

const schema = z.object({
  concept: z.string().min(1),
  amount: z.number().positive(),
  kind: z.enum(["gasto", "ingreso"]),
  spent_at: z.string().optional(),
  category: z.string().optional(),
  bank_account: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    const categoryId = url.searchParams.get("category");
    const search = url.searchParams.get("q");

    const filter: any = { user: user.id };
    if (kind === "gasto" || kind === "ingreso") filter.kind = kind;
    if (categoryId) filter.category = categoryId;
    if (search) filter.concept = { regex: search, options: "i" };

    const res = await totalumSdk.crud.query("transaction", {
      _filter: filter,
      _sort: { spent_at: "desc" },
      _limit: 300,
      category: true,
      bank_account: true,
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
    const res = await totalumSdk.crud.createRecord("transaction", {
      concept: data.concept,
      amount: data.amount,
      kind: data.kind,
      spent_at: data.spent_at ? new Date(data.spent_at) : new Date(),
      source: "manual",
      auto_categorized: "no",
      notes: data.notes,
      ...(data.category ? { category: data.category } : {}),
      ...(data.bank_account ? { bank_account: data.bank_account } : {}),
      user: user.id,
    });
    console.log("[API] movimiento creado:", (res.data as any)?._id, data.concept, data.amount);
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] POST /api/transactions", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
