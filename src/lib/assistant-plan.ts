import { z } from "zod";

const id = z.string().min(1).max(120);
const shortText = z.string().trim().min(1).max(180);
const optionalText = z.string().trim().max(1200).optional();
const money = z.number().finite().min(0).max(1_000_000_000);
const signedMoney = z.number().finite().min(-1_000_000_000).max(1_000_000_000);
const positiveMoney = money.refine((value) => value > 0, "El importe debe ser mayor que cero");
const dateText = z.string().trim().max(40).optional();
const transactionKind = z.enum(["gasto", "ingreso", "transferencia", "pago_tarjeta", "ajuste"]);
const accountType = z.enum(["cuenta", "tarjeta_credito", "tarjeta_debito", "efectivo"]);

const createTransaction = z.object({
  type: z.literal("create_transaction"),
  concept: shortText,
  amount: positiveMoney,
  kind: transactionKind,
  spent_at: dateText,
  category_id: id.optional(),
  category_name: z.string().trim().max(80).optional(),
  bank_account_id: id.optional(),
  transfer_account_id: id.optional(),
  notes: optionalText,
}).strict();

const updateTransaction = z.object({
  type: z.literal("update_transaction"),
  id,
  concept: shortText.optional(),
  amount: positiveMoney.optional(),
  kind: transactionKind.optional(),
  spent_at: dateText,
  category_id: id.nullable().optional(),
  bank_account_id: id.nullable().optional(),
  transfer_account_id: id.nullable().optional(),
  notes: z.string().trim().max(1200).nullable().optional(),
}).strict();

const deleteTransaction = z.object({ type: z.literal("delete_transaction"), id }).strict();

const createAccount = z.object({
  type: z.literal("create_account"),
  name: shortText,
  account_type: accountType,
  balance: signedMoney.optional(),
  bank_name: z.string().trim().max(120).optional(),
  last_four: z.string().regex(/^\d{4}$/).optional(),
}).strict();

const updateAccount = z.object({
  type: z.literal("update_account"),
  id,
  name: shortText.optional(),
  account_type: accountType.optional(),
  balance: signedMoney.optional(),
  bank_name: z.string().trim().max(120).nullable().optional(),
  last_four: z.string().regex(/^\d{4}$/).nullable().optional(),
}).strict();

const createCategory = z.object({
  type: z.literal("create_category"),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["gasto", "ingreso"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  emoji: z.string().trim().max(12).optional(),
}).strict();

const upsertBudget = z.object({
  type: z.literal("upsert_budget"),
  category_id: id,
  limit_amount: positiveMoney,
  alert_threshold: z.number().int().min(1).max(100).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
}).strict();

const createGoal = z.object({
  type: z.literal("create_goal"),
  title: shortText,
  target_amount: positiveMoney,
  saved_amount: money.optional(),
  deadline: dateText,
  notes: optionalText,
}).strict();

const updateGoal = z.object({
  type: z.literal("update_goal"),
  id,
  title: shortText.optional(),
  target_amount: positiveMoney.optional(),
  saved_amount: money.optional(),
  deadline: z.string().trim().max(40).nullable().optional(),
  status: z.enum(["activa", "pausada", "completada"]).optional(),
  notes: z.string().trim().max(1200).nullable().optional(),
}).strict();

const deleteGoal = z.object({ type: z.literal("delete_goal"), id }).strict();

const createOuting = z.object({
  type: z.literal("create_outing"),
  title: shortText,
  planned_at: dateText,
  estimated_cost: money.optional(),
}).strict();

const updateOuting = z.object({
  type: z.literal("update_outing"),
  id,
  title: shortText.optional(),
  planned_at: z.string().trim().max(40).optional(),
  estimated_cost: money.optional(),
  real_cost: money.optional(),
  status: z.enum(["planificada", "realizada", "cancelada"]).optional(),
}).strict();

const deleteOuting = z.object({ type: z.literal("delete_outing"), id }).strict();

const markNotificationsRead = z.object({
  type: z.literal("mark_notifications_read"),
  id: id.optional(),
}).strict();

export const assistantActionSchema = z.discriminatedUnion("type", [
  createTransaction,
  updateTransaction,
  deleteTransaction,
  createAccount,
  updateAccount,
  createCategory,
  upsertBudget,
  createGoal,
  updateGoal,
  deleteGoal,
  createOuting,
  updateOuting,
  deleteOuting,
  markNotificationsRead,
]);

export const assistantPlanSchema = z.object({
  resumen: z.string().trim().max(1000).default(""),
  consejo: z.string().trim().max(3000).default(""),
  acciones: z.array(assistantActionSchema).max(40).default([]),
}).strict();

export const confirmableAssistantActionSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object") return value;
  const { actionId, preview, ...action } = value as Record<string, unknown>;
  return { actionId, preview, action };
}, z.object({
  actionId: z.string().uuid(),
  preview: z.string().trim().min(1).max(1000),
  action: assistantActionSchema,
}).strict()).transform(({ actionId, preview, action }) => ({ ...action, actionId, preview }));

export const assistantDraftEnvelopeSchema = z.object({
  version: z.literal(1),
  plan: z.object({
    resumen: z.string().max(1000),
    consejo: z.string().max(3000),
    acciones: z.array(confirmableAssistantActionSchema).max(40),
  }).strict(),
  completedActionIds: z.array(z.string().uuid()).max(40),
  results: z.array(z.object({
    actionId: z.string().uuid(),
    type: z.enum([
      "create_transaction", "update_transaction", "delete_transaction",
      "create_account", "update_account", "create_category", "upsert_budget",
      "create_goal", "update_goal", "delete_goal", "create_outing", "update_outing",
      "delete_outing", "mark_notifications_read",
    ]),
    recordId: z.string().max(120).optional(),
    description: z.string().max(1000),
  }).strict()).max(40),
}).strict();

export type AssistantAction = z.infer<typeof assistantActionSchema>;
export type AssistantPlan = z.infer<typeof assistantPlanSchema>;
export type ConfirmableAssistantAction = AssistantAction & { actionId: string; preview: string };
export type ConfirmableAssistantPlan = Omit<AssistantPlan, "acciones"> & {
  acciones: ConfirmableAssistantAction[];
};

export interface AssistantActionResult {
  actionId: string;
  type: AssistantAction["type"];
  recordId?: string;
  description: string;
}

export interface AssistantDraftEnvelope {
  version: 1;
  plan: ConfirmableAssistantPlan;
  completedActionIds: string[];
  results: AssistantActionResult[];
}

export function actionLabel(action: AssistantAction & { preview?: string }): string {
  if (action.preview) return action.preview;
  switch (action.type) {
    case "create_transaction": return `Crear ${action.kind}: ${action.concept} (${action.amount} €)`;
    case "update_transaction": return `Actualizar movimiento ${action.id}`;
    case "delete_transaction": return `Eliminar movimiento ${action.id}`;
    case "create_account": return `Crear cuenta: ${action.name}`;
    case "update_account": return `Actualizar cuenta ${action.id}`;
    case "create_category": return `Crear categoría: ${action.name}`;
    case "upsert_budget": return `Guardar presupuesto de ${action.limit_amount} €`;
    case "create_goal": return `Crear meta: ${action.title}`;
    case "update_goal": return `Actualizar meta ${action.id}`;
    case "delete_goal": return `Eliminar meta ${action.id}`;
    case "create_outing": return `Planificar salida: ${action.title}`;
    case "update_outing": return `Actualizar salida ${action.id}`;
    case "delete_outing": return `Eliminar salida ${action.id}`;
    case "mark_notifications_read": return action.id ? "Marcar una alerta como leída" : "Marcar todas las alertas como leídas";
  }
}
