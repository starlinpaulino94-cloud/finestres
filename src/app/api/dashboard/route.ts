import { NextResponse } from "next/server";
import {
  buildDashboard,
  getSessionUser,
  refreshBudgetAlerts,
  serializeError,
} from "@/lib/finance";
import { totalumSdk } from "@/lib/totalum";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const data = await buildDashboard(user.id);
    // Smart alerts: create notifications when budgets approach their limit
    await refreshBudgetAlerts(user.id, data.budgets);
    const notificationsResponse = await totalumSdk.crud.query("notification", {
      _filter: { user: user.id },
      _sort: { createdAt: "desc" },
      _limit: 20,
    });
    const notifications = (notificationsResponse.data as any[]) || [];
    data.notifications = notifications;
    data.unreadCount = notifications.filter((notification) => notification.is_read !== "yes").length;

    console.info("[API] /api/dashboard ok", {
      budgets: data.budgets.length,
      alerts: data.unreadCount,
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[API ERROR] /api/dashboard", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
