# Migración de esquema Totalum requerida

No aplicar directamente en producción sin copia de seguridad. El código de esta rama compila sin la migración, pero el flujo de confirmación y el ledger de saldos necesitan estos campos persistentes.

## Paso 0: inspección obligatoria

Antes de crear o editar campos, ejecutar `getAllDatabaseTables()` en Totalum MCP y localizar los `structureId` de estas tablas:

- `bank_account`
- `transaction`
- `voice_note`
- `category`
- `budget`
- `savings_goal`
- `outing_plan`
- `user`

Si un campo ya existe con el mismo nombre y tipo, no duplicarlo. Si existe con otro tipo, detenerse y decidir una migración manual con respaldo.

## Campos nuevos

| Tabla | Campo | Tipo Totalum | Uso |
|---|---|---|---|
| `bank_account` | `balance_as_of` | `date` con `includeHour: true` | Momento del último saldo real confirmado. |
| `bank_account` | `currency` | `options` | Moneda de la cuenta: `DOP`, `USD`, `EUR`, `GBP`, `CAD`. |
| `bank_account` | `exchange_rate_to_base` | `number` | Tasa manual: 1 unidad de la moneda de la cuenta equivale a X DOP. |
| `transaction` | `balance_effective_at` | `date` con `includeHour: true` | Momento desde el que el movimiento afecta al saldo derivado. |
| `transaction` | `currency` | `options` | Moneda original del movimiento. |
| `transaction` | `exchange_rate_to_base` | `number` | Tasa usada para convertir el movimiento a DOP. |
| `transaction` | `amount_base` | `number` | Importe convertido a DOP para reportes y dashboard. |
| `transaction` | `assistant_action_id` | `string` | Idempotencia de creaciones confirmadas. |
| `bank_account` | `assistant_action_id` | `string` | Idempotencia de creaciones confirmadas. |
| `category` | `assistant_action_id` | `string` | Idempotencia de creaciones confirmadas. |
| `budget` | `assistant_action_id` | `string` | Idempotencia de creaciones confirmadas. |
| `savings_goal` | `assistant_action_id` | `string` | Idempotencia de creaciones confirmadas. |
| `outing_plan` | `assistant_action_id` | `string` | Idempotencia de creaciones confirmadas. |

`assistant_action_id` debe indexarse y, si Totalum lo permite, tener unicidad compuesta con `user`. Sin una restricción única, la app evita duplicados por consulta previa; la garantía frente a dos procesos concurrentes seguirá siendo de mejor esfuerzo.

## Propiedades a crear

Usar `createTableProperty()` con el `structureId` real de cada tabla.

```ts
// bank_account
{
  name: "currency",
  label: "Currency",
  propertyType: "options",
  typeExtras: {
    options: [
      { value: "DOP", color: "#22c55e" },
      { value: "USD", color: "#2563eb" },
      { value: "EUR", color: "#7c3aed" },
      { value: "GBP", color: "#0f766e" },
      { value: "CAD", color: "#dc2626" }
    ],
    optionsConfig: { multiple: false }
  }
}
{
  name: "exchange_rate_to_base",
  label: "Exchange Rate To Base",
  propertyType: "number"
}
{
  name: "balance_as_of",
  label: "Balance As Of",
  propertyType: "date",
  typeExtras: { date: { includeHour: true } }
}
{
  name: "assistant_action_id",
  label: "Assistant Action ID",
  propertyType: "string",
  typeExtras: { string: { type: "text" } }
}

// transaction
{
  name: "currency",
  label: "Currency",
  propertyType: "options",
  typeExtras: {
    options: [
      { value: "DOP", color: "#22c55e" },
      { value: "USD", color: "#2563eb" },
      { value: "EUR", color: "#7c3aed" },
      { value: "GBP", color: "#0f766e" },
      { value: "CAD", color: "#dc2626" }
    ],
    optionsConfig: { multiple: false }
  }
}
{
  name: "exchange_rate_to_base",
  label: "Exchange Rate To Base",
  propertyType: "number"
}
{
  name: "amount_base",
  label: "Amount Base",
  propertyType: "number"
}
{
  name: "balance_effective_at",
  label: "Balance Effective At",
  propertyType: "date",
  typeExtras: { date: { includeHour: true } }
}
{
  name: "assistant_action_id",
  label: "Assistant Action ID",
  propertyType: "string",
  typeExtras: { string: { type: "text" } }
}

// category, budget, savings_goal, outing_plan
{
  name: "assistant_action_id",
  label: "Assistant Action ID",
  propertyType: "string",
  typeExtras: { string: { type: "text" } }
}

// voice_note
{
  name: "ai_result",
  label: "AI Result",
  propertyType: "long-string",
  typeExtras: { "long-string": { type: "json" } }
}
```

## Relaciones

- Confirmar o crear `transaction.voice_note`, `savings_goal.voice_note` y `outing_plan.voice_note` como `objectReference` `manyToOne` hacia `voice_note`.
- Confirmar que las relaciones existentes `transaction.bank_account`, `transaction.transfer_account`, `transaction.category`, `budget.category` y todos los campos `user` apuntan a sus tablas correctas.

Propiedad tipo para las tres relaciones nuevas:

```ts
{
  name: "voice_note",
  label: "Voice Note",
  propertyType: "objectReference",
  objectReference: {
    objectReferenceTypeId: "voice_note",
    objectReferenceRelation: "manyToOne"
  }
}
```

## Estado de `voice_note`

El campo `voice_note.status` debe aceptar estas opciones:

- `pendiente_confirmacion`
- `procesando`
- `procesada`
- `error_confirmacion`
- `cancelada`
- `error` (compatibilidad histórica)

`voice_note.ai_result` debe ser `long-string`/JSON, porque almacena el sobre JSON del plan, los identificadores de acciones completadas y los resultados del reintento. Si el campo ya existe como texto largo compatible, mantenerlo y solo comprobar que acepta JSON extenso.

## Verificación de esquema

Después de crear propiedades, volver a ejecutar `getAllDatabaseTables()` y comprobar:

- Los campos de fecha tienen `includeHour: true`.
- `bank_account.currency` y `transaction.currency` existen y aceptan `DOP`, `USD`, `EUR`, `GBP`, `CAD`.
- `bank_account.exchange_rate_to_base`, `transaction.exchange_rate_to_base` y `transaction.amount_base` existen como `number`.
- Las relaciones a `voice_note` son `objectReference` y no strings.
- `voice_note.status` incluye todos los valores anteriores.
- Las consultas por `_offset` siguen funcionando en tablas con más de una página.
- Las consultas por `_filter: { user, assistant_action_id }` funcionan en las tablas donde se creó `assistant_action_id`.

## Activación segura del ledger

- No rellenar `balance_as_of` masivamente con una fecha histórica.
- Para cuentas existentes, el código conserva el saldo manual sin derivarlo hasta que se registra el primer movimiento nuevo o se vuelve a confirmar el saldo.
- Al confirmar manualmente un saldo, la app guarda ese valor como nuevo snapshot y solo deriva movimientos posteriores.

## Verificación previa al despliegue

1. Crear o comprobar todos los campos y relaciones anteriores en un entorno de prueba.
2. Verificar que Totalum permite consultar por `assistant_action_id` y por `_offset`.
3. Crear un borrador, cancelarlo y comprobar que no aparece ningún registro financiero nuevo.
4. Confirmar un borrador y reenviar la misma confirmación: no debe duplicar registros.
5. Crear una cuenta con saldo 1.000, registrar un gasto de 25 y comprobar que el saldo mostrado es 975.
6. Editar y eliminar ese gasto; el saldo debe recalcularse sin escrituras compensatorias.
7. Crear una cuenta USD con tasa 58.50, registrar un gasto de 10 USD y comprobar que los totales del dashboard suman 585 DOP.
