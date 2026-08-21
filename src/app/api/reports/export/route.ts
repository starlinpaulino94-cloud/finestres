import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { getSessionUser, monthKey, monthLabel, serializeError } from "@/lib/finance";
import { computeTotals, kindMeta } from "@/lib/finance-core";
import { statementHtml } from "@/lib/report-html";

const schema = z.object({
  format: z.enum(["pdf", "excel"]),
  month: z.string().optional(),
});

/** Exports the movements of a month as a PDF statement or an Excel (CSV) file */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const month = parsed.data.month || monthKey(new Date());
    const [year, m] = month.split("-").map(Number);
    const start = new Date(year, m - 1, 1, 0, 0, 0);
    const end = new Date(year, m, 0, 23, 59, 59);

    const txRes = await totalumSdk.crud.query("transaction", {
      _filter: { user: user.id, spent_at: { gte: start.toISOString(), lte: end.toISOString() } },
      _sort: { spent_at: "desc" },
      _limit: 1000,
      category: true,
      bank_account: true,
    });

    const rows = ((txRes.data as any[]) || []).map((t) => ({
      date: new Date(t.spent_at).toLocaleDateString("es-ES"),
      concept: t.concept || "",
      category: (typeof t.category === "object" && t.category ? t.category.name : null) || "Sin categoría",
      account: (typeof t.bank_account === "object" && t.bank_account ? t.bank_account.name : null) || "—",
      kind: kindMeta(t.kind).label,
      sign: kindMeta(t.kind).sign,
      rawKind: t.kind || "gasto",
      amount: t.amount || 0,
      source: t.source || "manual",
    }));

    // Los movimientos internos aparecen en el listado pero no en los totales
    const totals = computeTotals(rows.map((r) => ({ amount: r.amount, kind: r.rawKind })));
    const totalSpent = totals.expense;
    const totalIncome = totals.income;
    const periodLabel = monthLabel(month);

    if (parsed.data.format === "excel") {
      const header = ["Fecha", "Concepto", "Categoría", "Cuenta", "Tipo", "Origen", "Importe (€)"];
      const csvRows = rows.map((r) =>
        [
          r.date,
          r.concept.replace(/;/g, ","),
          r.category.replace(/;/g, ","),
          r.account.replace(/;/g, ","),
          r.kind,
          r.source,
          r.amount.toFixed(2).replace(".", ","),
        ].join(";")
      );
      const summary = [
        "",
        `Total gastos;;;;;;${totalSpent.toFixed(2).replace(".", ",")}`,
        `Total ingresos;;;;;;${totalIncome.toFixed(2).replace(".", ",")}`,
        `Balance;;;;;;${(totalIncome - totalSpent).toFixed(2).replace(".", ",")}`,
      ];
      // BOM so Excel opens the accents correctly
      const csv = "﻿" + [header.join(";"), ...csvRows, ...summary].join("\r\n");

      console.log("[API] export excel:", month, rows.length, "movimientos");
      return NextResponse.json({
        ok: true,
        data: {
          format: "excel",
          filename: `fintra-movimientos-${month}.csv`,
          content: csv,
          rows: rows.length,
        },
      });
    }

    const pdf = await totalumSdk.files.createPdfFromHtml({
      html: statementHtml({
        userName: user.name,
        periodLabel,
        totalSpent,
        totalIncome,
        rows,
      }),
      name: `fintra-estado-cuenta-${month}.pdf`,
    });

    console.log("[API] export pdf:", month, rows.length, "movimientos");
    return NextResponse.json({
      ok: true,
      data: {
        format: "pdf",
        filename: `fintra-estado-cuenta-${month}.pdf`,
        url: (pdf.data as any)?.url || null,
        rows: rows.length,
      },
    });
  } catch (err) {
    console.error("[API ERROR] POST /api/reports/export", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
