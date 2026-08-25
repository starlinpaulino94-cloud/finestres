import "server-only";
import { formatCurrency } from "@/lib/finance";
import { DEFAULT_CURRENCY } from "@/lib/currency";

const BRAND = {
  ink: "#0d1117",
  mint: "#22c55e",
  soft: "#6b7280",
};

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function markdownishToHtml(text: string): string {
  const lines = escapeHtml(text).split("\n");
  let html = "";
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      continue;
    }
    if (/^#{1,4}\s/.test(line)) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<h3>${line.replace(/^#{1,4}\s/, "")}</h3>`;
      continue;
    }
    if (/^[-*•]\s/.test(line)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${line.replace(/^[-*•]\s/, "").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>`;
      continue;
    }
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    html += `<p>${line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}

const baseStyles = `
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: ${BRAND.ink}; margin: 0; padding: 44px 46px; }
  .brand { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid ${BRAND.ink}; padding-bottom: 14px; }
  .brand h1 { font-size: 26px; letter-spacing: -0.5px; margin: 0; }
  .brand span { color: ${BRAND.soft}; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; }
  h2 { font-size: 18px; margin: 30px 0 10px; }
  h3 { font-size: 14px; margin: 20px 0 6px; }
  p, li { font-size: 12.5px; line-height: 1.65; color: #1f2937; }
  .kpis { display: flex; gap: 12px; margin-top: 22px; }
  .kpi { flex: 1; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; }
  .kpi small { display: block; color: ${BRAND.soft}; font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; }
  .kpi strong { font-size: 19px; display: block; margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: ${BRAND.soft}; border-bottom: 1px solid #e5e7eb; padding: 8px 6px; }
  td { font-size: 12px; padding: 8px 6px; border-bottom: 1px solid #f3f4f6; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .bar { height: 7px; background: #f3f4f6; border-radius: 99px; overflow: hidden; }
  .bar > div { height: 100%; background: ${BRAND.mint}; }
  .footer { margin-top: 34px; border-top: 1px solid #e5e7eb; padding-top: 12px; color: ${BRAND.soft}; font-size: 10.5px; }
`;

export function weeklyReportHtml(params: {
  userName: string;
  periodLabel: string;
  totalSpent: number;
  totalIncome: number;
  healthScore: number;
  categories: { name: string; amount: number; pct: number }[];
  topExpenses: { concept: string; amount: number; date: string; category: string }[];
  content: string;
  /** Moneda en la que vienen los importes (por defecto DOP) */
  currency?: string;
}): string {
  // Todos los importes del informe van en la moneda principal del usuario.
  const fmt = (value: number) => formatCurrency(value, params.currency || DEFAULT_CURRENCY);
  return `<html><head><meta charset="utf-8" /><style>${baseStyles}</style></head><body>
  <div class="brand">
    <h1>Finestres · Informe semanal</h1>
    <span>${escapeHtml(params.periodLabel)}</span>
  </div>
  <p style="margin-top:16px">Hola ${escapeHtml(params.userName)}, este es el análisis de tu semana.</p>
  <div class="kpis">
    <div class="kpi"><small>Gastado</small><strong>${fmt(params.totalSpent)}</strong></div>
    <div class="kpi"><small>Ingresado</small><strong>${fmt(params.totalIncome)}</strong></div>
    <div class="kpi"><small>Balance</small><strong>${fmt(params.totalIncome - params.totalSpent)}</strong></div>
    <div class="kpi"><small>Salud financiera</small><strong>${params.healthScore}/100</strong></div>
  </div>

  <h2>Reparto por categoría</h2>
  <table>
    <thead><tr><th>Categoría</th><th style="width:38%">Peso</th><th class="num">Importe</th></tr></thead>
    <tbody>
      ${params.categories
        .map(
          (c) => `<tr><td>${escapeHtml(c.name)}</td><td><div class="bar"><div style="width:${Math.min(
            c.pct,
            100
          ).toFixed(1)}%"></div></div></td><td class="num">${fmt(c.amount)}</td></tr>`
        )
        .join("")}
    </tbody>
  </table>

  <h2>Mayores gastos de la semana</h2>
  <table>
    <thead><tr><th>Concepto</th><th>Categoría</th><th>Fecha</th><th class="num">Importe</th></tr></thead>
    <tbody>
      ${params.topExpenses
        .map(
          (t) =>
            `<tr><td>${escapeHtml(t.concept)}</td><td>${escapeHtml(t.category)}</td><td>${escapeHtml(
              t.date
            )}</td><td class="num">${fmt(t.amount)}</td></tr>`
        )
        .join("")}
    </tbody>
  </table>

  <h2>Análisis y plan de acción</h2>
  ${markdownishToHtml(params.content)}

  <div class="footer">Informe generado automáticamente por el asistente de Finestres. Todos los importes están en ${params.currency || DEFAULT_CURRENCY}.</div>
  </body></html>`;
}

export function statementHtml(params: {
  userName: string;
  periodLabel: string;
  totalSpent: number;
  totalIncome: number;
  rows: {
    date: string;
    concept: string;
    category: string;
    account: string;
    /** Etiqueta del tipo de movimiento (Gasto, Ingreso, Transferencia…) */
    kind: string;
    /** Signo con el que se muestra el importe: "+", "−" o "=" */
    sign: string;
    amount: number;
  }[];
  /** Moneda en la que vienen los importes (por defecto DOP) */
  currency?: string;
}): string {
  // Todos los importes del informe van en la moneda principal del usuario.
  const fmt = (value: number) => formatCurrency(value, params.currency || DEFAULT_CURRENCY);
  return `<html><head><meta charset="utf-8" /><style>${baseStyles}</style></head><body>
  <div class="brand">
    <h1>Finestres · Estado de cuenta</h1>
    <span>${escapeHtml(params.periodLabel)}</span>
  </div>
  <div class="kpis">
    <div class="kpi"><small>Titular</small><strong style="font-size:14px">${escapeHtml(params.userName)}</strong></div>
    <div class="kpi"><small>Gastos</small><strong>${fmt(params.totalSpent)}</strong></div>
    <div class="kpi"><small>Ingresos</small><strong>${fmt(params.totalIncome)}</strong></div>
    <div class="kpi"><small>Balance</small><strong>${fmt(params.totalIncome - params.totalSpent)}</strong></div>
  </div>
  <h2>Movimientos (${params.rows.length})</h2>
  <table>
    <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Cuenta</th><th>Tipo</th><th class="num">Importe</th></tr></thead>
    <tbody>
      ${params.rows
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.concept)}</td><td>${escapeHtml(
              r.category
            )}</td><td>${escapeHtml(r.account)}</td><td>${escapeHtml(r.kind)}</td><td class="num">${
              r.sign
            }${fmt(r.amount)}</td></tr>`
        )
        .join("")}
    </tbody>
  </table>
  <div class="footer">Documento generado por Finestres el ${new Date().toLocaleString("es-ES")}.</div>
  </body></html>`;
}

export function weeklyEmailHtml(params: {
  userName: string;
  periodLabel: string;
  totalSpent: number;
  totalIncome: number;
  healthScore: number;
  content: string;
  pdfUrl?: string | null;
  /** Moneda en la que vienen los importes (por defecto DOP) */
  currency?: string;
}): string {
  // Todos los importes del informe van en la moneda principal del usuario.
  const fmt = (value: number) => formatCurrency(value, params.currency || DEFAULT_CURRENCY);
  return `<div style="font-family:Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;color:#0d1117">
    <div style="background:#0d1117;color:#fff;padding:26px 28px;border-radius:16px 16px 0 0">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:.65">Finestres · informe semanal</div>
      <h1 style="margin:8px 0 0;font-size:22px">Hola ${escapeHtml(params.userName)}, aquí tienes tu semana</h1>
      <div style="opacity:.7;font-size:13px;margin-top:6px">${escapeHtml(params.periodLabel)}</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:24px 28px">
      <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
        <tr>
          <td style="font-size:12px;color:#6b7280">Gastado<br><strong style="font-size:18px;color:#0d1117">${fmt(
            params.totalSpent
          )}</strong></td>
          <td style="font-size:12px;color:#6b7280">Ingresado<br><strong style="font-size:18px;color:#0d1117">${fmt(
            params.totalIncome
          )}</strong></td>
          <td style="font-size:12px;color:#6b7280">Salud financiera<br><strong style="font-size:18px;color:#16a34a">${
            params.healthScore
          }/100</strong></td>
        </tr>
      </table>
      ${markdownishToHtml(params.content)}
      ${
        params.pdfUrl
          ? `<p style="margin-top:22px"><a href="${params.pdfUrl}" style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:99px;font-size:13px;font-weight:600">Descargar el informe en PDF</a></p>`
          : ""
      }
    </div>
  </div>`;
}
