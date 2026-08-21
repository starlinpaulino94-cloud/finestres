import { NextResponse } from "next/server";
import { totalumSdk } from "@/lib/totalum";
import {
  askAi,
  buildDashboard,
  extractJson,
  findOrCreateCategory,
  formatCurrency,
  getSessionUser,
  monthKey,
  refreshBudgetAlerts,
  serializeError,
} from "@/lib/finance";

interface AiPlan {
  resumen?: string;
  consejo?: string;
  gastos?: { concepto: string; importe: number; categoria?: string; dias_atras?: number; tipo?: string }[];
  presupuestos?: { categoria: string; limite_mensual: number }[];
  metas?: { titulo: string; objetivo: number; meses_plazo?: number; aporte_mensual?: number }[];
  salidas?: { titulo: string; dias_hasta?: number; coste_estimado?: number }[];
}


export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const res = await totalumSdk.crud.query("voice_note", {
      _filter: { user: user.id },
      _sort: { createdAt: "desc" },
      _limit: 30,
    });
    return NextResponse.json({ ok: true, data: res.data });
  } catch (err) {
    console.error("[API ERROR] GET /api/voice", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}

/**
 * Voice assistant: receives a voice note (or plain text), transcribes it with
 * the Totalum built-in Whisper integration, understands it with GPT and turns
 * it into transactions, budgets, savings goals and planned outings.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      audioBase64?: string;
      filename?: string;
      text?: string;
    };

    if (!body.audioBase64 && !body.text) {
      return NextResponse.json(
        { ok: false, error: { message: "Envía una nota de voz o un texto" } },
        { status: 400 }
      );
    }

    // 1) Transcription (Whisper via Totalum — no OpenAI key needed)
    let transcription = (body.text || "").trim();
    let audioFileName: string | null = null;

    if (body.audioBase64) {
      const filename = body.filename || "nota-de-voz.webm";
      console.log("[API] /api/voice transcribiendo audio:", filename, "bytes b64:", body.audioBase64.length);

      const result = await totalumSdk.files.transcribeAudio({
        audioBase64: body.audioBase64,
        filename,
      });
      transcription = ((result.data as any)?.text || "").trim();

      // Store the audio so the user keeps the original note (non-critical)
      try {
        const buffer = Buffer.from(body.audioBase64, "base64");
        const formData = new FormData();
        formData.append("file", new Blob([new Uint8Array(buffer)]), filename);
        const uploaded = await totalumSdk.files.uploadFile(formData as any);
        audioFileName = (uploaded.data as any) || null;
      } catch (uploadErr) {
        console.error("[API] /api/voice: no se pudo guardar el audio:", uploadErr);
      }
    }

    if (!transcription) {
      return NextResponse.json(
        { ok: false, error: { message: "No he podido entender el audio. Prueba a grabar de nuevo o escríbelo." } },
        { status: 422 }
      );
    }

    console.log("[API] /api/voice transcripción:", transcription.slice(0, 200));

    // 2) Context so the AI can plan with real numbers
    const [dashboard, categoriesRes] = await Promise.all([
      buildDashboard(user.id),
      totalumSdk.crud.query("category", { _filter: { user: user.id }, _limit: 200 }),
    ]);
    const categories = ((categoriesRes.data as any[]) || []).map((c) => ({
      _id: c._id,
      name: c.name,
      kind: c.kind,
    }));

    const context = `Situación financiera actual (${dashboard.monthLabel}):
- Ingresos del mes: ${formatCurrency(dashboard.income)}
- Gastos del mes: ${formatCurrency(dashboard.expense)}
- Presupuesto del mes: ${formatCurrency(dashboard.budgetTotal)}, gastado ${formatCurrency(dashboard.budgetSpent)}
- Gasto diario seguro: ${formatCurrency(dashboard.dailySafeSpend)} durante ${dashboard.daysLeft} días
- Metas de ahorro: ${dashboard.goals.map((g) => `${g.title} (${formatCurrency(g.saved_amount || 0)}/${formatCurrency(g.target_amount)})`).join("; ") || "ninguna"}
- Categorías existentes: ${categories.map((c) => c.name).join(", ")}

Nota de voz del usuario (transcripción literal):
"""${transcription}"""

Extrae TODO lo que el usuario cuenta y devuelve SOLO este JSON:
{
  "resumen": "1-2 frases resumiendo lo que ha contado",
  "gastos": [{"concepto": "...", "importe": 12.5, "categoria": "nombre de categoría", "dias_atras": 0, "tipo": "gasto"}],
  "presupuestos": [{"categoria": "...", "limite_mensual": 300}],
  "metas": [{"titulo": "...", "objetivo": 3000, "meses_plazo": 12, "aporte_mensual": 250}],
  "salidas": [{"titulo": "...", "dias_hasta": 3, "coste_estimado": 40}],
  "consejo": "consejo accionable en 2-4 frases, incluyendo el máximo que puede gastar en las salidas mencionadas"
}
Reglas: usa arrays vacíos si no menciona algo. "tipo" es "ingreso" solo si claramente cobra dinero. Los importes son números en euros. Si menciona una categoría que no existe, usa un nombre corto y claro.`;

    const aiText = await askAi(
      "Eres el asistente financiero personal de la app Fintra. Interpretas notas de voz en español sobre gastos, presupuestos, metas de ahorro y salidas planificadas. Respondes únicamente con JSON válido.",
      context,
      { maxTokens: 1200, temperature: 0.2 }
    );
    const plan = extractJson<AiPlan>(aiText) || {};
    console.log("[API] /api/voice plan IA:", JSON.stringify(plan).slice(0, 500));

    // 3) Save the voice note
    const noteRes = await totalumSdk.crud.createRecord("voice_note", {
      title: `Nota de voz · ${new Date().toLocaleString("es-ES")}`,
      transcription,
      ai_summary: plan.resumen || "",
      ai_result: JSON.stringify(plan),
      status: "procesada",
      ...(audioFileName ? { audio_file: { name: audioFileName } } : {}),
      user: user.id,
    });
    const noteId = (noteRes.data as any)?._id;

    // 4) Turn the plan into real records
    const createdTransactions: any[] = [];
    for (const item of plan.gastos || []) {
      const amount = Number(item.importe);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const kind = item.tipo === "ingreso" ? "ingreso" : "gasto";
      const categoryId = item.categoria
        ? await findOrCreateCategory(user.id, item.categoria, kind, categories)
        : undefined;
      const date = new Date();
      date.setDate(date.getDate() - Math.max(Number(item.dias_atras) || 0, 0));

      const res = await totalumSdk.crud.createRecord("transaction", {
        concept: item.concepto || "Gasto por voz",
        amount,
        kind,
        spent_at: date,
        source: "voz",
        auto_categorized: categoryId ? "yes" : "no",
        ...(categoryId ? { category: categoryId } : {}),
        voice_note: noteId,
        user: user.id,
      });
      createdTransactions.push(res.data);
    }

    const month = monthKey(new Date());
    const createdBudgets: any[] = [];
    for (const item of plan.presupuestos || []) {
      const limit = Number(item.limite_mensual);
      if (!Number.isFinite(limit) || limit <= 0 || !item.categoria) continue;
      const categoryId = await findOrCreateCategory(user.id, item.categoria, "gasto", categories);
      const existing = await totalumSdk.crud.query("budget", {
        _filter: { user: user.id, month, category: categoryId },
        _limit: 1,
      });
      const found = (existing.data as any[])?.[0];
      const payload = {
        month,
        limit_amount: limit,
        alert_threshold: found?.alert_threshold || 80,
        category: categoryId,
        user: user.id,
      };
      const res = found
        ? await totalumSdk.crud.editRecordById("budget", found._id, payload)
        : await totalumSdk.crud.createRecord("budget", payload);
      createdBudgets.push(res.data);
    }

    const createdGoals: any[] = [];
    for (const item of plan.metas || []) {
      const target = Number(item.objetivo);
      if (!Number.isFinite(target) || target <= 0) continue;
      const months = Math.max(Number(item.meses_plazo) || 12, 1);
      const deadline = new Date();
      deadline.setMonth(deadline.getMonth() + months);
      const res = await totalumSdk.crud.createRecord("savings_goal", {
        title: item.titulo || "Nueva meta de ahorro",
        target_amount: target,
        saved_amount: 0,
        monthly_contribution:
          Number(item.aporte_mensual) || Math.round((target / months) * 100) / 100,
        deadline,
        status: "activa",
        notes: `Creada desde una nota de voz: "${transcription.slice(0, 160)}"`,
        user: user.id,
      });
      createdGoals.push(res.data);
    }

    const createdOutings: any[] = [];
    for (const item of plan.salidas || []) {
      const estimated = Number(item.coste_estimado) || 0;
      const plannedAt = new Date();
      plannedAt.setDate(plannedAt.getDate() + Math.max(Number(item.dias_hasta) || 0, 0));
      const maxRecommended =
        Math.round(Math.max(Math.min(estimated || dashboard.dailySafeSpend * 1.5, dashboard.dailySafeSpend * 1.5), 10) * 100) /
        100;
      const res = await totalumSdk.crud.createRecord("outing_plan", {
        title: item.titulo || "Salida",
        planned_at: plannedAt,
        estimated_cost: estimated,
        max_recommended: maxRecommended,
        ai_advice: plan.consejo || "",
        status: "planificada",
        voice_note: noteId,
        user: user.id,
      });
      createdOutings.push(res.data);
    }

    // 5) Alerts + assistant answer in the notification centre
    const fresh = await buildDashboard(user.id);
    await refreshBudgetAlerts(user.id, fresh.budgets);

    if (plan.consejo) {
      await totalumSdk.crud.createRecord("notification", {
        title: "Tu asistente ha analizado tu nota de voz",
        message: plan.consejo,
        severity: "info",
        is_read: "no",
        user: user.id,
      });
    }

    console.log("[API] /api/voice resultado:", {
      movimientos: createdTransactions.length,
      presupuestos: createdBudgets.length,
      metas: createdGoals.length,
      salidas: createdOutings.length,
    });

    return NextResponse.json({
      ok: true,
      data: {
        transcription,
        summary: plan.resumen || "",
        advice: plan.consejo || "",
        transactions: createdTransactions,
        budgets: createdBudgets,
        goals: createdGoals,
        outings: createdOutings,
        dailySafeSpend: fresh.dailySafeSpend,
      },
    });
  } catch (err) {
    console.error("[API ERROR] POST /api/voice", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
