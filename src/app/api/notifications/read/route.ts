import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { assertOwner, getSessionUser, queryAllRecords, serializeError } from "@/lib/finance";

const schema = z.object({ id: z.string().min(1).max(120).optional() }).strict();

/** Marks one notification (id) or every unread notification as read */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;

    if (body.id) {
      const owner = await assertOwner("notification", body.id, user.id);
      if (!owner.ok) {
        return NextResponse.json({ ok: false, error: { message: owner.message } }, { status: owner.status || 403 });
      }
      await totalumSdk.crud.editRecordById("notification", body.id, { is_read: "yes" });
      console.log("[API] alerta marcada como leída:", body.id);
      return NextResponse.json({ ok: true, data: { updated: 1 } });
    }

    const rows = await queryAllRecords("notification", {
      _filter: { user: user.id, is_read: { ne: "yes" } },
    });
    for (const row of rows) {
      await totalumSdk.crud.editRecordById("notification", row._id, { is_read: "yes" });
    }
    console.log("[API] alertas marcadas como leídas:", rows.length);
    return NextResponse.json({ ok: true, data: { updated: rows.length } });
  } catch (err) {
    console.error("[API ERROR] POST /api/notifications/read", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
