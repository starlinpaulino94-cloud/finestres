"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Mic, Send, Sparkles, Square, Loader2, Wand2, X } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { ensureBootstrap } from "@/lib/ensure-bootstrap";
import { actionLabel, type AssistantActionResult, type ConfirmableAssistantPlan } from "@/lib/assistant-plan";
import type { VoiceNote } from "@/types/finance";
import { toast } from "sonner";

interface AssistantDraft {
  draftId: string;
  transcription: string;
  plan: ConfirmableAssistantPlan;
  requiresConfirmation: true;
}

interface AssistantExecution {
  draftId: string;
  status: "completed";
  results: AssistantActionResult[];
  safeToSpend: { dailyLimit: number; available: number };
}

interface VoiceNoteWithDraft extends VoiceNote {
  pendingDraft?: AssistantDraft;
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
  const [processing, setProcessing] = useState<"analyze" | "confirm" | "cancel" | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [execution, setExecution] = useState<AssistantExecution | null>(null);
  const [notes, setNotes] = useState<VoiceNoteWithDraft[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadNotes = useCallback(async () => {
    const res = await api.get<VoiceNoteWithDraft[]>("/api/voice");
    if (res.ok && res.data) {
      setNotes(res.data);
      const pendingDraft = res.data.find((note) => note.pendingDraft)?.pendingDraft;
      if (pendingDraft) setDraft((current) => current || pendingDraft);
    }
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
      setProcessing("analyze");
      setDraft(null);
      setExecution(null);
      const res = await api.post<AssistantDraft>("/api/voice", { mode: "analyze", ...payload });
      setProcessing(null);

      if (!res.ok || !res.data) {
        console.error("[Asistente] error procesando:", res.error);
        toast.error(res.error?.message || "No he podido procesar tu nota");
        return;
      }

      setDraft(res.data);
      setText("");
      toast.success(
        res.data.plan.acciones.length > 0
          ? `Borrador listo: revisa ${res.data.plan.acciones.length} acciones antes de confirmar`
          : "Análisis listo; no se propusieron cambios"
      );
      await loadNotes();
    },
    [loadNotes]
  );

  const confirmDraft = useCallback(async () => {
    if (!draft) return;
    setProcessing("confirm");
    const res = await api.post<AssistantExecution>("/api/voice", {
      mode: "confirm",
      draftId: draft.draftId,
    });
    setProcessing(null);
    if (!res.ok || !res.data) {
      toast.error(res.error?.message || "No se pudieron ejecutar las acciones");
      return;
    }
    setExecution(res.data);
    toast.success(`Confirmado: ${res.data.results.length} acciones completadas`);
    window.dispatchEvent(new Event("fintra:refresh"));
    await loadNotes();
  }, [draft, loadNotes]);

  const cancelDraft = useCallback(async () => {
    if (!draft) return;
    setProcessing("cancel");
    const res = await api.post<{ status: "cancelled" }>("/api/voice", {
      mode: "cancel",
      draftId: draft.draftId,
    });
    setProcessing(null);
    if (!res.ok) {
      toast.error(res.error?.message || "No se pudo cancelar el borrador");
      return;
    }
    setDraft(null);
    setExecution(null);
    toast.success("Borrador cancelado; no se aplicó ningún cambio");
    await loadNotes();
  }, [draft, loadNotes]);

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
        description="Escribe o habla con naturalidad. La IA puede proponer cambios en toda tu app, pero no ejecutará nada hasta que revises el borrador y pulses Confirmar."
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        {/* Grabadora */}
        <Card className="rise relative overflow-hidden rounded-3xl p-8">
          <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
          <div className="relative flex flex-col items-center text-center">
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={Boolean(processing)}
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
                  ? processing === "analyze" ? "Analizando…" : processing === "confirm" ? "Ejecutando…" : "Cancelando…"
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
                  disabled={Boolean(processing) || !text.trim()}
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
          {draft ? (
            <Card className="rise rounded-3xl border-primary/30 bg-primary/[0.06] p-7">
              <p className="mb-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-primary">
                <Sparkles className="h-3.5 w-3.5" /> {execution ? "Acciones completadas" : "Borrador pendiente de confirmación"}
              </p>
              {draft.plan.resumen && <p className="text-base leading-relaxed">{draft.plan.resumen}</p>}
              {draft.plan.consejo && (
                <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {draft.plan.consejo}
                </p>
              )}

              <div className="mt-5 rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-medium">
                  {draft.plan.acciones.length} {draft.plan.acciones.length === 1 ? "acción propuesta" : "acciones propuestas"}
                </p>
                {draft.plan.acciones.length > 0 ? (
                  <ol className="mt-3 space-y-2">
                    {draft.plan.acciones.map((action, index) => {
                      const completed = execution?.results.some((item) => item.actionId === action.actionId);
                      return (
                        <li key={action.actionId} className="flex gap-3 rounded-xl bg-secondary/70 px-3 py-2.5 text-sm">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-background text-xs">
                            {completed ? <Check className="h-3.5 w-3.5 text-primary" /> : index + 1}
                          </span>
                          <span>{action.preview || actionLabel(action)}</span>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No hay cambios que ejecutar.</p>
                )}
              </div>

              {!execution && (
                <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <p className="text-sm font-medium">Nada se ha modificado todavía</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Confirma solo si la lista anterior coincide exactamente con lo que quieres hacer.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button className="rounded-full" disabled={Boolean(processing)} onClick={confirmDraft}>
                      {processing === "confirm" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                      Confirmar y ejecutar
                    </Button>
                    <Button variant="outline" className="rounded-full" disabled={Boolean(processing)} onClick={cancelDraft}>
                      {processing === "cancel" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {execution && (
                <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/10 p-4">
                  <p className="text-sm font-medium">Confirmación aplicada correctamente</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Disponible actual: {money(execution.safeToSpend.available)} · límite diario: {money(execution.safeToSpend.dailyLimit)}
                  </p>
                </div>
              )}

              <p className="mt-5 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
                <strong className="font-medium">Tu petición:</strong> {draft.transcription}
              </p>
            </Card>
          ) : (
            <Card className="rise rounded-3xl p-7">
              <p className="mb-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                <Wand2 className="h-3.5 w-3.5" /> Qué puedo hacer con tu nota
              </p>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>· Crear, editar o eliminar movimientos.</li>
                <li>· Gestionar cuentas, categorías y presupuestos.</li>
                <li>· Crear o actualizar metas y salidas planificadas.</li>
                <li>· Gestionar tus alertas.</li>
                <li>· Mostrarte siempre un borrador exacto antes de modificar datos.</li>
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
