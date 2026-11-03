# App para dueños · Fase 3 · Negocios que ya usan PeluDesk — capa de datos (1 de noviembre de 2026)

Lo construido de la Fase 3 del plan (PLAN.md), sobre las fases 0 a 2. **Solo la capa de datos** (rama
`base/app-duenos-f3-datos`): funciones de la base, cargadores en `src/lib/app/negocios.ts`, acciones del servidor y la
auditoría. Las pantallas están en «Pantallas». Cuándo leerlo: al tocar lo que el
dueño ve de un negocio donde su mascota tiene expediente (citas, reservas, fotos, reportes, contratos, pagos, pases,
recetas, expediente), pedir cita o reservar desde la app, o las reseñas.

## La idea que lo hace chico
La app entra a cada negocio **con la misma membresía de cliente que usa el portal**: un vínculo (`mascotas_vinculos`)
existe solo cuando el cliente del negocio tiene cuenta (Fase 0), así que `mi_cliente_id()` funciona igual que en el
portal en cuanto el servidor manda el encabezado del negocio. Eso lo hace `supabaseAppEnNegocio(negocioId)`
(`src/lib/app/en-negocio.ts`): cookie del portal + `x-negocio-id` del negocio del vínculo. El encabezado solo dice de qué
negocio es la petición; la base decide con la membresía (CLAUDE.md, «varios negocios»). Por eso **casi todo se
reutiliza tal cual**: `mis_visitas`, `mi_carnet`, `mi_expediente`, `mis_recetas`, `contratos` (RLS propia), `bitacora_entradas`
(fotos del día), `resolver_campos_de_contrato` + `finalizar_firma_contrato` (la firma, ahora compartida en
`src/lib/contratos/firmar.ts`, que el portal también usa). Lo que la app junta de varios negocios se pide negocio por
negocio, en paralelo, y se marca con el negocio y la mascota de la app.

## Base (migración `20261203001700`, solo agrega; de `peludesk_definer`, nada para `anon`)
- `portal_perro_es_mio(perro)`: el perro es del cliente que llama o está compartido con él (`perro_accesos_compartidos`).
- `portal_confirmar_visita(tipo, id)`: cita o estancia `reservada` de un perro suyo, que no ha empezado → `confirmada`.
  Nada más (cancelar y mover siguen con el negocio; los candados de la agenda lo exigen).
- `mis_reportes_enviados(perro)`: reportes del día `enviado` (nunca borradores ni quién los llenó), con `tarjeta_path` solo
  si la tarjeta no venció.
- `mis_pagos_pendientes()`: las cuentas del cliente con saldo (misma cuenta y saldo que Caja, `cuentas_abiertas(365)`) y el
  último link de Mercado Pago vivo (`mp_ordenes` tipo link, `creada`/`pendiente`, con `url_pago` y sin vencer).
- `mis_pases()`: `bonos_clientes_estado` del cliente sin `precio_pagado`.
- `portal_horas_disponibles(servicio, fecha)`: bloques de 30 min dentro del horario del día (`resolver_cupo_configuracion`),
  que caben antes del cierre y empiezan 30 min después de ahora, libres para alguien del personal de estética o admin
  (sin cita encimada por `tstzrange`, sin ausencia aprobada que lo cubra).
- `portal_disponibilidad_estancia(servicio, entrada, salida)`: por día, cupo (diurno o nocturno según el servicio),
  ocupado (`ocupacion_del_dia`, la misma cuenta que valida la reserva), disponible y si abre; `hay_cupo`.
- `portal_pedir_cita(perro, servicio, inicio)`: la misma cita que agenda recepción (reserva + cita; precio y fin los pone
  la base), con la primera persona libre (estilistas antes que admin, menos cargada ese día). Rechaza: perro ajeno, fuera
  del horario, hora ya ocupada, y **dos citas de la misma mascota el mismo día** (N30: eso lo decide el negocio).
- `portal_reservar(perro, servicio, entrada, salida, horas)`: la misma estancia que crea recepción; `validar_estancia`
  valida cupo, requisitos sanitarios, evaluación de comportamiento, celo/gestación, alertas y traslapes (sus mensajes
  salen tal cual; algunos mencionan rutas del personal: la pantalla los traduce, ver pendientes). Aplica el pase si lo
  hay (`aplicar_bono_a_estancia`; si no se puede, queda pagada suelta). **Contrato en el mismo flujo**: por cada tipo de
  contrato de alta de guardería/hotel (`tipos_contrato_de_alta`) que el perro no tenga firmado ni pendiente, deja uno
  `pendiente_firma` y lo devuelve en `contratos_por_firmar`.
- `resenas` (tabla nueva, con `negocio_id` y sus dos redes): una por visita (`origen_tipo` estetica|estancia + `origen_id`),
  estrellas 1–5, texto ≤ 500, `respuesta`/`respondida_at`/`publicada` del negocio. El dueño lee las suyas
  (`resenas_select_propio`); el personal las lee y solo puede contestar o esconder (`resenas_solo_respuesta`).
  `portal_resenar(tipo, id, estrellas, texto)`: solo quien tuvo esa cita o estancia y ya está `finalizada`; una vez.
  `resenas_de_negocio(negocio)`: total, promedio y las últimas 20 publicadas con el primer nombre del dueño (con sesión;
  la página pública la pedirá el servidor).
- `nombre_de_persona` ganó EXECUTE para `peludesk_definer` (quien atiende la cita).

**Decisión de dinero (documentada aquí a propósito):** el dueño sigue sin leer ninguna tabla con dinero; por función ve
SOLO lo suyo: el saldo de sus cuentas, el precio de la cita o estancia que él mismo acaba de reservar y el monto del link.
`dinero-cliente.mjs` no cambia (no sondea estas funciones; la lista blanca es por tabla).

## Cargadores (`src/lib/app/negocios.ts`, servidor)
`vinculosApp()` · `visitasApp()` (con `puedeConfirmar`, `puedeResenar`) · `fotosDelDiaApp(mascota, negocio)` (bitácora con
URL firmada) · `reportesDelDiaApp` · `contratosPorFirmarApp()` · `pagosPendientesApp()` · `pasesApp()` · `recetasApp` ·
`expedienteApp` · `carnetApp` · `serviciosApp(negocio)` (sin precio) · `horasDisponiblesApp` · `disponibilidadEstanciaApp` ·
`resenasDeNegocioApp`.

## Acciones (`src/app/app/(sesion)/negocios/acciones.ts`, todas con registro final)
`confirmarVisitaApp` · `pedirCitaApp` · `reservarApp` (devuelve `contratos_por_firmar`) · `firmarContratoApp` (la misma firma
del portal, PDF armado en el servidor) · `pedirLinkPagoApp` (crea la orden `mp_ordenes` tipo link con la conexión de cobro
del negocio, simulado en la demo; si el negocio no cobra con link, lo dice) · `resenarApp`. Todas comprueban la sesión de
la app y que el negocio sea uno con vínculo; la base vuelve a comprobar con `mi_cliente_id()`.

## Pruebas
- `node scripts/auditoria/app-duenos-f3-dev.mjs` (desarrollo, Huellitas, solo API, sin servidor): vínculo; horas libres,
  pedir cita (precio y quién atiende), doble del mismo día, hora llena para todo el personal, perro ajeno; confirmar en un
  toque; disponibilidad y reserva con cupo real (cupo 0 rechaza; con cupo crea; encimada rechaza; contrato de alta
  pendiente que C1 ve y C2 no); pagos pendientes (saldo = precio; C2 no lo ve) y pases sin precio; reseña (sin terminar
  no; terminada sí; repetida no; ajena no; el admin contesta pero no cambia estrellas); aislamiento entre negocios y
  anónimo. Limpia lo que crea.
- `columnas-internas-dev.mjs` con `resenas` en el catálogo.

## Pantallas (2 de noviembre de 2026, laptop; rama ux/app-duenos-f3-pantallas)
Con el diseño de la app (`app-duenos.css`, lenguaje cálido) y las referencias de Mobbin `app-reservar-fecha-cupo` (Fresha:
días como tarjetas y horas grandes; Octopus: lo lleno dice «Lleno»), `app-pagar` (BlaBlaCar: el monto en el botón) y
`app-registro-vet-qr` («Acción requerida»), y los bloques multi-step-form, card-nav, gift-card y testimonials.
1. **Inicio** (`/`): «Te toca» junta contratos por firmar, visitas por confirmar y lo que hay por pagar; accesos a «Mis
   visitas» y «Mis pases».
2. **Mis visitas** (`/visitas`): lo que viene y lo que ya fue, por negocio, con fecha y hora en la zona de SU negocio
   (`datosDeNegociosApp`); «Confirmar que vamos» (`confirmarVisitaApp`) y «¿Cómo te fue?» (estrellas + una línea,
   `resenarApp`), una vez por visita (`misResenasApp`).
3. **La mascota en un negocio** (`/mascotas/[id]/negocio/[negocio]`): fotos del día, reportes (la tarjeta o, si venció, el
   resumen), carnet, consultas y recetas (los componentes del portal), y «Pedir cita» / «Reservar». «Dónde la conocen» de
   la ficha lleva aquí (ya no al portal; el portal queda al final de esta pantalla).
4. **Pedir cita** (`/mascotas/[id]/cita`): servicio → día (14 días en cuadrícula, sin scroll horizontal) → hora libre
   (`horasApp`) → «Pedir la cita»; dice precio y quién atiende. Si la hora se ocupó mientras escogía, vuelve a leer el día.
   Abajo, el WhatsApp de cada negocio (y de los que registraron con el QR) como alternativa.
5. **Reservar** (`/mascotas/[id]/reservar`): servicio → fechas (noches para hotel, un día para guardería; por hora, con
   horas) → «Ver si hay lugar» (`cupoApp`, cupo por día, «Lleno»/«Cerrado») → «Reservar» → si quedan contratos de alta, se
   leen y se firman ahí mismo (`FirmarContratoApp`).
6. **Contratos** (`/contratos`, `/contratos/[negocio]/[id]`): el texto resuelto (`textoContratoApp`, el mismo del PDF) y la
   firma con el dedo (`PadFirma` → `firmarContratoApp`).
7. **Por pagar** (`/pagos`): saldo por cuenta y «Pagar $X», que abre el link al tocar (`useAbrirEnlace`).
8. **Pases** (`/pases`): cuántos quedan, barra y vencimiento; terminados y vencidos aparte.
9. **Reseñas públicas**: `resenasPublicasDeNegocio()` (`src/lib/landing/resenas.ts`, por el servidor con el negocio) en las
   tres páginas del negocio: la del módulo «Página web» (las verificadas van antes que las de Google, con «verificadas
   por PeluDesk»), la básica y el tema de Ludogteka («Lo que dicen sus clientes»). Sin reseñas, no sale nada.
10. Ayuda (`app-peludesk-para-duenos`, sección «Citas, reservas, contratos y pagos desde la app») y bot
    (`conocimiento.ts`) actualizados.

**Arreglos de la capa de datos encontrados al construir las pantallas:**
- La tarjeta del reporte vive en `reportes-archivos` (`BUCKET_REPORTES`), no en `perros-archivos`: `reportesDelDiaApp` la
  firma con el cliente del servidor del negocio (la función ya devolvió solo los reportes del dueño).
- `servicios.incluye` es una lista: `incluyeEnLinea()` la lee en una línea (con `.split` la pantalla tronaba).
- **Migración `20261203001800`**: `portal_horas_disponibles` y `portal_pedir_cita` comparaban `time` y le daban la vuelta a la
  medianoche (la app ofrecía de 00:00 a 09:00 después de las 17:00, y una cita a las 23:30 pasaba). Ahora comparan
  intervalos desde la apertura. `app-duenos-f3-dev` lo comprueba (todas las horas el mismo día y dentro del horario; 23:30
  rechazada).
- Los mensajes de la base que mandan a rutas del personal se traducen para el dueño (`mensajeParaDueno`, `src/lib/app/mensajes.ts`).
- Las acciones decían cualquier rechazo de la base como «No pudimos hablar con el proveedor de cobro» (`mensajeDeError` de
  pagos solo entiende excepciones): ahora `rechazoDeLaBase()` dice el texto de la base y, si el negocio no deja escribir,
  el aviso de la demo o el de solo lectura. Y `mensajeSiSoloLectura()` ya no traduce en app.peludesk.mx (el negocio del
  dominio no es el del vínculo: decía «solo lectura» a la dueña de la demo). La auditoría de pantallas prueba un rechazo
  (segunda cita el mismo día) con su texto.

**Una sola fuente del dinero (fix/reserva-total-una-fuente, migración `20261203001900`):** `portal_reservar` devolvía
`precio_total` = precio × noches, una cuenta aparte de la de Caja (en producción, 10 de 477 estancias ya tenían otro total
por una corrección de precio; 0 reservas de la app afectadas). Ahora `portal_reservar` y `portal_pedir_cita` devuelven el
total, lo cubierto con pase y el saldo de `cuenta_totales_reserva` (sobre `cuenta_lineas_reserva`/`cuenta_lineas_estancia`),
la misma fuente de Caja, el panel y el link de pago. «Por pagar» (`mis_pagos_pendientes`) lee `cuentas_abiertas`, que es la
copia rápida de esas mismas líneas: `dinero-cliente.mjs` comprueba para cada cliente que su saldo es, al centavo, el de
`cuenta_totales_reserva`, y `app-duenos-f3-dev.mjs` que el total de la reserva es el del panel y que, con una corrección de
precio, «Por pagar» sigue al panel.

## Pruebas de pantalla
- `node scripts/auditoria/app-duenos-f3-pantallas-dev.mjs [--capturas <carpeta>]` (desarrollo, Huellitas, app compilada en
  el 3001, 390 px): ficha → pestaña del negocio → pedir cita tocando (precio y quién atiende = base) → «Te toca» →
  confirmar (pantalla y base) → reservar guardería con cupo → firmar el contrato de alta con el dedo (PDF en la base) →
  por pagar con el saldo de la cita → pases → opinar (reseña en la base) → la reseña en la página pública. Sin desbordes
  a 390 px; un error de JavaScript en la página es hallazgo. Limpia lo que crea.

## Pendiente
- Los mensajes de `validar_estancia`/`validar_cita_estetica` hablan al personal; la pantalla del dueño los traduce.
- Las ausencias del personal se excluyen solo si `ausencias.estado = 'aprobada'`; si el catálogo de estados es otro, se
  ajusta `portal_horas_disponibles` y `portal_pedir_cita`.
- Push/aviso al dueño cuando el negocio confirma, mueve o cancela (hoy el negocio avisa por WhatsApp): Fase 3, parte 2.
