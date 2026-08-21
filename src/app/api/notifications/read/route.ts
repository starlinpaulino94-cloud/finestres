import { NextResponse } from "next/server";
import { totalumSdk } from "@/lib/totalum";
import { getSessionUser, serializeError } from "@/lib/finance";

/** Marks one notification (id) or every unread notification as read */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { id?: string };

    if (body.id) {
      await totalumSdk.crud.editRecordById("notification", body.id, { is_read: "yes" });
      console.log("[API] alerta marcada como leída:", body.id);
      return NextResponse.json({ ok: true, data: { updated: 1 } });
    }

    const pending = await totalumSdk.crud.query("notification", {
      _filter: { user: user.id, is_read: { ne: "yes" } },
      _limit: 100,
    });
    const rows = (pending.data as any[]) || [];
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
