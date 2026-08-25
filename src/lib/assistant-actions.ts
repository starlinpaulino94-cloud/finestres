import "server-only";

import type {
  AssistantAction,
  AssistantActionResult,
  ConfirmableAssistantAction,
} from "@/lib/assistant-plan";
import { actionLabel } from "@/lib/assistant-plan";
import {
  assertOwnedReferences,
  assertOwner,
  buildDashboard,
  ensureBalanceTracking,
  findOrCreateCategory,
  monthKey,
} from "@/lib/finance";
import { clamp, kindMeta, round2 } from "@/lib/finance-core";
import { totalumSdk } from "@/lib/totalum";

class AssistantActionError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "AssistantActionError";
  }
}

function relationId(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "_id" in value) {
    const id = (value as { _id?: unknown })._id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function validDate(value: string | undefined, fallback = new Date()): Date {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AssistantActionError("La fecha propuesta no es válida");
  return date;
}

function recordId(value: unknown): string | undefined {
  return value && typeof value === "object" && "_id" in value
    ? String((value as { _id: unknown })._id)
    : undefined;
}

async function owned(table: string, id: string, userId: string): Promise<any> {
  const check = await assertOwner(table, id, userId);
  if (!check.ok) throw new AssistantActionError(check.message || "Registro no disponible", check.status || 400);
  return check.record;
}

async function validateReferences(userId: string, references: Parameters<typeof assertOwnedReferences>[1]) {
  const check = await assertOwnedReferences(userId, references);
  if (!check.ok) throw new AssistantActionError(check.message || "Referencia no válida", check.status || 400);
}

async function priorCreatedRecord(table: string, userId: string, actionId: string): Promise<any | null> {
  const res = await totalumSdk.crud.query(table, {
    _filter: { user: userId, assistant_action_id: actionId },
    _limit: 1,
  });
  return ((res.data as any[]) || [])[0] || null;
}

async function createOnce(
  table: string,
  userId: string,
  actionId: string,
  payload: Record<string, unknown>
): Promise<any> {
  const prior = await priorCreatedRecord(table, userId, actionId);
  if (prior) return prior;
  const result = await totalumSdk.crud.createRecord(table, {
    ...payload,
    assistant_action_id: actionId,
    user: userId,
  });
  return result.data;
}

function result(action: ConfirmableAssistantAction, data?: unknown): AssistantActionResult {
  return {
    actionId: action.actionId,
    type: action.type,
    recordId: recordId(data),
    description: actionLabel(action),
  };
}

/** Valida el plan completo antes de permitir que la primera acción escriba. */
export async function validateAssistantActions(
  userId: string,
  actions: ConfirmableAssistantAction[]
): Promise<void> {
  const targets = new Set<string>();
  const target = async (table: string, id: string) => {
    const key = `${table}:${id}`;
    if (targets.has(key)) throw new AssistantActionError("El borrador modifica el mismo registro más de una vez");
    targets.add(key);
    return owned(table, id, userId);
  };

  for (const action of actions) {
    switch (action.type) {
      case "create_transaction": {
        const meta = kindMeta(action.kind);
        if (meta.needsDestination && (
          !action.bank_account_id ||
          !action.transfer_account_id ||
          action.bank_account_id === action.transfer_account_id
        )) {
          throw new AssistantActionError("La transferencia propuesta no tiene dos cuentas distintas");
        }
        await validateReferences(userId, [
          { table: "category", id: action.category_id, label: "Categoría" },
          { table: "bank_account", id: action.bank_account_id, label: "Cuenta de origen" },
          { table: "bank_account", id: action.transfer_account_id, label: "Cuenta de destino" },
        ]);
        break;
      }
      case "update_transaction": {
        const current = await target("transaction", action.id);
        const meta = kindMeta(action.kind || current.kind);
        const origin = action.bank_account_id === null
          ? undefined
          : action.bank_account_id || relationId(current.bank_account);
        const destination = action.transfer_account_id === null
          ? undefined
          : action.transfer_account_id || relationId(current.transfer_account);
        if (meta.needsDestination && (!origin || !destination || origin === destination)) {
          throw new AssistantActionError("La transferencia propuesta no tiene dos cuentas distintas");
        }
        await validateReferences(userId, [
          { table: "category", id: action.category_id, label: "Categoría" },
          { table: "bank_account", id: origin, label: "Cuenta de origen" },
          { table: "bank_account", id: destination, label: "Cuenta de destino" },
        ]);
        break;
      }
      case "delete_transaction": await target("transaction", action.id); break;
      case "update_account": await target("bank_account", action.id); break;
      case "upsert_budget":
        await validateReferences(userId, [{ table: "category", id: action.category_id, label: "Categoría" }]);
        break;
      case "update_goal":
      case "delete_goal": await target("savings_goal", action.id); break;
      case "update_outing":
      case "delete_outing": await target("outing_plan", action.id); break;
      case "mark_notifications_read":
        if (action.id) await target("notification", action.id);
        break;
      case "create_account":
      case "create_category":
      case "create_goal":
      case "create_outing":
        break;
    }
  }
}

async function categoryForTransaction(
  userId: string,
  action: Extract<AssistantAction, { type: "create_transaction" }>
): Promise<string | undefined> {
  if (action.category_id) {
    await validateReferences(userId, [{ table: "category", id: action.category_id, label: "Categoría" }]);
    return action.category_id;
  }
  if (!action.category_name) return undefined;
  const response = await totalumSdk.crud.query("category", { _filter: { user: userId }, _limit: 300 });
  const categories = ((response.data as any[]) || []).map((category) => ({
    _id: String(category._id),
    name: String(category.name || ""),
    kind: String(category.kind || "gasto"),
  }));
  return findOrCreateCategory(
    userId,
    action.category_name,
    action.kind === "ingreso" ? "ingreso" : "gasto",
    categories
  );
}

/** Ejecuta exclusivamente una acción que ya fue mostrada y confirmada por el usuario. */
export async function executeAssistantAction(
  userId: string,
  noteId: string,
  action: ConfirmableAssistantAction
): Promise<AssistantActionResult> {
  switch (action.type) {
    case "create_transaction": {
      const meta = kindMeta(action.kind);
      if (meta.needsDestination && (!action.bank_account_id || !action.transfer_account_id)) {
        throw new AssistantActionError("La transferencia necesita cuenta de origen y destino");
      }
      if (meta.needsDestination && action.bank_account_id === action.transfer_account_id) {
        throw new AssistantActionError("La cuenta de origen y la de destino no pueden ser la misma");
      }
      await validateReferences(userId, [
        { table: "bank_account", id: action.bank_account_id, label: "Cuenta de origen" },
        { table: "bank_account", id: action.transfer_account_id, label: "Cuenta de destino" },
      ]);
      const tracking = await ensureBalanceTracking(userId, [action.bank_account_id, action.transfer_account_id]);
      if (!tracking.ok) throw new AssistantActionError(tracking.message || "Cuenta no disponible", tracking.status || 400);
      const categoryId = meta.needsDestination ? undefined : await categoryForTransaction(userId, action);
      const data = await createOnce("transaction", userId, action.actionId, {
        concept: action.concept,
        amount: round2(action.amount),
        kind: action.kind,
        spent_at: validDate(action.spent_at),
        source: "asistente",
        auto_categorized: action.category_name && categoryId ? "yes" : "no",
        balance_effective_at: new Date(),
        notes: action.notes,
        category: categoryId,
        bank_account: action.bank_account_id,
        transfer_account: meta.needsDestination ? action.transfer_account_id : undefined,
        voice_note: noteId,
      });
      return result(action, data);
    }

    case "update_transaction": {
      const current = await owned("transaction", action.id, userId);
      const resultingKind = action.kind || current.kind;
      const meta = kindMeta(resultingKind);
      const sourceAccount = action.bank_account_id === null
        ? undefined
        : action.bank_account_id || relationId(current.bank_account);
      const targetAccount = action.transfer_account_id === null
        ? undefined
        : action.transfer_account_id || relationId(current.transfer_account);
      if (meta.needsDestination && (!sourceAccount || !targetAccount || sourceAccount === targetAccount)) {
        throw new AssistantActionError("La transferencia necesita dos cuentas propias distintas");
      }
      await validateReferences(userId, [
        { table: "category", id: action.category_id, label: "Categoría" },
        { table: "bank_account", id: sourceAccount, label: "Cuenta de origen" },
        { table: "bank_account", id: targetAccount, label: "Cuenta de destino" },
      ]);
      const tracking = await ensureBalanceTracking(userId, [sourceAccount, targetAccount]);
      if (!tracking.ok) throw new AssistantActionError(tracking.message || "Cuenta no disponible", tracking.status || 400);
      const update: Record<string, unknown> = {};
      if (action.concept !== undefined) update.concept = action.concept;
      if (action.amount !== undefined) update.amount = round2(action.amount);
      if (action.kind !== undefined) update.kind = action.kind;
      if (action.spent_at !== undefined) update.spent_at = validDate(action.spent_at);
      if (action.notes !== undefined) update.notes = action.notes;
      if (action.category_id !== undefined) update.category = meta.needsDestination ? null : action.category_id;
      if (action.bank_account_id !== undefined) update.bank_account = action.bank_account_id;
      if (action.transfer_account_id !== undefined) update.transfer_account = meta.needsDestination ? action.transfer_account_id : null;
      if (meta.needsDestination) update.category = null;
      else if (action.kind !== undefined) update.transfer_account = null;
      update.balance_effective_at = new Date();
      const edited = await totalumSdk.crud.editRecordById("transaction", action.id, update);
      return result(action, edited.data);
    }

    case "delete_transaction": {
      const check = await assertOwner("transaction", action.id, userId);
      if (!check.ok && check.status !== 404) throw new AssistantActionError(check.message || "Movimiento no disponible", check.status || 400);
      if (check.ok) await totalumSdk.crud.deleteRecordById("transaction", action.id);
      return result(action, { _id: action.id });
    }

    case "create_account": {
      const data = await createOnce("bank_account", userId, action.actionId, {
        name: action.name,
        account_type: action.account_type,
        balance: round2(action.balance ?? 0),
        bank_name: action.bank_name,
        last_four: action.last_four,
        currency: "EUR",
        balance_as_of: new Date(),
      });
      return result(action, data);
    }

    case "update_account": {
      await owned("bank_account", action.id, userId);
      const { type: _type, id: _id, actionId: _actionId, preview: _preview, ...fields } = action;
      const data = await totalumSdk.crud.editRecordById("bank_account", action.id, {
        ...fields,
        ...(action.balance !== undefined ? { balance_as_of: new Date() } : {}),
      });
      return result(action, data.data);
    }

    case "create_category": {
      const existing = await totalumSdk.crud.query("category", {
        _filter: { user: userId, name: action.name },
        _limit: 1,
      });
      const found = ((existing.data as any[]) || [])[0];
      const data = found || await createOnce("category", userId, action.actionId, {
        name: action.name,
        kind: action.kind,
        color: action.color || "#4ade80",
        emoji: action.emoji || (action.kind === "ingreso" ? "💰" : "💸"),
      });
      return result(action, data);
    }

    case "upsert_budget": {
      await validateReferences(userId, [{ table: "category", id: action.category_id, label: "Categoría" }]);
      const month = action.month || monthKey(new Date());
      const existing = await totalumSdk.crud.query("budget", {
        _filter: { user: userId, month, category: action.category_id },
        _limit: 1,
      });
      const found = ((existing.data as any[]) || [])[0];
      const payload = {
        month,
        limit_amount: round2(action.limit_amount),
        alert_threshold: action.alert_threshold ?? found?.alert_threshold ?? 80,
        category: action.category_id,
        user: userId,
      };
      const response = found
        ? await totalumSdk.crud.editRecordById("budget", found._id, payload)
        : await totalumSdk.crud.createRecord("budget", { ...payload, assistant_action_id: action.actionId });
      return result(action, response.data);
    }

    case "create_goal": {
      const deadline = action.deadline ? validDate(action.deadline) : undefined;
      const months = deadline
        ? Math.max(Math.ceil((deadline.getTime() - Date.now()) / 2_629_746_000), 1)
        : 12;
      const saved = round2(action.saved_amount ?? 0);
      const data = await createOnce("savings_goal", userId, action.actionId, {
        title: action.title,
        target_amount: round2(action.target_amount),
        saved_amount: saved,
        monthly_contribution: round2(Math.max((action.target_amount - saved) / months, 0)),
        deadline,
        status: "activa",
        notes: action.notes,
        voice_note: noteId,
      });
      return result(action, data);
    }

    case "update_goal": {
      const current = await owned("savings_goal", action.id, userId);
      const target = action.target_amount ?? Number(current.target_amount || 0);
      const saved = action.saved_amount ?? Number(current.saved_amount || 0);
      const deadlineValue = action.deadline === null ? undefined : action.deadline || current.deadline;
      const deadline = deadlineValue ? validDate(String(deadlineValue)) : undefined;
      const months = deadline ? Math.max(Math.ceil((deadline.getTime() - Date.now()) / 2_629_746_000), 1) : 12;
      const { type: _type, id: _id, actionId: _actionId, preview: _preview, ...fields } = action;
      const response = await totalumSdk.crud.editRecordById("savings_goal", action.id, {
        ...fields,
        ...(action.deadline !== undefined ? { deadline: action.deadline === null ? null : deadline } : {}),
        monthly_contribution: round2(Math.max((target - saved) / months, 0)),
      });
      return result(action, response.data);
    }

    case "delete_goal": {
      const check = await assertOwner("savings_goal", action.id, userId);
      if (!check.ok && check.status !== 404) throw new AssistantActionError(check.message || "Meta no disponible", check.status || 400);
      if (check.ok) await totalumSdk.crud.deleteRecordById("savings_goal", action.id);
      return result(action, { _id: action.id });
    }

    case "create_outing": {
      const dashboard = await buildDashboard(userId);
      const estimated = round2(action.estimated_cost ?? 0);
      const maxRecommended = round2(clamp(
        Math.min(estimated || dashboard.safeToSpend.dailyLimit * 1.5, dashboard.safeToSpend.dailyLimit * 1.5),
        0,
        dashboard.safeToSpend.available
      ));
      const data = await createOnce("outing_plan", userId, action.actionId, {
        title: action.title,
        planned_at: validDate(action.planned_at),
        estimated_cost: estimated,
        max_recommended: maxRecommended,
        status: "planificada",
        voice_note: noteId,
      });
      return result(action, data);
    }

    case "update_outing": {
      await owned("outing_plan", action.id, userId);
      const { type: _type, id: _id, actionId: _actionId, preview: _preview, planned_at, ...fields } = action;
      const response = await totalumSdk.crud.editRecordById("outing_plan", action.id, {
        ...fields,
        ...(planned_at !== undefined ? { planned_at: validDate(planned_at) } : {}),
      });
      return result(action, response.data);
    }

    case "delete_outing": {
      const check = await assertOwner("outing_plan", action.id, userId);
      if (!check.ok && check.status !== 404) throw new AssistantActionError(check.message || "Salida no disponible", check.status || 400);
      if (check.ok) await totalumSdk.crud.deleteRecordById("outing_plan", action.id);
      return result(action, { _id: action.id });
    }

    case "mark_notifications_read": {
      if (action.id) {
        await owned("notification", action.id, userId);
        await totalumSdk.crud.editRecordById("notification", action.id, { is_read: "yes" });
        return result(action, { _id: action.id });
      }
      const pending = await totalumSdk.crud.query("notification", {
        _filter: { user: userId, is_read: { ne: "yes" } },
        _limit: 300,
      });
      for (const notification of (pending.data as any[]) || []) {
        await totalumSdk.crud.editRecordById("notification", notification._id, { is_read: "yes" });
      }
      return result(action);
    }
  }
}
