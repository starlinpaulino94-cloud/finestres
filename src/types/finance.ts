// Shared types for the personal finance app (Finestres)
import type {
  BreakdownItem,
  HealthComponent,
  NetWorth,
  SafeToSpend,
  TxKind,
} from "@/lib/finance-core";

export type { BreakdownItem, HealthComponent, NetWorth, SafeToSpend, TxKind };

/** Tipo de categoría: sólo hay categorías de gasto y de ingreso */
export type Kind = "gasto" | "ingreso";
export type YesNo = "yes" | "no";

export interface Category {
  _id: string;
  name: string;
  kind: Kind;
  color?: string;
  emoji?: string;
  /** Idempotencia de creaciones confirmadas por el asistente */
  assistant_action_id?: string;
}

export interface BankAccount {
  _id: string;
  name: string;
  bank_name?: string;
  account_type?: "cuenta" | "tarjeta_credito" | "tarjeta_debito" | "efectivo";
  last_four?: string;
  balance?: number;
  /** Moneda de la cuenta (ISO 4217). Por defecto la principal del usuario */
  currency?: string;
  /** Saldo convertido a la moneda principal, lo calcula el servidor */
  balance_main?: number;
  /** Momento del último saldo real confirmado (snapshot del ledger) */
  balance_as_of?: string;
  /** Idempotencia de creaciones confirmadas por el asistente */
  assistant_action_id?: string;
}

export interface Transaction {
  _id: string;
  concept: string;
  amount: number;
  /** gasto | ingreso | transferencia | pago_tarjeta | ajuste */
  kind: TxKind;
  spent_at: string;
  source?: "manual" | "voz" | "banco";
  auto_categorized?: YesNo;
  notes?: string;
  category?: Category | string | null;
  bank_account?: BankAccount | string | null;
  /** Cuenta destino en transferencias y pagos de tarjeta */
  transfer_account?: BankAccount | string | null;
  /** Momento desde el que el movimiento afecta al saldo derivado */
  balance_effective_at?: string;
  /** Idempotencia de creaciones confirmadas por el asistente */
  assistant_action_id?: string;
  voice_note?: VoiceNote | string | null;
  createdAt?: string;
}

export interface Budget {
  _id: string;
  month: string;
  limit_amount: number;
  alert_threshold?: number;
  category?: Category | string | null;
  /** Idempotencia de creaciones confirmadas por el asistente */
  assistant_action_id?: string;
}

export interface BudgetProgress {
  _id: string;
  month: string;
  limit_amount: number;
  alert_threshold: number;
  spent: number;
  pct: number;
  category: { _id: string; name: string; color: string; emoji: string } | null;
}

export interface SavingsGoal {
  _id: string;
  title: string;
  target_amount: number;
  saved_amount?: number;
  monthly_contribution?: number;
  deadline?: string;
  status?: "activa" | "pausada" | "completada";
  notes?: string;
  /** Idempotencia de creaciones confirmadas por el asistente */
  assistant_action_id?: string;
  voice_note?: VoiceNote | string | null;
}

export interface OutingPlan {
  _id: string;
  title: string;
  planned_at?: string;
  estimated_cost?: number;
  max_recommended?: number;
  real_cost?: number;
  ai_advice?: string;
  status?: "planificada" | "realizada" | "cancelada";
  /** Idempotencia de creaciones confirmadas por el asistente */
  assistant_action_id?: string;
  voice_note?: VoiceNote | string | null;
}

export interface AppNotification {
  _id: string;
  title: string;
  message?: string;
  severity?: "info" | "aviso" | "critica";
  is_read?: YesNo;
  createdAt?: string;
}

/** Estados del ciclo de vida de una nota de voz (incluye `error` por compatibilidad histórica) */
export type VoiceNoteStatus =
  | "pendiente_confirmacion"
  | "procesando"
  | "procesada"
  | "error_confirmacion"
  | "cancelada"
  | "error";

export interface VoiceNote {
  _id: string;
  title?: string;
  transcription?: string;
  ai_summary?: string;
  /** Sobre JSON del plan, acciones completadas y resultados del reintento */
  ai_result?: unknown;
  status?: VoiceNoteStatus;
  createdAt?: string;
  audio_file?: { name: string; url?: string } | null;
}

export interface WeeklyReport {
  _id: string;
  title: string;
  period_start?: string;
  period_end?: string;
  total_spent?: number;
  total_income?: number;
  health_score?: number;
  content?: string;
  sent_by_email?: YesNo;
  pdf_file?: { name: string; url?: string } | null;
  createdAt?: string;
}

export interface DashboardData {
  month: string;
  monthLabel: string;
  /** Moneda en la que vienen TODOS los importes agregados de este objeto */
  currency: string;
  /** { CODIGO: unidades de la moneda principal por 1 unidad de esa divisa } */
  exchangeRates: Record<string, number>;
  income: number;
  expense: number;
  /** Volumen movido entre cuentas propias: no es gasto ni ingreso */
  internalMoved: number;
  balance: number;
  budgetTotal: number;
  budgetSpent: number;
  /** Motor determinista "disponible para gastar", con su desglose explicable */
  safeToSpend: SafeToSpend;
  netWorth: NetWorth;
  /** Límite diario recomendado (= safeToSpend.dailyLimit) */
  dailySafeSpend: number;
  daysLeft: number;
  savedTotal: number;
  savingsTarget: number;
  healthScore: number;
  healthComponents: HealthComponent[];
  avgMonthlyExpense: number;
  budgets: BudgetProgress[];
  categoryBreakdown: { name: string; color: string; emoji: string; amount: number }[];
  monthlySeries: { month: string; label: string; income: number; expense: number }[];
  dailySeries: { day: string; amount: number }[];
  goals: SavingsGoal[];
  outings: OutingPlan[];
  recentTransactions: Transaction[];
  accounts: BankAccount[];
  notifications: AppNotification[];
  unreadCount: number;
}
