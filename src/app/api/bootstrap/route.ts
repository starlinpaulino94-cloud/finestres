import { NextResponse } from "next/server";
import { bootstrapUserData, getSessionUser, serializeError } from "@/lib/finance";

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const result = await bootstrapUserData(user.id);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error("[API ERROR] /api/bootstrap", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
