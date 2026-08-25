import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { assertOwner, getSessionUser, serializeError } from "@/lib/finance";

const schema = z.object({
  status: z.enum(["planificada", "realizada", "cancelada"]).optional(),
  real_cost: z.number().finite().min(0).max(1_000_000_000).optional(),
  estimated_cost: z.number().finite().min(0).max(1_000_000_000).optional(),
  planned_at: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Fecha no válida").optional(),
  title: z.string().trim().min(1).max(180).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "No hay cambios que aplicar");

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const { id } = await params;
    const owner = await assertOwner("outing_plan", id, user.id);
    if (!owner.ok) {
      return NextResponse.json({ ok: false, error: { message: owner.message } }, { status: owner.status || 403 });
    }
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;

    const update: Record<string, any> = {};
    if (body.status !== undefined) update.status = body.status;
    if (body.real_cost !== undefined) update.real_cost = Number(body.real_cost);
    if (body.estimated_cost !== undefined) update.estimated_cost = Number(body.estimated_cost);
    if (body.planned_at !== undefined) update.planned_at = new Date(body.planned_at);
    if (body.title !== undefined) update.title = body.title;

    const res = await totalumSdk.crud.editRecordById("outing_plan", id, update);
    console.info("[API] salida actualizada", { id, fields: Object.keys(update) });
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] PUT /api/outings/[id]", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const { id } = await params;
    const owner = await assertOwner("outing_plan", id, user.id);
    if (!owner.ok) {
      return NextResponse.json({ ok: false, error: { message: owner.message } }, { status: owner.status || 403 });
    }
    await totalumSdk.crud.deleteRecordById("outing_plan", id);
    console.log("[API] salida eliminada:", id);
    return NextResponse.json({ ok: true, data: { _id: id } });
  } catch (err) {
    console.error("[API ERROR] DELETE /api/outings/[id]", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
