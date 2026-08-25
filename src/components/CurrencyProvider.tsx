"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  DEFAULT_CURRENCY,
  convertAmount,
  currencySymbol,
  formatMoney,
  normalizeCurrency,
  parseRates,
  type ExchangeRates,
  type FormatMoneyOptions,
} from "@/lib/currency";

interface CurrencyContextValue {
  /** Moneda en la que se muestran los totales (DOP por defecto) */
  mainCurrency: string;
  rates: ExchangeRates;
  loading: boolean;
  /** Símbolo de la moneda principal, para etiquetas: «Importe (RD$)» */
  symbol: string;
  /** Formatea en la moneda indicada, o en la principal si se omite */
  money: (value: number, code?: string | null, opts?: FormatMoneyOptions) => string;
  /** Convierte un importe de `from` a la moneda principal */
  toMain: (value: number, from?: string | null) => number;
  /** Formatea un importe de otra divisa ya convertido a la principal */
  moneyInMain: (value: number, from?: string | null, opts?: FormatMoneyOptions) => string;
  /** Relee la configuración desde el servidor */
  refresh: () => Promise<void>;
}

const FALLBACK: ExchangeRates = parseRates(null, DEFAULT_CURRENCY);

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

interface Settings {
  main_currency?: string;
  exchange_rates?: ExchangeRates;
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [mainCurrency, setMainCurrency] = useState(DEFAULT_CURRENCY);
  const [rates, setRates] = useState<ExchangeRates>(FALLBACK);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await api.get<Settings>("/api/settings");
    if (!res.ok || !res.data) {
      // 401 en páginas públicas es lo normal: seguimos con DOP por defecto.
      console.log("[Divisas] sin configuración del servidor, uso DOP por defecto");
      setLoading(false);
      return;
    }
    const code = normalizeCurrency(res.data.main_currency || DEFAULT_CURRENCY);
    setMainCurrency(code);
    setRates(parseRates(res.data.exchange_rates as any, code));
    setLoading(false);
    console.log("[Divisas] moneda principal:", code);
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => {
      refresh();
    };
    window.addEventListener("finestres:currency", onChange);
    return () => window.removeEventListener("finestres:currency", onChange);
  }, [refresh]);

  const value = useMemo<CurrencyContextValue>(() => {
    const money = (v: number, code?: string | null, opts?: FormatMoneyOptions) =>
      formatMoney(v, code ? normalizeCurrency(code) : mainCurrency, opts);
    const toMain = (v: number, from?: string | null) =>
      convertAmount(v, from || mainCurrency, mainCurrency, rates, mainCurrency);
    return {
      mainCurrency,
      rates,
      loading,
      symbol: currencySymbol(mainCurrency),
      money,
      toMain,
      moneyInMain: (v, from, opts) => money(toMain(v, from), mainCurrency, opts),
      refresh,
    };
  }, [mainCurrency, rates, loading, refresh]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/**
 * Acceso a la moneda del usuario desde cualquier componente cliente.
 * Fuera del provider devuelve DOP, para que un componente aislado (o un test)
 * nunca reviente por falta de contexto.
 */
export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (ctx) return ctx;
  const money = (v: number, code?: string | null, opts?: FormatMoneyOptions) =>
    formatMoney(v, code ? normalizeCurrency(code) : DEFAULT_CURRENCY, opts);
  return {
    mainCurrency: DEFAULT_CURRENCY,
    rates: FALLBACK,
    loading: false,
    symbol: currencySymbol(DEFAULT_CURRENCY),
    money,
    toMain: (v) => v,
    moneyInMain: (v, _from, opts) => money(v, DEFAULT_CURRENCY, opts),
    refresh: async () => {},
  };
}

/** Avisa a toda la app de que la configuración de divisas ha cambiado. */
export function notifyCurrencyChange() {
  window.dispatchEvent(new Event("finestres:currency"));
}
