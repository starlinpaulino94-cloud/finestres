import { NextResponse } from "next/server";
import {
  buildDashboard,
  getSessionUser,
  refreshBudgetAlerts,
  serializeError,
} from "@/lib/finance";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const data = await buildDashboard(user.id);
    // Smart alerts: create notifications when budgets approach their limit
    await refreshBudgetAlerts(user.id, data.budgets, data.currency);
    const fresh = await buildDashboard(user.id);

    console.log("[API] /api/dashboard ok", {
      user: user.id,
      gasto: fresh.expense,
      presupuestos: fresh.budgets.length,
      alertas: fresh.unreadCount,
    });
    return NextResponse.json({ ok: true, data: fresh });
  } catch (err) {
    console.error("[API ERROR] /api/dashboard", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
