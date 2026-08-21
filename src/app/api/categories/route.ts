import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { getSessionUser, serializeError } from "@/lib/finance";

const schema = z.object({
  name: z.string().min(1),
  kind: z.enum(["gasto", "ingreso"]),
  color: z.string().optional(),
  emoji: z.string().optional(),
});

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const res = await totalumSdk.crud.query("category", {
      _filter: { user: user.id },
      _sort: { name: "asc" },
      _limit: 200,
    });
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] GET /api/categories", err);
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

    const res = await totalumSdk.crud.createRecord("category", {
      ...parsed.data,
      color: parsed.data.color || "#4ade80",
      emoji: parsed.data.emoji || (parsed.data.kind === "ingreso" ? "💰" : "💸"),
      user: user.id,
    });
    console.log("[API] categoría creada:", (res.data as any)?._id);
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] POST /api/categories", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
