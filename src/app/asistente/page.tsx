"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Send, Sparkles, Square, Loader2, Wand2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { ensureBootstrap } from "@/lib/ensure-bootstrap";
import type { VoiceNote } from "@/types/finance";
import { toast } from "sonner";

interface VoiceResult {
  transcription: string;
  summary: string;
  advice: string;
  transactions: any[];
  budgets: any[];
  goals: any[];
  outings: any[];
  dailySafeSpend: number;
}

const EXAMPLES = [
  "Hoy gasté 12 € en el súper y 4,50 en un café. Mi presupuesto de restaurantes es de 200 € al mes.",
  "Quiero ahorrar 3.000 € para un viaje a Japón en 12 meses.",
  "El sábado salgo a cenar con amigos, ¿cuánto puedo gastar como máximo?",
];

function money(v: number) {
  return `${(v || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export default function AsistentePage() {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState("");
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [notes, setNotes] = useState<VoiceNote[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadNotes = useCallback(async () => {
    const res = await api.get<VoiceNote[]>("/api/voice");
    if (res.ok && res.data) setNotes(res.data);
    else if (!res.ok) console.error("[Asistente] error cargando notas:", res.error);
  }, []);

  useEffect(() => {
    (async () => {
      await ensureBootstrap();
      await loadNotes();
    })();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadNotes]);

  const send = useCallback(
    async (payload: { audioBase64?: string; filename?: string; text?: string }) => {
      setProcessing(true);
      setResult(null);
      const res = await api.post<VoiceResult>("/api/voice", payload);
      setProcessing(false);

      if (!res.ok || !res.data) {
        console.error("[Asistente] error procesando:", res.error);
        toast.error(res.error?.message || "No he podido procesar tu nota");
        return;
      }

      setResult(res.data);
      setText("");
      const created =
        res.data.transactions.length + res.data.budgets.length + res.data.goals.length + res.data.outings.length;
      toast.success(created > 0 ? `He registrado ${created} elementos` : "Analizado");
      console.log("[Asistente] resultado:", res.data);
      window.dispatchEvent(new Event("fintra:refresh"));
      await loadNotes();
    },
    [loadNotes]
  );

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        console.log("[Asistente] audio grabado:", blob.size, "bytes");
        if (blob.size < 1200) {
          toast.error("La grabación es demasiado corta");
          return;
        }
        const buffer = await blob.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        await send({ audioBase64: btoa(binary), filename: "nota-de-voz.webm" });
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err: any) {
      console.error("[Asistente] micrófono no disponible:", err);
      toast.error("No he podido acceder al micrófono. Escribe tu nota abajo y funciona igual.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="asistente de voz"
        title="Cuéntame tu día"
        description="Graba una nota de voz con tus gastos, tu presupuesto, tus metas o las salidas que tienes previstas. Lo transcribo, lo entiendo y lo organizo todo automáticamente."
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        {/* Grabadora */}
        <Card className="rise relative overflow-hidden rounded-3xl p-8">
          <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
          <div className="relative flex flex-col items-center text-center">
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={processing}
              className={`grid h-32 w-32 place-items-center rounded-full transition-all ${
                recording
                  ? "bg-destructive text-white pulse-ring"
                  : "bg-primary text-primary-foreground hover:scale-105"
              } disabled:opacity-60`}
              aria-label={recording ? "Detener grabación" : "Grabar nota de voz"}
            >
              {processing ? (
                <Loader2 className="h-11 w-11 animate-spin" />
              ) : recording ? (
                <Square className="h-10 w-10" />
              ) : (
                <Mic className="h-11 w-11" />
              )}
            </button>

            <p className="tabular mt-6 text-2xl">
              {recording
                ? `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
                : processing
                  ? "Procesando…"
                  : "Listo para escucharte"}
            </p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              {recording
                ? "Habla con normalidad. Pulsa para terminar y lo analizo al instante."
                : "Pulsa el micrófono y cuéntame tus gastos, tu presupuesto o tus planes."}
            </p>

            <div className="mt-8 w-full">
              <p className="mb-2 text-left text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                O escríbelo
              </p>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Hoy gasté 12 € en el súper y 4,50 en un café…"
                rows={3}
                className="rounded-2xl"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  className="rounded-full"
                  disabled={processing || !text.trim()}
                  onClick={() => send({ text: text.trim() })}
                >
                  <Send className="mr-2 h-4 w-4" /> Enviar al asistente
                </Button>
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setText(ex)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    Ejemplo {i + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Resultado */}
        <div className="space-y-4">
          {result ? (
            <Card className="rise rounded-3xl border-primary/30 bg-primary/[0.06] p-7">
              <p className="mb-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Análisis del asistente
              </p>
              {result.summary && <p className="text-base leading-relaxed">{result.summary}</p>}
              {result.advice && (
                <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {result.advice}
                </p>
              )}

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Movimientos", value: result.transactions.length },
                  { label: "Presupuestos", value: result.budgets.length },
                  { label: "Metas", value: result.goals.length },
                  { label: "Salidas", value: result.outings.length },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl border border-border bg-card px-4 py-3">
                    <p className="tabular text-2xl font-semibold">{s.value}</p>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Máximo que puedes gastar hoy</p>
                <p className="tabular mt-1 text-2xl font-semibold text-primary">{money(result.dailySafeSpend)}</p>
              </div>

              {result.transactions.length > 0 && (
                <ul className="mt-5 divide-y divide-border">
                  {result.transactions.map((t: any) => (
                    <li key={t._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="truncate">{t.concept}</span>
                      <span className="tabular">{money(t.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-5 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
                <strong className="font-medium">Transcripción:</strong> {result.transcription}
              </p>
            </Card>
          ) : (
            <Card className="rise rounded-3xl p-7">
              <p className="mb-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                <Wand2 className="h-3.5 w-3.5" /> Qué puedo hacer con tu nota
              </p>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>· Registrar cada gasto o ingreso con su categoría automática.</li>
                <li>· Fijar o ajustar el presupuesto mensual de una categoría.</li>
                <li>· Crear metas de ahorro con el aporte mensual necesario.</li>
                <li>· Planificar salidas y decirte el máximo que puedes gastar.</li>
                <li>· Avisarte cuando te acerques a cualquiera de tus límites.</li>
              </ul>
            </Card>
          )}

          <Card className="rise rounded-3xl p-7 [animation-delay:80ms]">
            <h2 className="font-display text-xl">Historial de notas</h2>
            <p className="mb-4 text-xs text-muted-foreground">Tus notas de voz transcritas y analizadas</p>
            <ul className="space-y-3">
              {notes.length === 0 && (
                <li className="text-sm text-muted-foreground">Todavía no me has mandado ninguna nota.</li>
              )}
              {notes.slice(0, 6).map((n) => (
                <li key={n._id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {n.createdAt ? new Date(n.createdAt).toLocaleString("es-ES") : ""}
                    </p>
                    {n.audio_file?.url && (
                      <a
                        href={n.audio_file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline underline-offset-4"
                      >
                        Escuchar
                      </a>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm">{n.transcription}</p>
                  {n.ai_summary && <p className="mt-1.5 text-xs text-muted-foreground">{n.ai_summary}</p>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
