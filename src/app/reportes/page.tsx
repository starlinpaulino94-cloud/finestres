"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText, Mail, Sparkles } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { ScoreRing } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/components/CurrencyProvider";
import { api } from "@/lib/api";
import { ensureBootstrap } from "@/lib/ensure-bootstrap";
import type { WeeklyReport } from "@/types/finance";
import { toast } from "sonner";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function lastMonths(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` };
  });
}

/** Renderiza el informe (markdown ligero) que devuelve la IA */
function ReportBody({ content }: { content: string }) {
  const blocks = content.split("\n").filter((l) => l.trim().length > 0);
  return (
    <div className="space-y-2">
      {blocks.map((line, i) => {
        const clean = line.trim();
        if (/^#{1,4}\s/.test(clean)) {
          return (
            <h4 key={i} className="pt-3 font-display text-base">
              {clean.replace(/^#{1,4}\s/, "")}
            </h4>
          );
        }
        if (/^[-*•]\s/.test(clean)) {
          return (
            <p key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <span className="text-primary">·</span>
              <span
                dangerouslySetInnerHTML={{
                  __html: clean.replace(/^[-*•]\s/, "").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"),
                }}
              />
            </p>
          );
        }
        return (
          <p
            key={i}
            className="text-sm leading-relaxed text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: clean.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }}
          />
        );
      })}
    </div>
  );
}

export default function ReportesPage() {
  const { money } = useCurrency();
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [month, setMonth] = useState(lastMonths(1)[0].key);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<WeeklyReport[]>("/api/reports");
    if (res.ok && res.data) setReports(res.data);
    else console.error("[Informes] error:", res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await ensureBootstrap();
      await load();
    })();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    const res = await api.post<{ emailSent: boolean; pdfUrl: string | null }>("/api/reports/weekly", {
      sendEmail,
    });
    setGenerating(false);
    if (!res.ok) {
      console.error("[Informes] error generando:", res.error);
      toast.error("No he podido generar el informe");
      return;
    }
    toast.success(res.data?.emailSent ? "Informe generado y enviado a tu correo" : "Informe generado");
    window.dispatchEvent(new Event("finestres:refresh"));
    await load();
  };

  const exportData = async (format: "pdf" | "excel") => {
    setExporting(format);
    const res = await api.post<{ filename: string; url?: string; content?: string; rows: number }>(
      "/api/reports/export",
      { format, month }
    );
    setExporting(null);
    if (!res.ok || !res.data) {
      console.error("[Informes] error exportando:", res.error);
      toast.error("No he podido generar la exportación");
      return;
    }

    if (format === "pdf" && res.data.url) {
      window.open(res.data.url, "_blank");
      toast.success(`PDF con ${res.data.rows} movimientos listo`);
      return;
    }

    if (format === "excel" && res.data.content) {
      const blob = new Blob([res.data.content], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = res.data.filename;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success(`Excel con ${res.data.rows} movimientos descargado`);
    }
  };

  const latest = reports[0];

  return (
    <AppShell>
      <PageHeader
        eyebrow="informes"
        title="Tu salud financiera, por escrito"
        description="Un informe semanal detallado generado por la IA, con tus estados de cuenta exportables en PDF o Excel."
        action={
          <Button className="rounded-full" onClick={generate} disabled={generating}>
            <Sparkles className="mr-2 h-4 w-4" />
            {generating ? "Generando…" : "Generar informe semanal"}
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          {loading ? (
            <Skeleton className="h-80 rounded-3xl" />
          ) : latest ? (
            <Card className="rise rounded-3xl p-7">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-5">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-primary">Último informe</p>
                  <h2 className="mt-1 font-display text-2xl">{latest.title}</h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Gastado <span className="tabular">{money(latest.total_spent || 0)}</span> · Ingresado{" "}
                    <span className="tabular">{money(latest.total_income || 0)}</span>
                    {latest.sent_by_email === "yes" && " · enviado por email"}
                  </p>
                </div>
                <ScoreRing score={latest.health_score || 0} label="salud" />
              </div>
              <ReportBody content={latest.content || ""} />
              {latest.pdf_file?.url && (
                <Button asChild variant="outline" className="mt-6 rounded-full">
                  <a href={latest.pdf_file.url} target="_blank" rel="noreferrer">
                    <FileText className="mr-2 h-4 w-4" /> Descargar este informe en PDF
                  </a>
                </Button>
              )}
            </Card>
          ) : (
            <Card className="rise rounded-3xl p-7">
              <h2 className="font-display text-xl">Todavía no hay informes</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Pulsa «Generar informe semanal» y analizaré tus últimos 7 días: en qué se te escapa el dinero, cómo van
                tus metas y un plan concreto para la semana que viene.
              </p>
            </Card>
          )}

          {reports.length > 1 && (
            <Card className="rise rounded-3xl p-6">
              <h3 className="mb-4 font-display text-lg">Informes anteriores</h3>
              <ul className="divide-y divide-border">
                {reports.slice(1).map((r) => (
                  <li key={r._id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{r.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Gastado {money(r.total_spent || 0)} · salud {r.health_score || 0}/100
                      </p>
                    </div>
                    {r.pdf_file?.url && (
                      <a
                        href={r.pdf_file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline underline-offset-4"
                      >
                        PDF
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="rise rounded-3xl p-6">
            <h3 className="mb-1 font-display text-lg">Informe semanal automático</h3>
            <p className="mb-5 text-xs text-muted-foreground">
              Lo genero con tus datos reales y te lo envío a tu correo con el PDF adjunto.
            </p>
            <div className="mb-5 flex items-center justify-between rounded-2xl border border-border p-4">
              <Label htmlFor="send-email" className="inline-flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4" /> Enviarlo por email
              </Label>
              <Switch id="send-email" checked={sendEmail} onCheckedChange={setSendEmail} />
            </div>
            <Button className="w-full rounded-full" onClick={generate} disabled={generating}>
              <Sparkles className="mr-2 h-4 w-4" />
              {generating ? "Analizando tu semana…" : "Generar ahora"}
            </Button>
          </Card>

          <Card className="rise rounded-3xl p-6 [animation-delay:80ms]">
            <h3 className="mb-1 font-display text-lg">Exportar estados de cuenta</h3>
            <p className="mb-5 text-xs text-muted-foreground">
              Descarga todos los movimientos de un mes con sus categorías y cuentas.
            </p>
            <Label className="text-xs">Mes</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="mb-4 mt-1.5 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lastMonths(12).map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => exportData("pdf")}
                disabled={exporting !== null}
              >
                <FileText className="mr-2 h-4 w-4" />
                {exporting === "pdf" ? "…" : "PDF"}
              </Button>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => exportData("excel")}
                disabled={exporting !== null}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {exporting === "excel" ? "…" : "Excel"}
              </Button>
            </div>
            <p className="mt-4 inline-flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <Download className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              El PDF se abre en una pestaña nueva; el Excel se descarga en formato CSV compatible con Excel y Google
              Sheets.
            </p>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
