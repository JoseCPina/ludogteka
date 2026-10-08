# Operaciones manuales en producción

Bitácora de toda intervención hecha a mano sobre los datos de producción, fuera de la UI de la app. CLAUDE.md solo tolera esto para un caso operativo puntual, nunca para cambios de esquema, y siempre dejando constancia aquí: qué se hizo, por qué, cómo y cómo se deshace.

## 2026-09-24: baja de registros de prueba

**Por qué.** Los pidió el administrador del sistema: eran registros creados al probar la app, no clientes reales.

**Cómo.** API REST con la llave `service_role`, leída al vuelo del CLI de Supabase.

- Solo baja lógica: `deleted_at`, o `estado = cancelado` con motivo.
- Nada se borró.
- Los contratos firmados se conservan como evidencia, con su PDF en Storage.
- El motivo escrito en cada cancelación: *"Registro de prueba creado al probar la app; dado de baja a petición del administrador del sistema (24 sep 2026)."*

**Antes y después.** Se tomó una foto de los conteos del negocio real (todo lo que no es de estos tres clientes) antes y después.

- Antes: 14 clientes, 15 perros, 2 reservas, 1 contrato pendiente, 5 cuentas de staff.
- Después: lo mismo. La única diferencia es el contrato de Kaia, que pasó de pendiente a cancelado.

### Qué se hizo, por registro

#### Kaia (perro de Aaron Aguilar Canedo, cliente REAL, que no se tocó)

- Contrato general `861674a3`, pendiente de firma desde el 25 de agosto: cancelado con motivo.

#### José Carlos Piña (`3ae8e17d`)

- Perro Lucho: baja.
- Reserva `90b28ac7`, un cargo suelto "Comida especial — Tacos" de $10:
  - el cargo se canceló con motivo;
  - la reserva se dio de baja;
  - la orden de Mercado Pago de ese cargo ya estaba cancelada;
  - no había cobros.
- Contratos:
  - 2 firmados (`0c05d366`, `e6f6cf46`): se conservan;
  - 1 pendiente (`e3f559cf`, guardería): cancelado con motivo.
- 2 invitaciones (ya usadas): baja.
- Requisitos sanitarios de Lucho (1 aplicado y 2 propuestos): baja.
- Expediente del cliente: baja.
- Cuenta del portal (`jpinadev@gmail.com`, perfil `a83de437`): desactivada.

#### José Aguilar (`8a22598c`)

- Perro Emma: baja.
- Reserva `5e33c0bc`, vacía: baja.
- 1 invitación (usada): baja.
- Expediente del cliente: baja.
- Cuenta del portal (`t4444256082@telefono…`, perfil `74ae4f4f`): desactivada.

#### Ronith Navarrete (`0d53afce`): solo el expediente de CLIENTE

- Perro Greta: baja.
- Cita de estética `7e13b85c` (23 sep, $490, sin cobro): cancelada, con el motivo en sus notas, y dada de baja.
- 2 reservas (`9447cd68`, `ecd5bb62`): baja.
- Contrato firmado `49a59f57`: se conserva.
- 2 invitaciones:
  - la de guardería/hotel, que seguía abierta, se canceló;
  - las dos se dieron de baja.
- Requisitos sanitarios de Greta (4 aplicados y 4 propuestos): baja.
- Expediente del cliente: baja.
- Cuenta del portal de cliente (`t5533990976@telefono…`, perfil `f4fa12f5`): desactivada.
- Su cuenta de **admin** (`ronith.navarrete@gmail.com`, perfil `1d24ded5`) **no se tocó**. Se comprobó después: rol admin, sin baja y sin bloqueo.

### Cómo se desactivaron las cuentas del portal

- El perfil queda con `deleted_at`.
- La cuenta de Auth queda bloqueada (`ban_duration` de 100 años).
- Se le cambió el correo a `baja-<id>+<correo original>@baja.ludogteka.mx`. Así el teléfono o el correo quedan libres para un alta real futura.
- El id de la cuenta se conserva: los contratos firmados siguen apuntando a quien los firmó.

### Cómo se deshace

1. Poner `deleted_at = null` en las filas de arriba.
2. En Auth: `ban_duration: "none"` y devolverle a cada cuenta su correo original.

Los correos originales están en esta página.

## 2026-09-29: limpieza de la prueba de cobro con Mercado Pago en Ludogteka

Pedida por escrito por el dueño de PeluDesk (José Carlos Piña). Va como
migración versionada, `supabase/migrations/20260929020143_limpiar_prueba_mercadopago_ludogteka.sql`,
aplicada con `npm run desplegar -- --aplicar`: respaldo, conteos antes y
después y `auditoria_frontera()`. Tiene candados: solo corre donde existe
exactamente esta prueba, no hace nada si ya se limpió y aborta sin tocar nada
si el estado no es el esperado. Se ensayó en desarrollo con una réplica de
los mismos IDs dentro de una transacción que se deshizo, y quedó así:

| | Antes | Después |
|---|---|---|
| Saldo de la cuenta | $350 | $0 |
| Cuentas abiertas | aparece | ya no |
| Inventario | 12 | 14 (regresó lo consumido) |

Correrla dos veces no duplica nada.

### Qué fue la prueba

28 de septiembre de 2026, de 5:43 a 5:50 p.m. hora de San Luis Potosí, con
la cuenta de recepción de Dulce:

- Cliente «jose» (`4fb6ba68`, teléfono del dueño) con el perro «me» (`306f84c2`).
- Reserva `a1f811da` con un «Baño exprés» de $370 (cita `52b8d6f5`) que se
  marcó finalizada.
- Cobros de Mercado Pago en vivo, en el turno `8933562c`:
  - terminal Point: un intento rechazado y uno pagado de $10 (cobro `937907ca`);
  - link de pago de $10, pagado (cobro `e563b3b8`).
- El link generó solo el gasto «Comisión de Mercado Pago» de $5.05 (`56d41636`).

Mercado Pago ya reembolsó los dos cobros y regresó la comisión. Eso lo hizo
el dueño allá; aquí no se reembolsó nada.

### Qué hizo la limpieza

1. **Devoluciones.** Una por cobro, en el turno de los cobros (el único
   abierto de Ludogteka) y con su método: terminal $10 y transferencia $10.
   El esperado del turno en esos métodos vuelve a cero.
   - Autoriza la persona de José Carlos Piña en PeluDesk (`a83de437`), no
     el admin de Ludogteka: ella no autorizó esto, y por eso no se usó
     `registrar_devolucion()`, que pone al admin de la sesión.
2. **Gasto.** El de comisión quedó cancelado con el motivo «cobro de prueba
   devuelto; Mercado Pago regresó la comisión». No tenía retiro de caja.
3. **Cita.** Quedó cancelada, con una nota en la cita y en la reserva.
   - Sale de la cuenta: el saldo queda en 0 y desaparece de cuentas abiertas
     y de «Necesita atención».
   - Sale de la comisión: `comision_de_cita` solo cuenta finalizadas.
     Además, la estilista (Karen) no tiene expediente de empleado ni pagos
     de nómina.
   - Sale de los costos.
   - No había inventario que regresar: el «Baño exprés» no tiene receta. La
     migración igual regresa con un ajuste positivo cualquier consumo ligado
     a la cita.
4. **Bajas.** El cliente «jose» y el perro «me» quedaron dados de baja
   (`deleted_at`).

### Qué NO se tocó

- **Órdenes de Mercado Pago.** Se quedan como las dejó el proveedor; la app
  nunca cambia una orden pagada.
- **El turno abierto.** Lo cierra recepción con el conteo real.
- **Los contratos del expediente viejo «José Carlos Piña».** Los firmados
  quedan como evidencia y el cancelado ya estaba así.

### Cómo queda en los reportes

- **Caja:** cobrado $20 y devuelto $20 en el mismo turno.
- **Financiero:** el mes neto en cero. Por día, el 28 aparecen los cobros y
  el 29 las devoluciones.
- **Gastos:** la comisión ya no cuenta.
- **Utilidad y costos:** la cita cancelada no cuenta.

### Cómo se deshace

Sería volver a meter una prueba que no pasó; no hay motivo. Si hiciera
falta:

1. Dar de baja (`deleted_at`) las dos devoluciones de los cobros `937907ca`
   y `e563b3b8`.
2. Regresar el gasto `56d41636` a `pagado`.
3. Regresar la cita `52b8d6f5` a `finalizada`.
4. Quitar el `deleted_at` del cliente y del perro.

## 1 de octubre de 2026 (UTC) — reels de Instagram vueltos a subir con portada

Los tres reels de @peludesk que el programador publicó el 30 de septiembre (corte-de-caja, ese-perro-no-esta-vacunado, un-dia-en-tu-guarderia) salieron sin portada propia y Instagram no deja cambiarla por la API. Por REST con la service_role (operación puntual de un administrador, sin cambios de esquema): las tres filas originales de `redes_publicaciones` (Instagram) pasaron a `cancelada` con la liga del reel anterior en `error`, y se insertaron tres filas nuevas (mismo video, pie y archivo) que el publicador sacó con `cover_url`. Se hizo así porque el índice único `(video, red)` solo deja una fila viva por video y red: así el calendario no las vuelve a agregar. Los reels anteriores siguen en Instagram hasta que se borren a mano. Facebook y TikTok no se tocaron.

## 1 de octubre de 2026 (UTC) — tríptico «¿Eres dueña o dueño…?» programado

La migración `20261001000100_redes_imagenes` (formato `imagen` en `redes_publicaciones`) se aplicó con `npm run desplegar`. Después, por REST con la service_role (operación puntual de un administrador, sin cambios de esquema), se insertaron las 7 filas del tríptico en `redes_publicaciones` con las mismas filas que arma `filasDeLaSerie()` de `src/lib/redes/serie.ts`: imagen «2 de cada 3» (Instagram y Facebook, 23:42 CDMX), el video (reel de Instagram, reel de Facebook y borrador de TikTok, 23:45) e imagen «52 de cada 100» (Instagram y Facebook, 23:48). Se hizo así porque la pantalla de la plataforma exige una sesión de administrador de PeluDesk y la fecha tenía que dejarse exacta; el resto del calendario no se tocó. La tarea `/api/cron/redes` pasó de «cada 20 minutos» a `*/3 * * * *` para que los tres horarios (con 3 minutos entre cada uno) se cumplan.

## 5 de octubre de 2026 (UTC) — negocio de prueba «peludos» borrado

Cuenta de prueba de José (slug `peludos`, `peludos.peludesk.mx`, teléfono de registro 4441301539), en plan prueba, activa, sin clientes, sin cobros, sin Stripe, sin archivos y sin credenciales de cobro. Se borró con `node scripts/plataforma/eliminar-negocio.mjs peludos --telefono 4441301539 --prod --aplicar`, que llama a `plataforma_eliminar_negocio` (la función de la plataforma, migración `20261005120000`): nada de SQL a mano. Antes, el script comprobó que el slug era de UN negocio y que su teléfono de registro coincidía; la base comprobó las guardas (no demo, no exento, solo prueba o suspendido, sin cobros reales).

- **Filas borradas** (16 tablas, todas de configuración inicial): servicios 8, membresías 1, grupos_raza 7, razas_grupo 73, horario_semana 7, reporte_config 1, reporte_opciones 39, reporte_secciones 8, tipos_contrato 2, areas_inventario 4, catalogo_alertas 7, categorias_gasto 11, registros_prueba 1, cupo_configuracion 1, catalogo_descuentos 5, tipos_requisito_sanitario 4.
- **La cuenta de Auth** de esa persona NO se borró: tiene otro negocio o es de la plataforma (`cuentas_huerfanas` salió vacía).
- **Verificado**: el conteo de filas por tabla de los otros cinco negocios (Ludogteka, Patitas & Co., Prueba MP PeluDesk, Patitas Felices, vanessa y Pawtiful) quedó idéntico antes y después; `auditoria_frontera()` vacía; la bitácora (`plataforma_eventos`, acción `eliminar_negocio`) guarda slug, teléfono y filas.
- **Cómo se deshace**: no se deshace (un negocio de prueba sin datos propios); si hiciera falta, se vuelve a registrar desde `/registro`.

Después del despliegue se pidió a Meta la revisión de las 4 plantillas del seguimiento de pruebas (`node scripts/whatsapp/meta.mjs plantillas-seguimiento enviar`) y quedaron aprobadas; se guardó su estado en `seguimiento_pruebas_plantillas` con `seguimiento_plantilla_guardar` y se mandó UNA prueba a 4441301539 (`peludesk_prueba_dia5_v1`, a José mismo). Variable nueva en Vercel (Production): `PELUDESK_WABA_ID`.

## 5 de octubre de 2026 (UTC) — tabla de precios de estética de Ludogteka

Migraciones `20261005140000_estetica_reglas_de_precio` (reglas de pelaje como datos del negocio, vista `perro_grupo_raza` con `sin_grupo_motivo`, recargo manual en la cita, función `plataforma_cargar_tarifas_estetica`) y `20261005150000_portal_invitaciones`, aplicadas con `npm run desplegar -- --aplicar` (respaldo físico de 23.2 h, 130 tablas / 5,539 filas copiadas, `auditoria_frontera()` vacía, Vercel Ready).

La tabla de precios se cargó con `node scripts/estetica/cargar-tarifas.mjs --negocio ludogteka --tabla scripts/estetica/tablas/ludogteka.json --prod --aplicar`, que llama a la función de la plataforma: nada de SQL a mano. Antes de la carga, 22 de las 27 tarifas ya estaban igual; cambiaron 5 (evento `2287090b-89a2-4502-bca1-975c951ddc1c` en `plataforma_eventos`, con la foto de lo anterior):

- Rapado de Pomerania: no aplica → $320.
- Baño estético de «Shih tzu, schnauzer, yorkshire, cocker y similares»: $390 (maltratado $450) → $450 ($520).
- Rapado de ese mismo grupo: $320 → $360.
- Rapado de «Pastores pelo corto, husky, akita y similares»: no aplica → $460.
- Rapado de «Pastores pelo largo y similares talla grande»: no aplica → $500.

`estetica_rapado` quedó con `pelajes_excluidos = ['corto']` (el rapado solo se ofrece a perros de pelo medio o largo) y el grupo «Por talla» con `pelajes_permitidos = ['corto']`. Conteos antes y después, idénticos: citas_estetica 236, clientes 46, perros 56, cobros 569; la tabla nueva `portal_invitaciones` quedó en 0. Las citas ya agendadas o cobradas no cambiaron de precio (el precio se congela en la cita).

**Cómo se deshace**: `node scripts/estetica/cargar-tarifas.mjs --negocio ludogteka --revertir 2287090b-89a2-4502-bca1-975c951ddc1c --prod --aplicar`.

**Textos de «incluye» sin confirmar**: el cartel del baño exprés venía cortado; el texto «baño con shampoo y secado» es el del encargo, no el del cartel.

## 5 de octubre de 2026 · Serie de 55 videos tutoriales (publicación a producción por script)

Los videos (`scripts/tutoriales/`, mapa en `docs/TUTORIALES.md`) se graban SOLO en desarrollo, con el demo ficticio, y `node scripts/tutoriales/tutoriales.mjs --prod` los publica: archivos en los buckets `tutoriales` (720p, póster, VTT; público) y `tutoriales-masters` (1080p, SRT, guion, voz; privado) y el catálogo en la tabla `tutoriales` por las funciones `plataforma_tutoriales_*` (solo `service_role`). No se escribió SQL a mano: la migración `20261005170000` (y sus dos arreglos) fue por el despliegue. Resultado: 55 de 55 publicados con voz (duración media 79 s, máxima 136 s), 117 MB en `tutoriales` y 409 MB en `tutoriales-masters`; cuota de ElevenLabs usada ≈ 35,000 de 142,046 caracteres. El caché de voz (`scripts/tutoriales/audio/`) no se versiona: vive respaldado en Storage (`_voz/`). En la nube, `fetch` de Node necesita `NODE_USE_ENV_PROXY=1` para llegar a ElevenLabs. Para regenerar un video: `npm run tutoriales -- --video NN --regrabar --prod`; solo voz: `--solo-voz`.

## 5 de octubre de 2026 (UTC) — cobro con terminal que nunca ocurrió (Ludogteka)

**Qué se encontró (solo lectura, producción):** en el turno abierto de Ludogteka hay UN cobro con método `terminal` de hoy: $350.00, creado a las 16:25:59 UTC (10:25 hora de la Ciudad de México) por la persona de recepción (`created_by` 5fcb4a04…), `origen = manual`, sin ninguna fila en `mp_ordenes`, en la cuenta (reserva 66491ff2…) a la que a las 16:01 UTC se le había generado un link de pago de $350 que sigue «creada» (nadie lo pagó). No viene de una orden de la terminal: lo tecleó una persona en «Registrar cobro» con el método «Terminal», y la base lo aceptó sin verificar nada. Las demás órdenes de la terminal de hoy fueron bien: la de $10 de las 16:52 UTC (prueba del dueño) llegó como `cancelada` («cancel_by_terminal») y quedó cancelada, sin cobro. Solo hay otro cobro con terminal en toda la historia: el de $10 del 28 de septiembre (orden pagada, pago PAY01M3N6N02VT9XC31K8KQMSQAS9 aprobado y reembolsado).

**Qué NO se hizo:** no se revirtió el cobro de $350. A las 17:02:54 UTC el dueño desconectó Mercado Pago desde Administración (la integración quedó `desconectada` y sin secreto en Vault), así que no hubo credenciales para preguntarle a Mercado Pago si existe un pago aprobado de $350; sin esa comprobación el caso es ambiguo. Se corrige con «Marcar como no recibido» (admin), que sí consulta a Mercado Pago antes de dejarlo (ver CLAUDE.md, «Cobros con terminal verificados»).

**Revisión histórica de cobros con terminal en Ludogteka:** ver el reporte de la sesión; los conteos de producción antes y después de la migración `20261006120000_terminal_verificada` (solo DDL, sin backfill) quedan en la bitácora del despliegue.


## 7 de octubre de 2026 (UTC) — «El servicio de esta cita no existe» y corregir el servicio de una cita

**Causa (solo lectura):** `validar_cita_estetica` buscaba el servicio con `deleted_at is null`. Al retirarse del catálogo los siete servicios de estética de la Fase 3 (21 de septiembre), toda cita vieja que apuntaba a uno quedaba imposible de cancelar, cerrar o tocar con ese mensaje aunque el servicio sí existía (solo dado de baja). **Alcance:** producción tenía 240 citas vivas y 8 servicios de estética dados de baja, y **0 citas apuntando a ellos** (consulta de lectura por la API con la llave de servicio, sin escribir); desarrollo tenía 2 (una cancelada y una finalizada). No hubo nada que corregir en datos de producción, así que no se corrió ningún script de plataforma.

**Arreglo de raíz (migraciones `20261007000000` a `20261007000600`):** la cita guarda el nombre del servicio con el que se registró (`servicio_nombre`, rellenado para todas las citas existentes con los disparadores del usuario apagados, sin mover `updated_at`); una cita existente que no cambia de servicio se valida contra su servicio aunque esté dado de baja; y nueva función `corregir_servicio_cita` (permiso `corregir_servicio`) para cambiarlo con historial inmutable (`citas_estetica_correcciones`). Reversa: es DDL aditivo (columna, tablas y funciones nuevas); volver atrás es dejar de usar las funciones y, si hiciera falta, `drop` de lo nuevo; el respaldo físico de menos de 26 h lo exige el script de despliegue.

## 8 de octubre de 2026 — «Tarjeta (registro manual)» (migraciones `20261008000000` a `20261008000300`)

**Por qué:** el 5 de octubre se cerró la captura a mano de «Terminal» (un cobro con terminal solo entra verificado por Mercado Pago o Clip). Eso dejó sin salida a la recepción cuando la terminal vinculada no se puede usar (caída, sin señal, otra terminal). Se agregó un método aparte, `tarjeta_manual`: cuenta como pagado desde que se registra, pero con folio del voucher y motivo, marcado «sin verificar» y como línea aparte en turno, corte y reportes.

**Qué cambia en la base (solo esquema y funciones; ningún dato de negocio se escribe salvo el permiso):**
- Checks de `cobro_metodos`, `devolucion_metodos` y `corte_metodos` aceptan `tarjeta_manual`; `cobro_correcciones.tipo` acepta `tarjeta_manual_no_recibida`.
- Tablas nuevas `tarjetas_manuales`, `tarjetas_manuales_eventos` y `tarjeta_manual_ajustes` (vacías al migrar; dos redes + tres políticas de solo lectura).
- Permiso `tarjeta_manual`: **se siembra una fila de `permisos_staff` por cada recepcionista existente de cada negocio** (en producción: la de Ludogteka) y un trigger de `membresias` lo da a las nuevas. Es el único dato que escribe la migración y es el valor por omisión pedido por el dueño.
- Funciones nuevas: `tarjetas_manuales_por_revisar`, `tarjeta_manual_revisar`, `tarjeta_manual_no_recibida`, `tarjetas_manuales_atencion`, `tarjeta_manual_tope`, `guardar_tope_tarjeta_manual`, `plataforma_tarjetas_manuales_patron`. Reescritas: `registrar_cobro`, `registrar_devolucion`, `cerrar_turno`, `resumen_turno` y `reporte_financiero_periodo` (cambia su tipo de retorno: se recrea y vuelve a ser de `peludesk_definer`).

**Conteos de producción esperados antes y después:** idénticos en todas las tablas salvo `permisos_staff` (+1 por recepcionista) y `membresias` (sin cambio). Ninguna fila de `cobros`, `cobro_metodos` ni `cortes_caja` cambia: el corte de un turno ya cerrado no se toca.

**Reversa (si hiciera falta antes de que se use):** quitar las funciones y el trigger nuevos, borrar las tres tablas, volver los checks a sus tres métodos y restaurar las cinco funciones reescritas de `20261006120000`, `20260929022303` y `20260925023050`. Después de que exista un cobro con `tarjeta_manual` no se revierte el check: se deja y se corrige hacia adelante. El respaldo físico de menos de 26 h lo exige `npm run desplegar`.

**Cómo se opera:** el admin revisa las tarjetas manuales en Caja → Conciliación («Revisado con voucher» o «Marcar como no recibida», con motivo; la corrección entra en el turno abierto y no cambia un corte cerrado). El tope de alerta (por omisión $2,000) se cambia en Administración → Cobro con terminal. La plataforma ve en `/plataforma` los negocios con terminal conectada que usan la tarjeta manual de más (más de 3 al día o más del 30 % de las tarjetas de un turno). Los tutoriales de cobro, caja y conciliación quedan «por actualizar» (no se regrabaron en esta tarea).

## 9 de octubre de 2026 — Matriz «Mestizo / sin raza» (talla × pelaje) (migraciones `20261009000000` y `20261009000100`)

**Por qué:** el grupo «Por talla (perros sin grupo de raza)» solo cobraba a pelo corto; un mestizo de pelo medio o largo (ej. Osito: mestizo, chico, pelo largo) quedaba sin precio y la pantalla de agendar le mostraba varios avisos sin salida.

**Qué cambia en la base:** `grupos_raza.depende_pelaje`, `tarifas.calculado` (y en `tarifas_vigentes`), tabla `tarifas_eventos`, funciones `cotizar_cita_estetica`, `confirmar_tarifas_calculadas`, `plataforma_revertir_carga_tarifas`; `plataforma_cargar_tarifas_estetica` (pelaje, `calculado`, guarda lo que creó), `validar_cita_estetica` (pelaje por grupo; excepción de grupo también con celda vacía) y `describir_precio_faltante` reescritas; `crear_negocio` copia `depende_pelaje`. En CADA negocio el grupo `pelo_corto` pasa a nombre «Mestizo / sin raza», clave `mestizo`, `depende_pelaje = true`, sin restricción de pelaje, y sus tarifas existentes reciben `pelaje_id = corto` (mismos importes). **Respaldo y reversa:** `plataforma_eventos` `migracion_matriz_mestizo` guarda el grupo como estaba y los ids de las tarifas tocadas (volver = restaurar esas columnas y `pelaje_id = null` en esos ids).

**Ludogteka (producción), carga de pelo medio y largo calculados** con `scripts/estetica/calcular-mestizo.mjs` + `cargar-tarifas.mjs` (evento de auditoría; reversa exacta con `--revertir`). Tabla en el reporte de la tarea; todo marcado «Calculado» hasta que el admin lo confirme o edite en Servicios y precios. Los otros negocios quedan con pelo medio y largo VACÍOS (piden excepción con motivo hasta que los llenen).

**Conteos de producción esperados antes y después:** idénticos salvo `tarifas` (+ las celdas de Ludogteka), `plataforma_eventos` (+ migración y carga) y las tablas nuevas vacías (`tarifas_eventos`: +1 de la carga). Ningún precio vigente cambia de importe.

## 10 de octubre de 2026 — Cobro agrupado y residuo de centavos (migraciones `20261010000000` a `20261010000400`)

**Por qué:** la recepción tenía que cobrar por separado cada cuenta de una misma clienta (por ejemplo «Victoria · Osito, baño rapado $320» y «Victoria · Guardería 1 hr $35») aunque la persona pagaba una vez con una tarjeta y un voucher, y la tarjeta manual rechazaba el folio repetido en el segundo cobro. Ahora se cobran en un solo movimiento: un pago, un folio, una propina y un recibo, repartidos entre las cuentas.

**Qué cambia en la base (solo esquema y funciones; ningún dato de negocio se escribe):**
- Tablas nuevas `cobros_grupo` y `cobros_grupo_eventos` (vacías al migrar; dos redes + tres políticas de solo lectura; cada cobro agrupado y su deshacer dejan un evento).
- Columnas nuevas: `cobros.grupo_id` y `cobros.grupo_orden`, `mp_ordenes.grupo_cuentas`/`grupo_cliente_id`/`grupo_id`, `tarjetas_manuales.grupo_id`/`partes`. La vista `mp_ordenes_estado` trae `grupo_cuentas` y `grupo_id` (sigue `security_invoker`).
- Funciones nuevas: `registrar_cobro_grupo` (la que llama la recepción), `cobro_grupo_aplicar` (interna: reparte en centavos de la cuenta más antigua a la más nueva y la propina en proporción), `cobro_grupo_detalle`, `cobro_grupos_de_reserva`, `cobro_de_orden_para_monto`, `plataforma_saldos_centavos`, `plataforma_corregir_saldos_centavos`, `plataforma_revertir_saldos_centavos` (las tres últimas de postgres, en la lista blanca de `auditoria_frontera()`).
- Reescritas o parchadas: `registrar_pago_mercadopago` y `registrar_pagos_mp_pendientes` (una orden de grupo se reparte), `preparar_reembolso` y `registrar_reembolso_proveedor` (reembolso por cuenta de una orden de grupo), `tarjeta_manual_no_recibida` y `cobro_marcar_no_recibido` (deshacen el grupo completo), `tarjetas_manuales_por_revisar` y `movimientos_turno` (columnas nuevas: se recrean), `ordenes_abiertas_de_reservas`, `demo_vaciar`, `aplicar_descuento` y `registrar_cobro` (ver el residuo).
- `plataforma_eventos.accion` acepta `corregir_saldos_centavos` y `revertir_saldos_centavos`.
- `cerrar_turno` (migración `…000400`): un turno donde solo se corrigió una tarjeta manual de un turno anterior («no recibida» o devolución) tenía un esperado de tarjeta manual negativo y la base rechazaba guardar la línea del corte (`conteo >= 0`), así que ese turno no se podía cerrar. Ahora el conteo de esa línea se guarda en cero como mínimo y el esperado conserva su signo. Error latente de la tarea de tarjeta manual, encontrado por `venta-mostrador-dev` (producción ya tiene 5 tarjetas manuales: el arreglo evita que un turno quede sin poder cerrarse).

**Diseño que mantiene la contabilidad:** cada cuenta conserva SU `cobros` y SU parte en `cobro_metodos`, así que el turno, el corte y los reportes por servicio suman cada peso una sola vez; devoluciones, comisiones, nómina e inventario siguen por cuenta. Una orden de terminal o link de un grupo es UNA fila en `mp_ordenes` (cuentas congeladas en `grupo_cuentas`); al verificarse el pago contra el proveedor se reparte. Una tarjeta manual de grupo es UNA fila de `tarjetas_manuales` (un folio, sus partes en `partes`).

**Residuo de centavos (caso «Blacky · Baño estético completo, 5 oct 2026, saldo $0.30 de $490.00», Ludogteka):** causa de raíz leída en producción (solo lectura): a la cuenta se le aplicó un descuento del 53 % y `aplicar_descuento` lo calculaba a centavos (`round(490 × 53 / 100, 2)` = $259.70, dejando $230.30 por pagar) mientras que en caja se cobra en pesos (se cobraron $230). No hubo propina, devolución ni reparto de por medio. Arreglo: el descuento por porcentaje ahora deja el total por pagar en pesos enteros (el 53 % de $490 es $260 y se pagan $230), y `registrar_cobro` y `registrar_cobro_grupo` rechazan un cobro que deje una cuenta debiendo menos de un peso. **Alcance en producción** (lectura de las 580 cuentas con cobros con `cuenta_totales_reserva`, sin escribir): UNA sola cuenta con saldo de menos de un peso, la de Blacky (reserva `0bd435f6-a0d8-41c4-a7cc-d02632bdb54a`, $0.30). Se corrigió el 10 de octubre con `node scripts/plataforma/corregir-saldos-centavos.mjs --negocio ludogteka --prod --aplicar` (descuento «Ajuste por redondeo» de $0.30; el cobro y el corte ya hechos no cambian; evento `corregir_saldos_centavos` `c76067b3-ff65-4ab6-a0d7-12b2f00c019d` en `plataforma_eventos`; reversa: `--revertir c76067b3-ff65-4ab6-a0d7-12b2f00c019d --aplicar`). Después de la corrección, la revisión (`--prod`, sin `--aplicar`) no encuentra ninguna cuenta con saldo de menos de un peso y la de Blacky queda en saldo $0.00 (total $490, descuentos $260, cobrado $230). Conteos de producción tras el despliegue: cobros 581, cobro_metodos 582, devoluciones 2, turnos 53, cortes 49, mp_ordenes 13 (sin cambio); tablas nuevas vacías.

**Conteos de producción esperados antes y después:** idénticos salvo `plataforma_eventos` (+ la migración de cada paso y el evento de corrección), `catalogo_descuentos` (+1: «Ajuste por redondeo») y `descuentos_aplicados` (+1: el de Blacky). Las tablas nuevas, vacías. Ninguna fila de `cobros`, `cobro_metodos` ni `cortes_caja` cambia.

**Reversa:** DDL aditivo: se deja de usar `registrar_cobro_grupo` y, si hiciera falta, `drop` de las tablas y columnas nuevas antes de que exista un pago agrupado; con uno registrado se corrige hacia adelante (las devoluciones por cuenta y «no recibido» ya deshacen un grupo). El respaldo físico de menos de 26 h lo exige `npm run desplegar`.

**Cómo se opera:** en Caja → Cuentas abiertas las cuentas de la misma persona salen juntas con «Cobrar todo junto» (o se marcan casillas), `/caja/cobrar-junto`; el recibo único está en `/caja/recibo-junto/<id>`. Los tutoriales 33, 34, 38, 09 y 32 quedan «por actualizar» (no se regrabaron en esta tarea). Prueba: `node scripts/auditoria/cobro-grupo-dev.mjs`.

## 11 de octubre de 2026 — Ajustar los días usados de un pase de guardería (migraciones `20261011000000` y `20261011000100`)

**Por qué:** un day pass se vende por N días y cada check-in descuenta uno, pero no había forma de dar de alta un pase que ya llevaba días usados (se empezó a usar antes de registrarlo en PeluDesk) ni de corregir después los días cuando un check-in se marcó de más, de menos o por error.

**Qué cambia en la base (solo esquema y funciones; ningún dato de negocio se escribe ni se modifica):**
- Tabla nueva `bonos_ajustes` (vacía al migrar; inmutable salvo altas; dos redes + tres políticas de solo lectura; lectura solo admin y recepción).
- Permiso nuevo `ajustar_pases` (check de `permisos_staff`, `mis_permisos()`, `tiene_permiso()`): apagado por omisión, **no se siembra a nadie**.
- Funciones nuevas (`peludesk_definer`, sin `public`/`anon`): `ajustar_dias_pase`, `deshacer_checkin_estancia`, `historial_ajustes_pase`, `reporte_dias_pase_periodo`, `pase_fechas_validas`. `comprar_bono` cambia de firma (se agregan tres parámetros con valor por omisión; la de cuatro se borra y todo llamador de siempre sigue funcionando). `transicion_estado_reserva_valida` pasa a `stable` y acepta en_curso→reservada solo con la puerta `app.deshacer_checkin`. `demo_vaciar` incluye la tabla nueva.

**Diseño contable:** un ajuste solo mueve `bonos_clientes.cantidad_disponible` (y, solo por admin, `fecha_vencimiento`); NO escribe en `movimientos_bono`, así que cobros, turnos, cortes, comisiones y el ingreso reconocido no cambian. Deshacer un check-in sí agrega una fila `devolucion` al libro (la misma que ya genera cancelar una estancia con pase), porque esa línea deja de estar cubierta por el pase; no crea ni borra cobros.

**Conteos de producción esperados antes y después:** idénticos salvo `plataforma_eventos` (+ la migración y, en su caso, la marca de tutoriales) y la tabla nueva `bonos_ajustes` en 0. `bonos_clientes` (17 en desarrollo; en producción el que haya) y `movimientos_bono` no cambian al migrar.

**Reversa (antes de que se use):** `drop` de las funciones nuevas y de `bonos_ajustes`; volver a poner `comprar_bono` de `20260923192442`, `transicion_estado_reserva_valida` de `20260729002707`, `tiene_permiso`/`mis_permisos` y el check de `permisos_staff` sin `ajustar_pases`. Un pase con saldo ya ajustado conserva su saldo; cada fila de `bonos_ajustes` trae el «antes» para revertirlo a mano con un ajuste de admin.

**Cómo se opera:** admin da el permiso en `/admin/permisos`; «Ajustar días usados» en el pase (ficha del cliente, Guardería → Pases, Caja → Pases, expediente del perro y check-in), «Este paquete ya lleva días usados» al vender, «Deshacer este check-in» en el check-in de un perro adentro con pase. Nunca SQL manual para esto.

## 12 de octubre de 2026 — La conciliación solo considera pagos que PeluDesk originó (migración `20261012000000`)

**Por qué:** la conciliación con Mercado Pago trataba TODO pago aprobado de la cuenta como propio de PeluDesk. Una cuenta de Mercado Pago recibe también pagos de otros orígenes (otras tiendas, transferencias, otras terminales, cobros personales) y esos salían en Caja → Conciliación y en «Necesita atención» como «Pago aprobado en Mercado Pago, sin cobro en la caja» (en Ludogteka: pago 182066052075 por $27,355.58 y pago 182084767547 por $1,089.00).

**Criterios de origen** (`src/lib/pagos/origen-pago.ts`, sobre los campos de `GET /v1/payments/search`; cualquier otro pago, o uno que no se pueda clasificar con certeza, es ajeno y se ignora): (a) ligado a una orden o link de PeluDesk: su id está en `mp_ordenes` (`mp_payment_id`/`mp_payment_ref`), `external_reference` es el id de una orden de ESE negocio (así se crean las órdenes de terminal y los links), `order.id` es una orden de terminal nuestra, o la `metadata` del link trae `peludesk_negocio_id` de ese negocio / `orden_id` de una orden suya; (b) terminal vinculada: `pos_id` (y `store_id`, si los dos lados lo traen) igual al de la terminal registrada, leído de `/terminals/v1/list`; (c) una referencia que coincide con un cobro de PeluDesk es el mismo criterio de `external_reference`. **Cobros a mano con «Terminal»:** solo los respalda un pago propio (terminal vinculada u orden de PeluDesk); un pago ajeno del mismo monto ya no los tapa. «Marcar como no recibido» NO cambió (sigue negándose si Mercado Pago tiene cualquier pago aprobado del mismo monto cerca de la hora: es la decisión más conservadora con dinero de por medio). La alerta del cobro del 5 de octubre ($350, Ludogteka) sigue abierta: no se tocó.

**Qué cambia en la base (solo esquema y funciones; ningún dato de negocio se escribe):** `conciliacion_terminal.tipo` acepta `pago_ajeno` (informativo); tabla nueva `conciliacion_ajustes` (vacía al migrar; dos redes + tres políticas de solo lectura; lectura admin y recepción); funciones `conciliacion_mostrar_ajenos`, `guardar_conciliacion_mostrar_ajenos` (solo admin) y, de postgres y en la lista blanca de `auditoria_frontera`, `plataforma_conciliacion_ajenos` / `_cerrar_ajenos` / `_revertir_ajenos`; `plataforma_eventos.accion` acepta `conciliacion_cerrar_ajenos` y `conciliacion_revertir_ajenos`.

**Opción del admin:** Administración → Cobro con terminal → «Mostrar también otros pagos de mi cuenta de Mercado Pago», apagada por omisión. Encendida, los pagos ajenos salen aparte en Caja → Conciliación («Otros pagos de tu cuenta (informativo)», con «Dar por revisada»), sin alertas y sin contar en «Necesita atención», `/plataforma` ni `/plataforma/conciliacion`. Apagada se ignoran por completo (y lo informativo abierto se cierra).

**Limpieza de lo ya abierto:** `node scripts/plataforma/cerrar-pagos-ajenos.mjs [--negocio <slug>] [--prod] [--aplicar]` (sin `--aplicar` solo revisa). Cierra como «Ajeno a PeluDesk» las alertas abiertas `pago_sin_cobro` cuyo pago no esté ligado a una orden de PeluDesk ni tenga su referencia (la nube no llega a Mercado Pago, así que la limpieza usa solo lo que la base sabe); deja un evento por negocio (`conciliacion_cerrar_ajenos`, con cada fila cerrada), es idempotente y se revierte con `--revertir <evento> --aplicar`. No toca los cobros a mano sospechosos (`cobro_sin_pago`) ni alertas de pagos de PeluDesk. Si una alerta cerrada fuera de la terminal vinculada, la conciliación por hora la vuelve a abrir sola.

**Conteos de producción esperados antes y después:** idénticos salvo `plataforma_eventos` (+ la migración y un evento por negocio con alertas cerradas), `conciliacion_terminal` (las alertas cerradas pasan a resueltas; ninguna fila se borra) y la tabla nueva `conciliacion_ajustes` en 0.

**Reversa:** `--revertir` de cada evento reabre las alertas; el esquema es aditivo (`drop` de las funciones y de `conciliacion_ajustes`, y volver el check de `tipo` a los dos valores originales; ver el final del archivo de la migración).

**Lo que no se pudo verificar contra Mercado Pago real:** que `pos_id`/`store_id` de `/v1/payments/search` coincidan con los de `/terminals/v1/list` para los pagos de la Point Smart (la red de la nube no llega a Mercado Pago; está probado contra el doble). Si no coinciden, la terminal vinculada no se reconoce por ese criterio, pero todo cobro hecho desde PeluDesk sigue reconocido por su orden. Los tutoriales 05, 34, 38, 50 y 59 quedan «por actualizar».
