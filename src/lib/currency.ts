/**
 * Soporte multidivisa de Finestres.
 *
 * Módulo PURO (sin I/O, sin SDK): se importa igual desde el servidor y desde
 * componentes cliente. Reglas del modelo:
 *
 *  - Cada cuenta (`bank_account.currency`) guarda su saldo en SU moneda.
 *  - Un movimiento hereda la moneda de la cuenta a la que pertenece; si no
 *    tiene cuenta, se asume la moneda principal del usuario.
 *  - Todos los totales agregados (patrimonio, disponible para gastar,
 *    presupuestos, informes) se convierten a la MONEDA PRINCIPAL del usuario,
 *    que por defecto es el peso dominicano (DOP).
 *  - `exchange_rates` es un mapa { CODIGO: cuántas unidades de la moneda
 *    principal vale 1 unidad de esa divisa }. La principal siempre vale 1.
 */

export const DEFAULT_CURRENCY = "DOP";

export interface CurrencyMeta {
  code: string;
  /** Nombre en español, tal y como se muestra en los selectores */
  name: string;
  /** Símbolo corto para etiquetas de formulario: «Importe (RD$)» */
  symbol: string;
  /** Locale usado para separadores de miles y decimales */
  locale: string;
}

/**
 * Divisas soportadas. DOP primero por ser la moneda nativa del usuario.
 * Las demás son las que se usan a diario en República Dominicana.
 */
export const CURRENCIES: CurrencyMeta[] = [
  { code: "DOP", name: "Peso dominicano", symbol: "RD$", locale: "es-DO" },
  { code: "USD", name: "Dólar estadounidense", symbol: "US$", locale: "es-DO" },
  { code: "EUR", name: "Euro", symbol: "€", locale: "es-ES" },
  { code: "CAD", name: "Dólar canadiense", symbol: "CAD", locale: "es-DO" },
  { code: "GBP", name: "Libra esterlina", symbol: "£", locale: "en-GB" },
  { code: "MXN", name: "Peso mexicano", symbol: "MXN", locale: "es-DO" },
  { code: "COP", name: "Peso colombiano", symbol: "COP", locale: "es-DO" },
  { code: "CHF", name: "Franco suizo", symbol: "CHF", locale: "de-CH" },
];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

/**
 * Tipos de cambio de partida (unidades de DOP por 1 unidad de la divisa).
 * Son sólo un punto de partida editable desde Perfil → Monedas: la app nunca
 * llama a un servicio externo, así que el usuario manda sobre estos valores.
 */
export const DEFAULT_RATES_DOP: Record<string, number> = {
  USD: 60,
  EUR: 65,
  CAD: 44,
  GBP: 76,
  MXN: 3.2,
  COP: 0.015,
  CHF: 68,
};

export function currencyMeta(code?: string | null): CurrencyMeta {
  const normalized = normalizeCurrency(code);
  return (
    CURRENCIES.find((c) => c.code === normalized) || {
      code: normalized,
      name: normalized,
      symbol: normalized,
      locale: "es-DO",
    }
  );
}

/** Normaliza cualquier entrada a un código ISO en mayúsculas. */
export function normalizeCurrency(code?: string | null): string {
  const clean = String(code || "").trim().toUpperCase();
  return clean || DEFAULT_CURRENCY;
}

export function currencySymbol(code?: string | null): string {
  return currencyMeta(code).symbol;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(code: string, decimals: number): Intl.NumberFormat {
  const key = `${code}:${decimals}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const meta = currencyMeta(code);
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat(meta.locale, {
      style: "currency",
      currency: meta.code,
      // `symbol` mantiene RD$ y US$ distinguibles; `narrowSymbol` los colapsa a «$».
      currencyDisplay: "symbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch (err) {
    // Un código raro no debe romper la vista.
    console.error("[currency] no puedo formatear en", code, err);
    fmt = new Intl.NumberFormat("es-DO", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  formatterCache.set(key, fmt);
  return fmt;
}

export interface FormatMoneyOptions {
  /** Sin decimales (ejes de gráficas, cifras grandes) */
  decimals?: number;
}

/** Formatea un importe en su moneda: `formatMoney(1234.5)` → `RD$1,234.50`. */
export function formatMoney(
  value: number,
  code: string = DEFAULT_CURRENCY,
  opts: FormatMoneyOptions = {}
): string {
  const decimals = opts.decimals ?? 2;
  return getFormatter(normalizeCurrency(code), decimals).format(value || 0);
}

export type ExchangeRates = Record<string, number>;

/**
 * Convierte un importe de `from` a `to` usando el mapa de tasas del usuario,
 * expresadas en unidades de `main` por 1 unidad de la divisa.
 * Si falta una tasa devuelve el importe sin tocar y lo avisa por consola:
 * es preferible un número aproximado y visible a un 0 silencioso.
 */
export function convertAmount(
  value: number,
  from: string,
  to: string,
  rates: ExchangeRates,
  main: string = DEFAULT_CURRENCY
): number {
  const src = normalizeCurrency(from);
  const dst = normalizeCurrency(to);
  if (!value || src === dst) return value || 0;

  const rateOf = (code: string): number | null => {
    if (code === normalizeCurrency(main)) return 1;
    const r = Number(rates?.[code]);
    return Number.isFinite(r) && r > 0 ? r : null;
  };

  const srcRate = rateOf(src);
  const dstRate = rateOf(dst);
  if (srcRate === null || dstRate === null) {
    console.warn("[currency] falta el tipo de cambio para", srcRate === null ? src : dst);
    return value;
  }
  return Math.round(((value * srcRate) / dstRate) * 100) / 100;
}

/** Lee `user.exchange_rates` (JSON en texto) sin reventar si viene corrupto. */
export function parseRates(raw: unknown, main: string = DEFAULT_CURRENCY): ExchangeRates {
  const base: ExchangeRates = { ...DEFAULT_RATES_DOP };
  let stored: any = raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      stored = JSON.parse(raw);
    } catch (err) {
      console.error("[currency] exchange_rates no es JSON válido, uso los valores por defecto:", err);
      stored = null;
    }
  }
  if (stored && typeof stored === "object") {
    for (const [code, value] of Object.entries(stored as Record<string, unknown>)) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) base[normalizeCurrency(code)] = n;
    }
  }
  base[normalizeCurrency(main)] = 1;
  return base;
}

/**
 * Reexpresa el mapa de tasas cuando el usuario cambia de moneda principal.
 * Las tasas se guardan siempre «unidades de la principal por 1 unidad de X»,
 * así que al cambiar de base hay que dividir todo por la tasa de la nueva:
 * con base DOP y USD=62, al pasar a base USD queda DOP=1/62 y EUR=65/62.
 * Sin esto los totales se calcularían con tasas de la base anterior.
 */
export function rebaseRates(
  rates: ExchangeRates,
  oldMain: string,
  newMain: string
): ExchangeRates {
  const from = normalizeCurrency(oldMain);
  const to = normalizeCurrency(newMain);
  if (from === to) return { ...rates };

  const divisor = Number(rates?.[to]);
  if (!Number.isFinite(divisor) || divisor <= 0) {
    console.error("[currency] no puedo cambiar la base a", to, ": falta su tipo de cambio");
    return { ...rates };
  }

  // 8 decimales: con 6 el ida y vuelta entre bases perdía ~0,001 % por tasa.
  const round8 = (n: number) => Math.round(n * 1e8) / 1e8;
  const out: ExchangeRates = {};
  for (const [code, value] of Object.entries(rates || {})) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) out[normalizeCurrency(code)] = round8(n / divisor);
  }
  // La base anterior valía 1 en su propio sistema.
  out[from] = round8(1 / divisor);
  out[to] = 1;
  return out;
}

/** Serializa el mapa para guardarlo en `user.exchange_rates`. */
export function serializeRates(rates: ExchangeRates): string {
  const clean: ExchangeRates = {};
  for (const [code, value] of Object.entries(rates || {})) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) clean[normalizeCurrency(code)] = n;
  }
  return JSON.stringify(clean);
}

/**
 * Importes sugeridos para los botones de «aportar a la meta». Escalan con la
 * divisa: 25 tiene sentido en euros, pero en pesos dominicanos son calderilla.
 */
export function quickAddAmounts(code?: string | null): number[] {
  const rate = DEFAULT_RATES_DOP[normalizeCurrency(code)];
  // Sin tasa conocida asumimos que ES la moneda principal (DOP).
  if (!rate) return [500, 1000, 2500];
  if (rate >= 30) return [25, 50, 100];
  return [500, 1000, 2500];
}

/** Moneda de un movimiento: la de su cuenta, o la principal si no tiene. */
export function txCurrency(
  tx: { bank_account?: any } | null | undefined,
  main: string = DEFAULT_CURRENCY
): string {
  const acc = tx?.bank_account;
  if (acc && typeof acc === "object" && acc.currency) return normalizeCurrency(acc.currency);
  return normalizeCurrency(main);
}
