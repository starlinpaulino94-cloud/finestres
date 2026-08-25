# Adaptación de Fintra al móvil

Resumen de los cambios que hacen que la app se use con comodidad desde un teléfono.
Verificado en un navegador real con viewport de 390×844 (iPhone 14/15).

## 1. Meta viewport (el problema principal)

`src/app/layout.tsx` no exportaba `viewport`. Sin esa etiqueta el navegador móvil
renderiza la página a 980 px de ancho y la reduce: todo se ve diminuto y hay que
hacer zoom para leer o pulsar.

Se añadió:

- `width: device-width`, `initialScale: 1` → la app usa el ancho real del teléfono.
- `viewportFit: "cover"` → permite usar `env(safe-area-inset-*)` en el notch y la
  barra de gestos.
- `themeColor` para claro/oscuro → la barra de estado del móvil acompaña al tema.
- `appleWebApp` → se puede instalar en la pantalla de inicio como una app.

## 2. Áreas seguras y barra de navegación inferior

- La cabecera lleva `safe-top` y la navegación inferior `safe-bottom`, para no
  quedar bajo el notch ni bajo la barra de gestos del iPhone.
- El contenido usa `.pb-mobile-nav` = `5.5rem + safe-area-inset-bottom`, de modo
  que la última tarjeta nunca queda tapada por la barra inferior.
- Cada destino de la barra inferior mide como mínimo 44 px de alto y tiene
  respuesta táctil (`active:`), con la etiqueta recortada en vez de desbordada.

## 3. Nada se sale de la pantalla

`html, body { overflow-x: hidden }` como red de seguridad, y además se corrigió
la causa real de los desbordes del panel:

- **Tarjeta «Salud financiera»**: el anillo (136 px fijos) y el detalle no caben
  en una fila de 390 px. Ahora se apilan en móvil.
- **«Ritmo diario»**: cada barra mostraba un tooltip flotante en `position:absolute`.
  Esos tooltips ensanchaban la caja 45 px y empujaban las tarjetas fuera de la
  pantalla. Se sustituyeron por una línea de detalle fija que se actualiza al
  tocar una barra: no desborda y en un móvil se lee mucho mejor (no hay hover).
- Las rejillas del panel llevan `[&>*]:min-w-0` para que ningún hijo ancho pueda
  volver a estirar la columna.

## 4. Gráficos legibles

`MoneyFlowChart` usaba un `viewBox` de 720 px. Al encogerse a 390 px, las
etiquetas de 10-11 px se renderizaban a ~5 px, ilegibles.

- En móvil se usa un lienzo más estrecho (420) para conservar altura útil.
- Un `ResizeObserver` mide el ancho real y compensa el tamaño de fuente, de forma
  que el texto nunca baja de ~10 px reales.
- Si las etiquetas del eje X no caben, se muestra un subconjunto.

## 5. Objetivos táctiles

Apple y Google recomiendan ~44 px. Se corrigieron los elementos por debajo de 32 px:

- Interruptores (`ui/switch.tsx`): más grandes, con área táctil ampliada mediante
  un `::after` invisible, sin cambiar el tamaño visual.
- Botones principales («Nuevo movimiento», «Añadir cuenta», «Enviar al asistente»)
  a ancho completo y 44 px de alto en móvil.
- «Cómo lo calculo», «Actualizar saldo» y los chips de ejemplo, agrandados.

## 6. Diálogos, menús y notificaciones

- Los popovers usan `min(ancho, 100vw - 1.5rem)`: ya no se salen por el borde.
- Los diálogos se limitan a `100dvh - 2rem` con scroll interno.
- Los avisos (`Toaster`) aparecen arriba centrados en móvil, donde no tapan los
  botones de la cabecera.
- Las pestañas de Planificación (4, no caben en 390 px) se deslizan en horizontal.

## 7. Página de perfil

`/profile` era una plantilla en inglés, sin la navegación de la app y con el ID de
usuario desbordando la pantalla. Se reescribió con `AppShell` (por tanto con barra
inferior), en español y con los ajustes del dispositivo (biometría y modo oscuro).
Además ahora es accesible desde el menú del avatar.

## Comprobaciones realizadas (390×844, navegador real)

En `/`, `/login`, `/dashboard`, `/movimientos`, `/planificacion`, `/cuentas`,
`/asistente`, `/reportes` y `/profile`:

- `document.scrollWidth == 390` en todas → sin scroll horizontal.
- Cero elementos fuera del viewport.
- Cero botones o interruptores por debajo de 32 px de alto.
- Cero campos de texto con fuente menor de 16 px (evita el zoom automático de iOS).
- Diálogo «Nuevo movimiento»: 358×548, cabe entero.
- Panel de alertas: 352 px de ancho, dentro de la pantalla.
- El final del contenido queda por encima de la barra inferior.
