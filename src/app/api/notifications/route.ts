import { NextResponse } from "next/server";
import { totalumSdk } from "@/lib/totalum";
import { getSessionUser, serializeError } from "@/lib/finance";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const res = await totalumSdk.crud.query("notification", {
      _filter: { user: user.id },
      _sort: { createdAt: "desc" },
      _limit: 60,
    });
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] GET /api/notifications", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
