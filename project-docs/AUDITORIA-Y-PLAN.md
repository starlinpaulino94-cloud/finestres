# Finestres · Auditoría técnica, arquitectura objetivo y plan por fases

> Documento de **checkpoint** (fases 0-3 del proceso solicitado): diagnóstico completo del
> proyecto existente, arquitectura propuesta, priorización P0-P3 y plan de implementación.
> Incluye además el detalle de la **primera tanda de correcciones P0 ya aplicadas** (las que
> arreglaban errores reales de contabilidad y seguridad, no una reescritura).
>
> Fecha: 21 de agosto de 2026 · Estado del código: `npm run check-types-errors`, `npm run build`
> y `npm run test:finance` (46 comprobaciones) en verde.

---

## 1. Resumen de lo encontrado

Finestres es una app de finanzas personales **funcional y bien presentada**, con una capa de IA
real (Whisper + GPT vía Totalum) y siete pantallas operativas. No es un prototipo vacío: la
persistencia, la autenticación, las alertas, los informes en PDF y el envío por email funcionan.

El problema no era la falta de pantallas, sino que **el modelo financiero era demasiado simple
para ser correcto**:

- Un movimiento sólo podía ser `gasto` o `ingreso`. Un traspaso entre cuentas propias o el pago
  de la tarjeta se contabilizaban como **gasto**, inflando gastos, presupuestos y gráficas.
- El "puedes gastar hoy" era `(presupuesto − gastado) / días restantes`: ignoraba el dinero real
  en cuenta, la deuda de tarjeta, las reservas de metas y el colchón. Podía recomendar gastar
  dinero que no existía.
- No había patrimonio neto, ni distinción activo/pasivo.
- Toda ruta `PUT`/`DELETE` por id **no comprobaba la propiedad del registro** (IDOR): cualquier
  usuario autenticado podía editar o borrar movimientos, metas o cuentas de otro cambiando el id.
- Los cálculos vivían dentro de agregaciones ad-hoc, sin una sola función pura testeable, y sin
  ningún test.

---

## 2. Arquitectura actual

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | Next.js 15.3.9 App Router, React 19, TypeScript 5.8, Tailwind v4, shadcn/ui, lucide, sonner, next-themes | 7 pantallas de app + landing + legales + Stripe demo |
| Backend | Route Handlers de Next (`src/app/api/**`) | Convención `{ ok, data }` / `{ ok, error }` |
| Datos | Totalum SDK 3.0.8 (`crud.query/createRecord/editRecordById/deleteRecordById`) | 13 tablas, relaciones por `objectReference` |
| Auth | Better Auth + adaptador Totalum propio (`src/lib/better-auth-totalum-adapter.ts`) | email/contraseña; `session.user.id` |
| IA | Integraciones incorporadas de Totalum: `openai.createChatCompletion`, `files.transcribeAudio` | sin claves del usuario |
| Ficheros | `files.uploadFile`, `files.createPdfFromHtml` | audios de notas de voz, PDF de informes |
| Email | `email.sendEmail` | informe semanal |
| Edge | `src/middleware.ts` | CORS, CSP `frame-ancestors *`, puerta por cookie de sesión |
| Deploy | OpenNext + Cloudflare Workers (`wrangler.jsonc`) | gestionado por la plataforma |
| Logs | `pino`, `src/lib/backend-logger.ts`, `src/lib/console-logger.ts` | `npm-start.log`, `frontend.log` |

**Modelo de datos existente (13 tablas)**

`user`, `session`, `account`, `verification` (auth) · `category` · `bank_account` ·
`transaction` · `budget` · `savings_goal` · `outing_plan` · `voice_note` · `notification` ·
`weekly_report`.

Relaciones ya correctas: todo cuelga de `user` (manyToOne + inverso oneToMany);
`transaction → category / bank_account / voice_note / outing_plan`;
`budget → category`; `notification → category / budget / transaction`;
`outing_plan → voice_note`.

**Rutas API existentes**

`/api/auth/[...all]`, `/api/bootstrap`, `/api/dashboard`, `/api/transactions` (+`[id]`),
`/api/categories`, `/api/budgets`, `/api/accounts` (+`[id]`), `/api/goals` (+`[id]`),
`/api/outings` (+`[id]`), `/api/voice`, `/api/notifications` (+`/read`), `/api/reports`,
`/api/reports/weekly`, `/api/reports/export`, `/api/simulate` (nueva), y el bloque Stripe.

---

## 3. Funcionalidades que ya existen y funcionan

- **Asistente de voz completo**: audio → Whisper → GPT → crea movimientos, presupuestos, metas
  y salidas; guarda transcripción, resumen y JSON del plan en `voice_note`.
- **Panel** con KPIs, gráficas (flujo 6 meses, dona por categoría, barras diarias), presupuestos,
  metas, salidas, alertas y últimos movimientos.
- **Presupuestos** por categoría y mes, con upsert idempotente y umbral de alerta.
- **Alertas automáticas** al superar el umbral / el límite (tabla `notification` + campanita).
- **Metas de ahorro** con aporte mensual calculado y consejo de IA.
- **Planificador de salidas** con máximo recomendado.
- **Informe semanal** con IA + PDF + envío por email.
- **Exportación** PDF (estado de cuenta) y CSV/Excel del mes.
- **Cuentas y tarjetas** manuales con saldo editable y patrimonio agregado.
- **Bloqueo biométrico local** (WebAuthn de plataforma), **modo claro/oscuro**, responsive.
- **Arranque limpio por usuario** (`bootstrapUserData`), idempotente: crea sólo el catálogo de 19 categorías (estructura) y una notificación de bienvenida. **No genera ningún importe, cuenta, movimiento, meta ni presupuesto de ejemplo**: la cuenta nace vacía y el usuario la llena con sus datos reales guiado por la tarjeta «Primeros pasos» del panel.

---

## 4. Funcionalidades incompletas

| Función | Estado | Problema |
|---|---|---|
| Categorías | Parcial | Sólo crear y listar. Sin grupos, jerarquía, iconos editables, archivar, fusionar ni reasignar movimientos |
| Cuentas | Parcial | Faltan saldo disponible, límite de crédito, fecha de corte/pago, ocultar sin borrar, histórico de saldos |
| Movimientos | Parcial | Sin paginación real (tope 300), sin edición desde la UI, sin adjuntar recibo, sin tags ni splits |
| Categorización IA | Parcial | Sugiere pero no muestra confianza ni marca "revisar"; no aprende de las correcciones |
| Notas de voz | Parcial | **Escribe en la base de datos sin confirmación previa** del usuario (falta el paso preview → confirmar) |
| Informes | Parcial | Sólo semanal; sin mensual comparativo ni filtros por cuenta/categoría/tag |
| Alertas | Parcial | Sólo presupuesto; deduplicación por texto del título (frágil); sin preferencias por usuario |
| Salud financiera | Corregido | Antes 60/40 sin explicación; ahora 4 componentes explicados |
| Biometría | Por diseño | Es un **bloqueo local de conveniencia**: la credencial se registra en el navegador y no se verifica en servidor. No sustituye a la autenticación de la cuenta |

## 5. Funcionalidades ausentes

Tags · división de transacciones (splits) · motor de reglas · presupuestos semanales/anuales y
rollover · movimientos recurrentes y detección · suscripciones · deudas y estrategias
(avalancha/bola de nieve) · tarjetas de crédito con ciclo de facturación · inversiones ·
multimoneda real (todo está fijado a EUR) · calendario financiero · previsión (forecast) ·
importador CSV/Excel con preview y deduplicación · conciliación banco vs. movimientos ·
snapshots históricos de saldo y patrimonio · tool calling estructurado para la IA · insights
automáticos · buscador global · centro de privacidad y consentimientos · registro de auditoría ·
rate limiting · paginación servidor · fondo de emergencia como herramienta propia.

---

## 6. Deuda técnica encontrada

1. **Cálculos duplicados y dispersos** en `buildDashboard`, `/api/outings`, `/api/voice`,
   `/api/reports/*`, cada uno con su propia fórmula. *(corregido: núcleo único)*
2. **`float` para dinero**. Totalum sólo ofrece `number`; sin disciplina de redondeo las sumas
   derivan (`0.1 + 0.2`). *(mitigado: `round2`/`sumMoney` en toda frontera)*
3. **`/api/dashboard` construye el panel dos veces** por petición (una antes y otra después de
   generar alertas) y devuelve todo el estado de la app en un solo payload.
4. **Sin paginación**: el cliente descarga hasta 300-1000 movimientos y filtra en memoria.
5. **Deduplicación de notificaciones por cadena de texto** en lugar de una clave estable
   (`tipo + categoría + periodo + umbral`).
6. **Restos del módulo bancario eliminado**: opción `banco` en `transaction.source` (se mantiene
   por compatibilidad con registros antiguos) y campos `sync_status` / `last_sync_at` en
   `bank_account` *(eliminados del esquema en esta pasada)*.
7. **Bloque Stripe sin uso** (`/api/stripe/**`, `/stripe/*`): el producto no tiene pagos.
8. **Zona horaria** no modelada: se usa la hora local del servidor. Con Workers eso puede no
   coincidir con la del usuario en los cortes de día/mes.
9. **Sin tests** antes de esta pasada; ahora hay 46 comprobaciones del núcleo financiero.
10. **Errores de IA** sólo en consola: no hay métrica ni alerta de degradación.

---

## 7. Riesgos críticos

| # | Riesgo | Impacto | Estado |
|---|---|---|---|
| R1 | Transferencias y pagos de tarjeta contados como gasto | Todas las cifras del producto son falsas | **Corregido** |
| R2 | "Puedes gastar" basado sólo en presupuesto | La app recomienda gastar dinero inexistente | **Corregido** |
| R3 | IDOR en todas las rutas por id | Un usuario puede leer/modificar/borrar datos de otro | **Corregido** |
| R4 | La IA escribe movimientos sin confirmación | Datos financieros inventados por una transcripción mal entendida | Pendiente (P0) |
| R5 | Deriva de céntimos por `float` | Descuadres progresivos e imposibles de auditar | Mitigado |
| R6 | Sin auditoría ni histórico | Un dato mal cambiado no se puede reconstruir | Pendiente (P1) |
| R7 | Sin rate limiting en rutas que llaman a la IA | Coste y abuso | Pendiente (P1) |

---

## 8. Problemas de seguridad (detalle)

- **IDOR (crítico, corregido).** `PUT/DELETE /api/transactions/[id]`, `/api/goals/[id]`,
  `/api/accounts/[id]`, `/api/outings/[id]` y `POST /api/notifications/read` con `id` sólo
  comprobaban que hubiese sesión. Ahora todas pasan por `assertOwner(tabla, id, userId)`, que
  devuelve 404 si no existe y 403 si el registro es de otro usuario, y deja rastro en el log.
- **Validación de entrada.** `POST` usa zod; los `PUT` aceptaban cualquier `body`. Se ha añadido
  validación de importe (> 0), de tipo de movimiento y de coherencia origen/destino.
- **Secretos.** Correcto: `TOTALUM_API_KEY` y el resto viven en servidor; el cliente sólo llama a
  `/api/*` a través de `src/lib/api.ts`. No hay claves en el bundle.
- **Sesión.** El middleware sólo comprueba la *presencia* de la cookie (necesario en Edge); la
  validación real ocurre en cada handler con `getSessionUser()`. Correcto, pero conviene
  documentarlo para no confundirlo con autorización.
- **Biometría.** Es un desbloqueo local (WebAuthn + `localStorage`/`sessionStorage`). Borrar el
  almacenamiento lo desactiva: **no es autenticación de cuenta** y no debe presentarse como tal.
- **Pendiente:** rate limiting, registro de auditoría de acciones sensibles, centro de privacidad
  (exportar/eliminar datos, cerrar sesiones), cabeceras de seguridad más estrictas que
  `frame-ancestors *`.

---

## 9. Arquitectura propuesta

```
┌───────────────────────── UI (App Router, cliente) ─────────────────────────┐
│ pantallas + shadcn/ui · sólo consume /api vía src/lib/api.ts               │
└───────────────┬────────────────────────────────────────────────────────────┘
                │ { ok, data }
┌───────────────▼─────────── Route Handlers (servidor) ──────────────────────┐
│ auth + assertOwner + zod  →  servicios de dominio  →  Totalum SDK          │
└───────────────┬────────────────────────────────────────────────────────────┘
                │
┌───────────────▼─── Núcleo determinista (src/lib/finance-core.ts) ──────────┐
│ PURO, sin I/O, testeable: tipos de movimiento, redondeo en céntimos,       │
│ totales, presupuestos, patrimonio, disponible para gastar, simulador,      │
│ salud financiera, estimación del próximo ingreso                           │
└───────────────┬────────────────────────────────────────────────────────────┘
                │ cifras ya calculadas
┌───────────────▼─── Capa de IA (interpreta, nunca calcula) ─────────────────┐
│ voz → transcripción → extracción → PREVIEW → confirmación → escritura      │
│ explicaciones, consejos, informes. Si la IA cae, la app sigue funcionando. │
└────────────────────────────────────────────────────────────────────────────┘
```

**Principios**

1. Una sola fuente de verdad para cada cifra: el núcleo determinista.
2. La IA recibe cifras y devuelve texto. Nunca al revés. Todo valor que proponga se **acota** con
   los límites deterministas (ya aplicado en salidas y en el simulador).
3. Toda ruta por id verifica propiedad. Toda escritura valida y redondea a céntimos.
4. Cada función financiera crítica tiene test unitario antes de tocar la UI.

### Modelo de datos propuesto

Sobre las 13 tablas actuales (renombrar nada; reutilizar todo):

| Tabla | Acción | Contenido |
|---|---|---|
| `transaction` | **Ampliada** | `kind` ahora incluye `transferencia`, `pago_tarjeta`, `ajuste`; nuevo `transfer_account` (cuenta destino). Pendiente: `status` (pending/posted/cancelled/reversed), `external_id` (deduplicación), `merchant`, `posted_at`, `linked_transaction` |
| `bank_account` | **Limpiada** | Fuera `sync_status` y `last_sync_at`. Pendiente: `credit_limit`, `statement_day`, `payment_due_day`, `available_balance`, `hidden`, `institution` |
| `category` | Ampliar | `category_group` (objectReference), `archived`, `sort_order`, `parent_category` |
| `budget` | Ampliar | `period` (mensual/semanal/quincenal/anual), `rollover`, `start_date`, `end_date`, `paused` |
| `savings_goal` | Ampliar | `priority`, `frequency`, `bank_account` |
| Nuevas | Crear | `category_group`, `tag` (+ manyToMany con `transaction`), `transaction_split`, `transaction_rule`, `recurring_transaction`, `subscription`, `income_source`, `goal_contribution`, `debt`, `debt_payment`, `balance_snapshot`, `exchange_rate`, `financial_insight`, `ai_conversation`/`ai_message`, `audit_log`, `consent` |

No se crea ninguna tabla equivalente a otra existente: `voice_note` cubre `VoiceInput`,
`weekly_report` cubre `FinancialReport`, `notification` cubre `Notification`,
`outing_plan` es específico del producto y se mantiene.

---

## 10. Prioridades

### P0 — Fundamental (la base no puede estar mal)
- Motor de movimientos con tipos y sin dobles contabilizaciones ✅ **hecho**
- Redondeo y agregación en céntimos ✅ **hecho**
- Patrimonio neto (activos − pasivos) ✅ **hecho**
- Disponible para gastar determinista y explicable ✅ **hecho**
- Salud financiera con desglose ✅ **hecho**
- Autorización por propiedad en todas las rutas (IDOR) ✅ **hecho**
- Validación de entrada en escrituras ✅ **hecho**
- Tests del núcleo financiero ✅ **hecho** (46)
- Simulador de compras ✅ **hecho**
- Confirmación humana antes de que la IA escriba (preview de nota de voz) ⏳
- Categorías completas (grupos, editar, archivar, fusionar, reasignar) ⏳
- Tarjetas de crédito con ciclo (corte, vencimiento, pago mínimo, utilización) ⏳
- Paginación y filtros en servidor ⏳
- Registro de auditoría de acciones sensibles ⏳

### P1 — Importante
Presupuestos por periodo + rollover · movimientos recurrentes con detección · suscripciones ·
deudas con simulador de estrategias · fondo de emergencia · calendario financiero ·
importador CSV/Excel con preview y deduplicación · conciliación · informe mensual comparativo ·
snapshots históricos · tags · centro de privacidad · rate limiting · zona horaria del usuario.

### P2 — Avanzada
Tool calling estructurado de la IA · modo conversacional con memoria · insights automáticos ·
splits · motor de reglas · gráficas interactivas con drill-down (incluido Sankey) · buscador
global · multimoneda con tipo de cambio histórico · previsión 7/30/90/180/365 días.

### P3 — Opcional / futura
Inversiones y cartera · agregación bancaria mediante `BankingProvider` (adaptadores) ·
widgets configurables · presupuestos compartidos · app móvil nativa con biometría del sistema.

---

## 11. Plan de implementación por fases

| Fase | Alcance | Ficheros principales | Migraciones | Riesgo |
|---|---|---|---|---|
| **0-3** ✅ | Auditoría, diagnóstico, arquitectura y plan | este documento | — | — |
| **4** ✅ (parcial) | Núcleo determinista + tipos de movimiento + seguridad + tests | `src/lib/finance-core.ts` (nuevo), `src/lib/finance.ts`, `src/app/api/**`, `scripts/finance-tests.ts` | `transaction.kind` (+3 opciones), `transaction.transfer_account`, baja de `bank_account.sync_status`/`last_sync_at` | Bajo: los tipos nuevos son aditivos y los movimientos antiguos se leen como gasto |
| **4b** | Preview y confirmación de lo que propone la IA; categorías completas; tarjetas con ciclo; paginación servidor; `audit_log` | `/api/voice`, `/app/asistente`, `/api/categories/[id]`, `category_group`, `/api/transactions` | 3 tablas nuevas, 6 campos | Medio: cambia el flujo de la nota de voz |
| **5** | Presupuestos por periodo con rollover, recurrentes, suscripciones, deudas, fondo de emergencia, calendario, forecast | nuevos servicios en `finance-core` + rutas + pantallas `/calendario`, `/deudas`, `/suscripciones` | 6 tablas | Medio |
| **6** | Reglas automáticas, categorización con confianza y aprendizaje, alertas configurables | `transaction_rule`, `/api/rules`, ajustes en `/api/voice` | 2 tablas | Medio |
| **7** | Tool calling de la IA (`getSafeToSpend`, `simulatePurchase`, …), modo conversacional, insights | `src/lib/ai-tools.ts`, `ai_conversation`/`ai_message`, `financial_insight` | 3 tablas | Medio |
| **8** | Agregación bancaria mediante adaptadores + importador CSV como alternativa siempre disponible | `src/lib/banking/provider.ts` + adaptadores | 2 tablas | Alto y **no recomendado ahora** (ver §12) |
| **9** | Informes filtrables, mensual comparativo, gráficas interactivas, exportaciones configurables | `/api/reports/*`, `src/components/charts.tsx` | — | Bajo |
| **10** | Hardening: rate limiting, auditoría completa, snapshots, observabilidad, tests de integración, rendimiento | middleware, `balance_snapshot`, `scripts/*-tests.ts` | 1 tabla | Bajo |

---

## 12. Qué NO recomiendo implementar (y por qué)

1. **Sincronización bancaria automática (open banking).** El usuario ya pidió retirarla y, además,
   no puede afirmarse que exista cobertura real: en la zona euro los agregadores PSD2 cubren
   bancos españoles, pero para **República Dominicana no hay APIs bancarias abiertas ni
   agregación fiable verificada**. Antes de escribir una línea habría que confirmar disponibilidad,
   coste y contrato con un proveedor. Mientras no esté verificado, lo honesto es entrada manual +
   importador CSV/Excel. Si algún día se retoma, hacerlo detrás de una interfaz `BankingProvider`
   para no acoplar el dominio, y **nunca** prometer "tiempo real".
2. **Reescritura del proyecto.** La base es sana: mismo stack, mismas tablas, mismas pantallas.
   Reescribir destruiría trabajo que ya funciona y multiplicaría el riesgo.
3. **`DECIMAL`/`NUMERIC` en base de datos.** Totalum no ofrece ese tipo. La alternativa real es la
   que se ha aplicado: redondeo a céntimos en toda frontera y agregación en enteros de céntimo.
   Guardar el dinero como string decimal complicaría filtros y ordenaciones sin ganancia práctica.
4. **Multimoneda ahora.** Requiere tipo de cambio histórico y reescribir todas las agregaciones.
   Sin un segundo país activo, añade complejidad sin valor inmediato. Dejarlo para P2 con el
   diseño ya previsto (moneda original + importe original + tipo aplicado + equivalente en base).
5. **Inversiones y cartera.** Sólo tiene sentido con datos de mercado; hasta entonces sería una
   tabla manual que envejece mal.
6. **Health score como número aislado.** Se mantiene sólo porque ahora muestra sus cuatro
   componentes. Sin desglose, un número así es ruido.
7. **Módulo de pagos (Stripe).** El producto no lo necesita; el bloque existente es plantilla.
   No ampliarlo mientras no haya un plan de suscripción real.

---

## 13. Cambios ya aplicados en esta pasada

**Nuevo núcleo determinista** — `src/lib/finance-core.ts` (puro, sin I/O):
`TX_KINDS`/`kindMeta`, `round2`, `sumMoney`, `computeTotals`, `spentByCategory`, `computeBudgets`,
`computeNetWorth`, `estimateNextIncomeDate`, `computeSafeToSpend`, `simulatePurchase`,
`computeHealthScore`.

**Tipos de movimiento** — `gasto`, `ingreso`, `transferencia`, `pago_tarjeta`, `ajuste`.
Los tres últimos **no** cuentan como gasto ni ingreso en ningún sitio (panel, presupuestos,
gráficas, informe semanal, exportaciones). Nuevo campo `transfer_account` (cuenta destino) con
validación de origen ≠ destino tanto en cliente como en servidor. Los movimientos antiguos sin
tipo se interpretan como gasto, así que no hay regresión de datos.

**Disponible para gastar** — liquidez − deuda de tarjeta − reserva proporcional de metas activas −
salidas ya planificadas − colchón (5 % de los ingresos), acotado por el presupuesto restante y
proyectado **hasta el próximo ingreso estimado** a partir del historial real. La UI muestra el
desglose completo ("Cómo lo calculo") y avisa de que la fecha del próximo ingreso es una
estimación.

**Patrimonio neto** — activos − pasivos, con las tarjetas en negativo como deuda, en el panel.

**Salud financiera** — 4 componentes explicados: tasa de ahorro (35), cumplimiento de presupuesto
(25), colchón de emergencia frente al objetivo de 3 meses (20), carga de deuda (20).

**Simulador de compras** — `POST /api/simulate` + pestaña *Simulador* en Planificación. Veredicto
determinista (`puedes` / `justo` / `espera` / `no`), disponible restante, días de espera
sugeridos; la IA sólo redacta la explicación.

**Seguridad** — `assertOwner()` en todas las rutas por id y en `notifications/read`; validación de
importes y tipos en los `PUT`; la propuesta de la IA se acota siempre al disponible real.

**Limpieza** — se eliminan del esquema los campos huérfanos del módulo bancario retirado.

**Tests** — `npm run test:finance`: 46 comprobaciones sobre redondeo, transferencias, pagos de
tarjeta, saldos negativos, patrimonio, próximo ingreso, disponible, tope por presupuesto,
simulador, presupuestos y salud financiera.
