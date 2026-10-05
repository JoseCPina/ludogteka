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
