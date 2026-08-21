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
    if (body.title !== undefined) update.title = body.title;
    if (body.target_amount !== undefined) update.target_amount = Number(body.target_amount);
    if (body.saved_amount !== undefined) update.saved_amount = Number(body.saved_amount);
    if (body.monthly_contribution !== undefined) update.monthly_contribution = Number(body.monthly_contribution);
    if (body.status !== undefined) update.status = body.status;
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.deadline !== undefined) update.deadline = new Date(body.deadline);

    const res = await totalumSdk.crud.editRecordById("savings_goal", id, update);
    console.log("[API] meta actualizada:", id, update);
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] PUT /api/goals/[id]", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const { id } = await params;
    await totalumSdk.crud.deleteRecordById("savings_goal", id);
    console.log("[API] meta eliminada:", id);
    return NextResponse.json({ ok: true, data: { _id: id } });
  } catch (err) {
    console.error("[API ERROR] DELETE /api/goals/[id]", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
