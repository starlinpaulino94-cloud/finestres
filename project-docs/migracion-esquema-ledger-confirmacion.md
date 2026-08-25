# Migración de esquema: ledger de saldos e idempotencia del asistente

Fecha de aplicación: 2026-08-25
Aplicada con Totalum MCP sobre la base de datos del proyecto.

## Paso 0 — inspección previa

`getAllDatabaseTables()` ejecutado antes de tocar nada. `structureId` localizados:

| Tabla | structureId |
|---|---|
| `user` | `6a8889447d275fac57252ea0` |
| `category` | `6a8889617d275fac57252ef9` |
| `bank_account` | `6a88896b02da156bc747aa19` |
| `savings_goal` | `6a88897602da156bc747aa22` |
| `voice_note` | `6a888980f2b880af3543f7b0` |
| `outing_plan` | `6a88898a02da156bc747aa27` |
| `transaction` | `6a888998efdd3323b242dd87` |
| `budget` | `6a8889a3f2b880af3543f7c5` |

Ningún campo existía ya con el mismo nombre y otro tipo, así que no hizo falta ninguna migración manual con respaldo.

## Campos creados

| Tabla | Campo | Tipo |
|---|---|---|
| `bank_account` | `balance_as_of` | `date` (`includeHour: true`) |
| `bank_account` | `assistant_action_id` | `string` (text) |
| `transaction` | `balance_effective_at` | `date` (`includeHour: true`) |
| `transaction` | `assistant_action_id` | `string` (text) |
| `category` | `assistant_action_id` | `string` (text) |
| `budget` | `assistant_action_id` | `string` (text) |
| `savings_goal` | `assistant_action_id` | `string` (text) |
| `outing_plan` | `assistant_action_id` | `string` (text) |

## Campos que ya existían (no duplicados)

- `voice_note.ai_result` ya era `long-string` / `json`. Se conserva tal cual.
- `transaction.voice_note` y `outing_plan.voice_note` ya eran `objectReference` `manyToOne` → `voice_note`.

## Relación creada

- `savings_goal.voice_note` → `objectReference` `manyToOne` hacia `voice_note` (era la única de las tres que faltaba).

## Relaciones existentes confirmadas

`transaction.bank_account`, `transaction.transfer_account` (ambas → `bank_account`), `transaction.category`, `budget.category`, y los campos `user` de `transaction`, `bank_account`, `category`, `budget`, `savings_goal`, `outing_plan` y `voice_note` — todas `objectReference` `manyToOne` apuntando a la tabla correcta.

## `voice_note.status`

Ampliado conservando los `id` de las opciones existentes (`procesada`, `error`), por lo que **los registros históricos no se invalidan**. Opciones finales:

`pendiente_confirmacion`, `procesando`, `procesada`, `error_confirmacion`, `cancelada`, `error`

## Verificación de esquema ejecutada

Segundo `getAllDatabaseTables()` tras los cambios:

- `balance_as_of` y `balance_effective_at` con `includeHour: true`. ✅
- Las tres relaciones a `voice_note` son `objectReference`, no strings. ✅
- `voice_note.status` incluye los seis valores. ✅
- `_offset` correcto: `category` (19 registros) con `_limit: 5, _offset: 15` devuelve los 4 últimos. ✅
- `_filter: { user, assistant_action_id }` correcto: registro de prueba creado en `transaction`, recuperado por el filtro compuesto y **eliminado después**; `balance_effective_at` conservó la hora. La tabla quedó vacía de nuevo. ✅

## Sobre la unicidad de `assistant_action_id`

Totalum MCP no expone creación de índices ni de restricciones únicas compuestas, así que **no hay unicidad a nivel de base de datos**. La idempotencia queda como consulta previa desde la app (`_filter: { user, assistant_action_id }`, verificada arriba): protege ante reenvíos secuenciales, pero frente a dos procesos concurrentes sigue siendo de mejor esfuerzo, tal y como anticipaba el plan de migración.

## Activación del ledger

No se ha rellenado `balance_as_of` de forma masiva. Las cuentas existentes conservan su saldo manual hasta que se registre un movimiento nuevo o se vuelva a confirmar el saldo.

## Pendiente: no cubierto por esta migración

Los puntos 3–6 de la verificación previa al despliegue prueban comportamiento de aplicación que **todavía no existe en el código de esta rama**: no hay flujo de borrador/confirmación/cancelación ni derivación de saldo. `src/app/api/voice/route.ts` escribe los registros directamente con `status: "procesada"`. Los nuevos campos están disponibles pero ningún módulo los lee ni los escribe aún.
