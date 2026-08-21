import { NextResponse } from "next/server";
import { totalumSdk } from "@/lib/totalum";
import { assertOwner, getSessionUser, serializeError } from "@/lib/finance";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const { id } = await params;
    const owner = await assertOwner("outing_plan", id, user.id);
    if (!owner.ok) {
      return NextResponse.json({ ok: false, error: { message: owner.message } }, { status: owner.status || 403 });
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;

    const update: Record<string, any> = {};
    if (body.status !== undefined) update.status = body.status;
    if (body.real_cost !== undefined) update.real_cost = Number(body.real_cost);
    if (body.estimated_cost !== undefined) update.estimated_cost = Number(body.estimated_cost);
    if (body.planned_at !== undefined) update.planned_at = new Date(body.planned_at);
    if (body.title !== undefined) update.title = body.title;

    const res = await totalumSdk.crud.editRecordById("outing_plan", id, update);
    console.log("[API] salida actualizada:", id, update);
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
