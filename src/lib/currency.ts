export const BASE_CURRENCY = "DOP";

export const SUPPORTED_CURRENCIES = [
  { code: "DOP", label: "Peso dominicano", symbol: "RD$" },
  { code: "USD", label: "Dolar estadounidense", symbol: "US$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "Libra esterlina", symbol: "£" },
  { code: "CAD", label: "Dolar canadiense", symbol: "CA$" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

const SUPPORTED = new Set<string>(SUPPORTED_CURRENCIES.map((currency) => currency.code));

export function normalizeCurrency(value: unknown): CurrencyCode {
  const code = String(value || BASE_CURRENCY).trim().toUpperCase();
  return SUPPORTED.has(code) ? (code as CurrencyCode) : BASE_CURRENCY;
}

export function currencyLabel(currency: unknown): string {
  const code = normalizeCurrency(currency);
  const found = SUPPORTED_CURRENCIES.find((item) => item.code === code);
  return found ? `${found.code} · ${found.label}` : BASE_CURRENCY;
}

export function exchangeRateToBase(currency: unknown, value: unknown): number {
  const code = normalizeCurrency(currency);
  if (code === BASE_CURRENCY) return 1;
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

export function amountToBase(amount: unknown, currency: unknown, exchangeRate: unknown): number {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * exchangeRateToBase(currency, exchangeRate) * 100) / 100;
}

export function formatCurrency(value: number, currency: unknown = BASE_CURRENCY): string {
  const code = normalizeCurrency(currency);
  const locale = code === "DOP" || code === "USD" ? "es-DO" : "es-ES";
  return (value || 0).toLocaleString(locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatBaseCurrency(value: number): string {
  return formatCurrency(value, BASE_CURRENCY);
}
