import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import { getSessionUser, monthKey, monthLabel, queryAllRecords, serializeError } from "@/lib/finance";
import { computeTotals, kindMeta } from "@/lib/finance-core";
import { BASE_CURRENCY, amountToBase, normalizeCurrency } from "@/lib/currency";
import { statementHtml } from "@/lib/report-html";

const schema = z.object({
  format: z.enum(["pdf", "excel"]),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
}).strict();

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  // Evita que Excel interprete datos controlados por el usuario como fórmulas.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

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

    const transactionRows = await queryAllRecords("transaction", {
      _filter: { user: user.id, spent_at: { gte: start.toISOString(), lte: end.toISOString() } },
      _sort: { spent_at: "desc" },
      category: true,
      bank_account: true,
    });

    const rows = transactionRows.map((t) => {
      const account = typeof t.bank_account === "object" && t.bank_account ? t.bank_account : null;
      const currency = normalizeCurrency(t.currency || account?.currency || BASE_CURRENCY);
      const amountBase = t.amount_base ?? amountToBase(t.amount || 0, currency, t.exchange_rate_to_base ?? account?.exchange_rate_to_base);
      return {
      date: new Date(t.spent_at).toLocaleDateString("es-ES"),
      concept: t.concept || "",
      category: (typeof t.category === "object" && t.category ? t.category.name : null) || "Sin categoría",
      account: account?.name || "—",
      kind: kindMeta(t.kind).label,
      sign: kindMeta(t.kind).sign,
      rawKind: t.kind || "gasto",
      amount: t.amount || 0,
      amountBase,
      currency,
      source: t.source || "manual",
    };
    });

    // Los movimientos internos aparecen en el listado pero no en los totales
    const totals = computeTotals(rows.map((r) => ({ amount: r.amountBase, kind: r.rawKind })));
    const totalSpent = totals.expense;
    const totalIncome = totals.income;
    const periodLabel = monthLabel(month);

    if (parsed.data.format === "excel") {
      const header = ["Fecha", "Concepto", "Categoría", "Cuenta", "Tipo", "Origen", "Importe", "Moneda", "Importe DOP"];
      const csvRows = rows.map((r) => [
          r.date,
          r.concept,
          r.category,
          r.account,
          r.kind,
          r.source,
          r.amount.toFixed(2).replace(".", ","),
          r.currency,
          r.amountBase.toFixed(2).replace(".", ","),
        ].map(csvCell).join(";"));
      const summary = [
        "",
        ["Total gastos", "", "", "", "", "", "", BASE_CURRENCY, totalSpent.toFixed(2).replace(".", ",")].map(csvCell).join(";"),
        ["Total ingresos", "", "", "", "", "", "", BASE_CURRENCY, totalIncome.toFixed(2).replace(".", ",")].map(csvCell).join(";"),
        ["Balance", "", "", "", "", "", "", BASE_CURRENCY, (totalIncome - totalSpent).toFixed(2).replace(".", ",")].map(csvCell).join(";"),
      ];
      // BOM so Excel opens the accents correctly
      const csv = "﻿" + [header.map(csvCell).join(";"), ...csvRows, ...summary].join("\r\n");

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
