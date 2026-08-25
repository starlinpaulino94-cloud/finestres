import "server-only";
import { totalumSdk } from "@/lib/totalum";
import {
  DEFAULT_CURRENCY,
  normalizeCurrency,
  parseRates,
  serializeRates,
  type ExchangeRates,
} from "@/lib/currency";

/**
 * Las preferencias viven en `user_setting`, NO en `user`: en este proyecto la
 * tabla de autenticación tiene todos sus campos marcados como únicos, así que
 * dos usuarios no podrían compartir la misma moneda principal.
 */
export const USER_SETTING_TABLE = "user_setting";

export interface CurrencySettings {
  /** Moneda en la que se muestran todos los totales (por defecto DOP) */
  mainCurrency: string;
  /** { CODIGO: unidades de la moneda principal por 1 unidad de esa divisa } */
  rates: ExchangeRates;
  /** _id del registro de ajustes, o null si el usuario aún no tiene */
  settingId: string | null;
}

/** Registro crudo de ajustes del usuario, o null si todavía no existe. */
export async function findUserSetting(userId: string): Promise<any | null> {
  const res = await totalumSdk.crud.query(USER_SETTING_TABLE, {
    _filter: { user: userId },
    _sort: { createdAt: "asc" },
    _limit: 1,
  });
  return ((res.data as any[]) || [])[0] || null;
}

/**
 * Lee la configuración de divisas del usuario. Nunca lanza: si la consulta
 * falla, devuelve los valores por defecto (DOP) y lo deja escrito en el log,
 * porque un fallo aquí no debe tumbar el dashboard entero.
 */
export async function getCurrencySettings(userId: string): Promise<CurrencySettings> {
  try {
    const record = await findUserSetting(userId);
    const mainCurrency = normalizeCurrency(record?.main_currency || DEFAULT_CURRENCY);
    return {
      mainCurrency,
      rates: parseRates(record?.exchange_rates, mainCurrency),
      settingId: record?._id || null,
    };
  } catch (err) {
    console.error("[currency] no he podido leer las divisas del usuario:", userId, err);
    return {
      mainCurrency: DEFAULT_CURRENCY,
      rates: parseRates(null, DEFAULT_CURRENCY),
      settingId: null,
    };
  }
}

/**
 * Crea o actualiza los ajustes del usuario y devuelve lo que ha quedado
 * guardado de verdad (relectura). Si el valor guardado no coincide con el
 * pedido, lanza: un ajuste que se pierde en silencio es peor que un error.
 */
export async function saveCurrencySettings(
  userId: string,
  update: { mainCurrency?: string; rates?: ExchangeRates }
): Promise<CurrencySettings> {
  const current = await getCurrencySettings(userId);
  const mainCurrency = normalizeCurrency(update.mainCurrency || current.mainCurrency);
  const rates = update.rates || current.rates;

  const payload = {
    main_currency: mainCurrency,
    exchange_rates: serializeRates(rates),
  };

  if (current.settingId) {
    await totalumSdk.crud.editRecordById(USER_SETTING_TABLE, current.settingId, payload);
  } else {
    await totalumSdk.crud.createRecord(USER_SETTING_TABLE, { ...payload, user: userId });
  }

  const saved = await getCurrencySettings(userId);
  if (saved.mainCurrency !== mainCurrency) {
    console.error("[currency] la moneda principal no se ha guardado:", {
      userId,
      pedida: mainCurrency,
      guardada: saved.mainCurrency,
    });
    throw new Error("No se ha podido guardar la moneda principal");
  }
  console.log("[currency] ajustes guardados:", userId, saved.mainCurrency);
  return saved;
}

/** Crea los ajustes iniciales (DOP) si el usuario todavía no los tiene. */
export async function ensureCurrencySettings(userId: string): Promise<CurrencySettings> {
  const current = await getCurrencySettings(userId);
  if (current.settingId) return current;
  return saveCurrencySettings(userId, {
    mainCurrency: DEFAULT_CURRENCY,
    rates: parseRates(null, DEFAULT_CURRENCY),
  });
}
