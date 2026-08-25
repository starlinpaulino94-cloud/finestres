import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { assertOwner, getSessionUser, serializeError } from "@/lib/finance";
import { round2 } from "@/lib/finance-core";

const schema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  target_amount: z.number().finite().positive().max(1_000_000_000).optional(),
  saved_amount: z.number().finite().min(0).max(1_000_000_000).optional(),
  monthly_contribution: z.number().finite().min(0).max(1_000_000_000).optional(),
  status: z.enum(["activa", "pausada", "completada"]).optional(),
  notes: z.string().trim().max(1200).nullable().optional(),
  deadline: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Fecha no válida").nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "No hay cambios que aplicar");

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const { id } = await params;
    const owner = await assertOwner("savings_goal", id, user.id);
    if (!owner.ok) {
      return NextResponse.json({ ok: false, error: { message: owner.message } }, { status: owner.status || 403 });
    }
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;

    const update: Record<string, any> = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.target_amount !== undefined) update.target_amount = round2(body.target_amount);
    if (body.saved_amount !== undefined) update.saved_amount = round2(body.saved_amount);
    if (body.monthly_contribution !== undefined) update.monthly_contribution = round2(body.monthly_contribution);
    if (body.status !== undefined) update.status = body.status;
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.deadline !== undefined) update.deadline = body.deadline === null ? null : new Date(body.deadline);

    const res = await totalumSdk.crud.editRecordById("savings_goal", id, update);
    console.info("[API] meta actualizada", { id, fields: Object.keys(update) });
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
    const owner = await assertOwner("savings_goal", id, user.id);
    if (!owner.ok) {
      return NextResponse.json({ ok: false, error: { message: owner.message } }, { status: owner.status || 403 });
    }
    await totalumSdk.crud.deleteRecordById("savings_goal", id);
    console.log("[API] meta eliminada:", id);
    return NextResponse.json({ ok: true, data: { _id: id } });
  } catch (err) {
    console.error("[API ERROR] DELETE /api/goals/[id]", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
