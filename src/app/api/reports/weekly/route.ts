import { NextResponse } from "next/server";
import { totalumSdk } from "@/lib/totalum";
import {
  askAi,
  buildDashboard,
  formatCurrency,
  getSessionUser,
  queryAllRecords,
  serializeError,
} from "@/lib/finance";
import { computeTotals, isExpense } from "@/lib/finance-core";
import { weeklyEmailHtml, weeklyReportHtml } from "@/lib/report-html";

/** Generates the detailed weekly report (AI + PDF) and optionally emails it */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { sendEmail?: boolean };

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 7);

    const [all, dashboard] = await Promise.all([
      queryAllRecords("transaction", {
        _filter: { user: user.id, spent_at: { gte: prevStart.toISOString() } },
        _sort: { spent_at: "desc" },
        category: true,
      }),
      buildDashboard(user.id),
    ]);

    const week = all.filter((t) => new Date(t.spent_at) >= start);
    const prevWeek = all.filter((t) => new Date(t.spent_at) < start);

    // Transferencias, pagos de tarjeta y ajustes NO son gasto ni ingreso
    const weekTotals = computeTotals(week);
    const totalSpent = weekTotals.expense;
    const totalIncome = weekTotals.income;
    const prevSpent = computeTotals(prevWeek).expense;

    const catMap = new Map<string, number>();
    for (const t of week) {
      if (!isExpense(t.kind)) continue;
      const name = (typeof t.category === "object" && t.category ? t.category.name : null) || "Sin categoría";
      catMap.set(name, (catMap.get(name) || 0) + (t.amount || 0));
    }
    const categories = [...catMap.entries()]
      .map(([name, amount]) => ({ name, amount, pct: totalSpent > 0 ? (amount / totalSpent) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);

    const topExpenses = week
      .filter((t) => isExpense(t.kind))
      .sort((a, b) => (b.amount || 0) - (a.amount || 0))
      .slice(0, 8)
      .map((t) => ({
        concept: t.concept,
        amount: t.amount || 0,
        date: new Date(t.spent_at).toLocaleDateString("es-ES"),
        category: (typeof t.category === "object" && t.category ? t.category.name : null) || "Sin categoría",
      }));

    const periodLabel = `${start.toLocaleDateString("es-ES")} — ${end.toLocaleDateString("es-ES")}`;

    const prompt = `Semana analizada: ${periodLabel}
- Total gastado: ${formatCurrency(totalSpent)} (semana anterior: ${formatCurrency(prevSpent)})
- Total ingresado: ${formatCurrency(totalIncome)}
- Reparto por categoría: ${categories.map((c) => `${c.name} ${formatCurrency(c.amount)} (${c.pct.toFixed(0)}%)`).join("; ") || "sin gastos"}
- Mayores gastos: ${topExpenses.map((t) => `${t.concept} ${formatCurrency(t.amount)}`).join("; ") || "ninguno"}
- Presupuesto mensual: ${formatCurrency(dashboard.budgetTotal)}, gastado ${formatCurrency(dashboard.budgetSpent)}
- Presupuestos al límite: ${dashboard.budgets.filter((b) => b.pct >= 80).map((b) => `${b.category?.name} ${b.pct.toFixed(0)}%`).join("; ") || "ninguno"}
- Disponible para gastar (calculado por la app, no lo recalcules): ${formatCurrency(dashboard.safeToSpend.available)} ${dashboard.safeToSpend.horizonLabel}
- Límite diario recomendado: ${formatCurrency(dashboard.safeToSpend.dailyLimit)}
- Patrimonio neto: ${formatCurrency(dashboard.netWorth.netWorth)} (activos ${formatCurrency(dashboard.netWorth.assets)}, deudas ${formatCurrency(dashboard.netWorth.liabilities)})
- Salud financiera ${dashboard.healthScore}/100: ${dashboard.healthComponents.map((c) => `${c.label} ${c.points}/${c.max}`).join(", ")}
- Metas de ahorro: ${dashboard.goals.map((g) => `${g.title}: ${formatCurrency(g.saved_amount || 0)} de ${formatCurrency(g.target_amount)}`).join("; ") || "ninguna"}
- Salidas planificadas: ${dashboard.outings.filter((o) => o.status === "planificada").map((o) => `${o.title} (estimado ${formatCurrency(o.estimated_cost || 0)}, máximo ${formatCurrency(o.max_recommended || 0)})`).join("; ") || "ninguna"}

Escribe un informe semanal en español con este formato exacto:
## Resumen de la semana
(2-3 frases con la comparación respecto a la semana anterior)
## Dónde se te escapa el dinero
(2-4 bullets concretos con cifras)
## Tus metas de ahorro
(1-2 bullets sobre el progreso y si va en camino)
## Plan para la próxima semana
(3 bullets accionables, cada uno con una cifra objetivo en euros)
## Máximo recomendado para tus salidas
(1-2 frases con cifras concretas)`;

    const content = await askAi(
      "Eres un asesor financiero personal español. Escribes informes claros, honestos y muy accionables, siempre con cifras concretas en euros. No inventas datos que no estén en el contexto.",
      prompt,
      { maxTokens: 1100, temperature: 0.5 }
    );

    // PDF generation
    let pdfFileName: string | null = null;
    let pdfUrl: string | null = null;
    try {
      const html = weeklyReportHtml({
        userName: user.name,
        periodLabel,
        totalSpent,
        totalIncome,
        healthScore: dashboard.healthScore,
        categories,
        topExpenses,
        content,
      });
      const pdf = await totalumSdk.files.createPdfFromHtml({
        html,
        name: `informe-semanal-${start.toISOString().slice(0, 10)}.pdf`,
      });
      pdfFileName = (pdf.data as any)?.fileName || null;
      pdfUrl = (pdf.data as any)?.url || null;
    } catch (pdfErr) {
      console.error("[API] /api/reports/weekly PDF no generado:", pdfErr);
    }

    const reportRes = await totalumSdk.crud.createRecord("weekly_report", {
      title: `Informe semanal ${periodLabel}`,
      period_start: start,
      period_end: end,
      total_spent: totalSpent,
      total_income: totalIncome,
      health_score: dashboard.healthScore,
      content,
      sent_by_email: "no",
      ...(pdfFileName ? { pdf_file: { name: pdfFileName } } : {}),
      user: user.id,
    });
    const reportId = (reportRes.data as any)?._id;

    let emailSent = false;
    if (body.sendEmail !== false) {
      try {
        await totalumSdk.email.sendEmail({
          to: [user.email],
          subject: `Tu informe financiero semanal (${periodLabel})`,
          html: weeklyEmailHtml({
            userName: user.name,
            periodLabel,
            totalSpent,
            totalIncome,
            healthScore: dashboard.healthScore,
            content,
            pdfUrl,
          }),
        });
        emailSent = true;
        await totalumSdk.crud.editRecordById("weekly_report", reportId, { sent_by_email: "yes" });
      } catch (emailErr) {
        console.error("[API] /api/reports/weekly email no enviado:", emailErr);
      }
    }

    await totalumSdk.crud.createRecord("notification", {
      title: "Informe semanal listo",
      message: `Tu informe del ${periodLabel} está disponible. Gastaste ${formatCurrency(
        totalSpent
      )} (${prevSpent > 0 ? `${totalSpent >= prevSpent ? "+" : "−"}${Math.abs(((totalSpent - prevSpent) / prevSpent) * 100).toFixed(0)} % vs. semana anterior` : "primera semana registrada"}).${
        emailSent ? ` Te lo he enviado a ${user.email}.` : ""
      }`,
      severity: "info",
      is_read: "no",
      user: user.id,
    });

    console.info("[API] informe semanal generado", { reportId, emailSent, pdf: Boolean(pdfFileName) });

    return NextResponse.json({
      ok: true,
      data: {
        report: reportRes.data,
        content,
        pdfUrl,
        emailSent,
        totalSpent,
        totalIncome,
        healthScore: dashboard.healthScore,
      },
    });
  } catch (err) {
    console.error("[API ERROR] POST /api/reports/weekly", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
