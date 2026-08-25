import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, serializeError } from "@/lib/finance";
import { getCurrencySettings, saveCurrencySettings } from "@/lib/user-currency";
import { CURRENCY_CODES, normalizeCurrency, parseRates, rebaseRates } from "@/lib/currency";

const schema = z.object({
  main_currency: z.string().min(3).max(4).optional(),
  exchange_rates: z.record(z.string(), z.number().positive()).optional(),
});

/** Devuelve la moneda principal y los tipos de cambio del usuario. */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const settings = await getCurrencySettings(user.id);
    return NextResponse.json({
      ok: true,
      data: { main_currency: settings.mainCurrency, exchange_rates: settings.rates },
    });
  } catch (err) {
    console.error("[API ERROR] GET /api/settings", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}

/** Actualiza la moneda principal y/o los tipos de cambio. */
export async function PUT(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: { message: "No autenticado" } }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const current = await getCurrencySettings(user.id);

    let mainCurrency = current.mainCurrency;
    if (parsed.data.main_currency) {
      const code = normalizeCurrency(parsed.data.main_currency);
      if (!CURRENCY_CODES.includes(code)) {
        return NextResponse.json(
          { ok: false, error: { message: `Moneda no soportada: ${code}` } },
          { status: 400 }
        );
      }
      mainCurrency = code;
    }

    if (!parsed.data.main_currency && !parsed.data.exchange_rates) {
      return NextResponse.json({ ok: false, error: { message: "Nada que actualizar" } }, { status: 400 });
    }

    // Al cambiar de moneda principal hay que reexpresar TODAS las tasas en la
    // nueva base; si no, se seguirían aplicando las de la base anterior.
    const rebased =
      mainCurrency === current.mainCurrency
        ? current.rates
        : rebaseRates(current.rates, current.mainCurrency, mainCurrency);

    // Las tasas recibidas se fusionan sobre lo guardado, para poder enviar sólo
    // la que el usuario acaba de editar.
    const rates = parseRates(
      JSON.stringify({ ...rebased, ...(parsed.data.exchange_rates || {}) }),
      mainCurrency
    );

    const updated = await saveCurrencySettings(user.id, { mainCurrency, rates });
    console.log("[API] divisas actualizadas:", user.id, updated.mainCurrency);
    return NextResponse.json({
      ok: true,
      data: { main_currency: updated.mainCurrency, exchange_rates: updated.rates },
    });
  } catch (err) {
    console.error("[API ERROR] PUT /api/settings", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
