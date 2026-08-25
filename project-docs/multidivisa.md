# Multidivisa en Finestres (moneda nativa: DOP)

Finestres maneja varias monedas a la vez y muestra **todos los totales en la moneda
principal del usuario**, que por defecto es el **peso dominicano (DOP)**.

## Modelo de datos

| Dónde | Campo | Qué guarda |
|---|---|---|
| `user_setting` | `main_currency` | Código ISO 4217 de la moneda principal (`DOP` por defecto) |
| `user_setting` | `exchange_rates` | JSON `{ "USD": 60, "EUR": 65, ... }` = cuántas unidades de la moneda principal vale **1 unidad** de esa divisa |
| `user_setting` | `user` | `objectReference` (manyToOne) → `user` |
| `bank_account` | `currency` | Moneda de esa cuenta o tarjeta |

**Por qué una tabla aparte y no campos en `user`:** en este proyecto la tabla de
autenticación `user` tiene todos sus campos con restricción de unicidad, así que
dos usuarios no podrían tener la misma moneda principal (`Already exists a record
on the table user with the value 'DOP'`). Los ajustes viven en `user_setting`.

## Reglas

1. Cada **cuenta** guarda su saldo en **su** moneda.
2. Un **movimiento** hereda la moneda de la cuenta a la que pertenece. Si no tiene
   cuenta, se asume la moneda principal.
3. Todo lo **agregado** (patrimonio, disponible para gastar, presupuestos, salud
   financiera, informes, CSV/PDF, contexto que se le pasa a la IA) se convierte a
   la moneda principal antes de sumarse.
4. Las listas de movimientos y las tarjetas de cuenta se muestran **en su moneda
   original**, con el equivalente en la principal debajo cuando difieren.
5. No hay servicio externo de cotizaciones: **los tipos de cambio los pone el
   usuario** en Perfil → Monedas. No hace falta ninguna API key.
6. Al cambiar de moneda principal, las tasas se **reexpresan en la nueva base**
   (`rebaseRates`): con base DOP y `USD = 60`, al pasar a base USD queda
   `DOP = 0.01666667` y `EUR = 1.08333333`.

## Dónde está el código

| Archivo | Responsabilidad |
|---|---|
| `src/lib/currency.ts` | Módulo **puro**: catálogo de divisas, `formatMoney`, `convertAmount`, `parseRates`, `rebaseRates`, `txCurrency`. Se importa igual desde cliente y servidor |
| `src/lib/user-currency.ts` | Servidor: leer/guardar `user_setting`. `saveCurrencySettings` **relee y verifica** lo guardado y lanza si no coincide |
| `src/components/CurrencyProvider.tsx` | Contexto cliente. `useCurrency()` → `{ money, toMain, mainCurrency, symbol, rates }` |
| `src/components/CurrencyPicker.tsx` | Selector de divisa reutilizable |
| `src/app/api/settings/route.ts` | `GET`/`PUT` de moneda principal y tipos de cambio |
| `src/lib/finance.ts` | `buildDashboard` convierte cuentas y movimientos a la moneda principal antes de calcular |

`DashboardData` incluye ahora `currency` y `exchangeRates`; `BankAccount` incluye
`balance_main` (saldo ya convertido, lo calcula el servidor).

## Formato

Se usa `Intl.NumberFormat` con `currencyDisplay: "symbol"` (no `narrowSymbol`,
que colapsaría `RD$` y `US$` en un `$` ambiguo):

- DOP → `RD$1,234.50`
- USD → `US$1,234.50`
- EUR → `1.234,50 €`

## Divisas soportadas

`DOP`, `USD`, `EUR`, `CAD`, `GBP`, `MXN`, `COP`, `CHF` (`CURRENCIES` en
`src/lib/currency.ts`). Añadir una más es añadir una fila a ese array.
