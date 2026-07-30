# Ludogteka — Contexto de proyecto

Este documento es la fuente completa de contexto de negocio y roadmap. `CLAUDE.md` tiene la versión corta operativa; aquí está el detalle. Léelo al inicio de cada sesión de trabajo relevante.

## Qué es

App interna + portal de clientes para un negocio canino en San Luis Potosí, operado en la planta baja de una casa. Servicios: guardería por día, hotel por noches, estética canina. El negocio ya tiene cámaras de videovigilancia instaladas (fuera de alcance dar acceso a clientes, ver abajo).

## Roles

Cuatro roles, cada uno con visibilidad distinta:

- **admin**: ve todo, incluidos costos y reportes financieros.
- **recepcion**: reservas, check-in/out, cobro y arqueo de su turno. No ve costos ni reportes.
- **estetica**: su agenda y consumo de insumos. No ve dinero.
- **cliente**: el dueño del perro, con cuenta en el portal. Ve solo sus perros, sus reservas, sus contratos y la bitácora de su mascota. Nunca ve nada del negocio ni de otros clientes.

## Roadmap por fases

- **Fase 0 — Entorno** (hecho): proyecto Next.js + Supabase.
- **Fase 1 — Auth**: roles y vinculación dueño↔negocio.
- **Fase 2 — Expediente**: dueños y perros (vacunas con vencimiento, alimentación, medicamentos, alergias, contacto de emergencia, veterinario, temperamento).
- **Fase 3 — Catálogo**: servicios y tarifas por tamaño de perro y duración.
- **Fase 4 — Reservas**: cupo, calendario de ocupación, check-in/out.
- **Fase 5 — POS**: métodos de pago, turno de caja, arqueo con corte ciego.
- **Fase 6 — Contratos**: plantillas, PDF, firma del dueño desde su portal.
- **Fase 7 — Inventario**: stock mínimo, consumo automático por servicio.
- **Fase 8 — Reportes**: financieros y operativos.
- **Fase 9 — Bitácora diaria**: fotos y avisos por WhatsApp.

## Reglas de negocio (el modelo de datos debe soportarlas desde el inicio)

- Un dueño tiene varios perros; el expediente vive en el perro, no en el dueño.
- Un dueño puede existir como cliente sin tener cuenta todavía (registrado en recepción) y vincularse a un usuario de auth después.
- Las vacunas tienen fecha de vencimiento; una vacuna vencida bloquea o alerta la reserva.
- Hay cupo máximo por día que las reservas no pueden rebasar.
- Los bonos prepagados NO son ingreso del día; son ingreso diferido que se reconoce al consumirse.
- Las tarifas dependen del tamaño del perro y la duración del servicio.
- Toda incidencia (mordida, escape, enfermedad) se registra y se notifica al dueño.
- El consentimiento de uso de imagen es una bandera por cliente.

## Fuera de alcance (por ahora)

- Facturación CFDI (solo se guarda RFC y régimen fiscal como campos opcionales).
- Notificaciones push.
- Acceso de clientes a cámaras en vivo.
- Multi-sucursal (no se implementa aún, pero se deja previsto `sucursal_id` donde sea barato agregarlo).

## Reglas técnicas

- Nada de SQL manual por copy-paste: todo cambio de esquema va como migración (`npx supabase migration new <nombre>` → editar `.sql` → `npx supabase db push`).
- RLS obligatorio en toda tabla nueva, verificado con llamadas REST directas saltándose la UI (no solo confiar en que la UI no muestra el dato).
- Español mexicano en toda la UI (tú, no vos).
- Antes de escribir código, presentar el plan y esperar confirmación.

## Convención estándar de columnas

Toda tabla nueva (desde Fase 1) incluye:

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null` — sin default; se llena con un trigger `set_updated_at()` (`before insert or update`), no con `default now()`, para que quede fijo también en el insert inicial.
- `deleted_at timestamptz` — borrado suave. Los registros con historial (clientes, reservas, etc.) nunca se borran de verdad; se marcan con `deleted_at`. Las políticas RLS y las queries de la app deben filtrar `deleted_at is null` explícitamente.
- `created_by uuid references auth.users(id)` — nullable (hay filas creadas por trigger, no por una acción de usuario).

RLS se activa (`enable row level security`) en la misma migración que crea la tabla, aunque las políticas lleguen en una migración posterior. Sin políticas, la tabla queda cerrada a todo excepto `service_role` — nunca abierta por omisión.

## Decisiones tomadas en Fase 1

- **`clientes.telefono`** es obligatorio (`not null`) e indexado — es el identificador operativo real del negocio.
- **`clientes.email`** es opcional. Solo importa cuando el dueño quiere cuenta en el portal. Hay un índice único parcial sobre `lower(email)` para los clientes activos (`deleted_at is null`), para que la vinculación automática (Migración 2) no tenga ambigüedad si dos clientes activos comparten correo.
- **Vinculación automática dueño↔cuenta condicionada a email confirmado.** El trigger que enlaza `profiles.cliente_id` buscando por email solo corre si `auth.users.email_confirmed_at is not null`. Sin esto, cualquiera podría registrarse con el correo de un cliente real y heredar su expediente. **Por eso "Confirm email" debe estar activado en Authentication → Providers → Email del proyecto de Supabase (dashboard, no solo en `config.toml` local) antes de dar de alta clientes reales.**
- **Altas de staff (admin/recepcion/estetica) son invite-only**, nunca por self-signup. Se crean desde un route handler server-side que usa la secret key del proyecto (contraparte de la publishable key ya usada en `NEXT_PUBLIC_SUPABASE_ANON_KEY`; en Project Settings → API Keys del dashboard) guardada en una variable de entorno **sin** prefijo `NEXT_PUBLIC_` (nunca expuesta al cliente) para invitar/crear el usuario y fijar su rol vía `supabase.auth.admin`. El self-signup abierto (`enable_signup`) solo debe resultar en cuentas con rol `cliente`.

## Vinculación dueño↔cuenta: cómo funciona en la práctica

Con `enable_confirmations = true`, `email_confirmed_at` siempre es `null` en el momento del `INSERT` en `auth.users` — un solo trigger `AFTER INSERT` nunca alcanzaría a vincular nada. Por eso son dos triggers, ambos llamando a la misma función `vincular_cliente_por_email(p_user_id)`:

1. `on_auth_user_created` (`AFTER INSERT on auth.users`): crea el `profile` con `rol='cliente'` y `cliente_id null`. Llama a la función de vinculación por si el correo ya llegara confirmado (invite de staff, magic link) — normalmente no hace nada porque aún no está confirmado.
2. `on_auth_user_email_confirmed` (`AFTER UPDATE on auth.users`): cuando `email_confirmed_at` pasa de `null` a no-`null`, llama a la misma función. Aquí es donde la vinculación ocurre en la práctica.

La función solo vincula si hay **exactamente un** cliente activo (`deleted_at is null`) con ese correo (case-insensitive). Si no hay match o hay ambigüedad, el `profile` se queda con `cliente_id = null`.

**Cola de vinculación pendiente**: un profile con `rol='cliente'` y `cliente_id null` es un estado válido y esperado (correo sin match, o cliente que nunca dio correo y se registró con uno distinto). Índice parcial `profiles_sin_vincular_idx` + política `profiles_select_recepcion_pendientes` lo dejan listo para que admin/recepción lo resuelvan a mano — falta construir la UI (no es parte de Fase 1 todavía).

## Alta del primer admin

El trigger `handle_new_user()` siempre crea profiles con `rol='cliente'`, y solo un admin puede promover a otro (política `profiles_update_admin`). La primera vez no existe ese admin. Procedimiento, **una sola vez**, manual — vía dashboard, no vía registro en la app (no hay UI de login todavía, y el proyecto puede estar en rate limit de envío de correo):

**1. Crear el usuario ya confirmado, desde el dashboard**

1. Entra a [Authentication → Users](https://supabase.com/dashboard/project/sgfolltpvktbsiisfuzq/auth/users) del proyecto.
2. Botón **Add user → Create new user**.
3. Correo: `jpinadev@gmail.com`. Contraseña: la que vayas a usar de verdad (la necesitas para el login real más adelante).
4. Activa el toggle **Auto Confirm User** — esto llena `email_confirmed_at` directo en el `INSERT`, sin mandar correo.
5. **Create user**.

Esto dispara `on_auth_user_created` (crea el profile con `rol='cliente'`) y, como el correo ya llega confirmado desde el `INSERT` mismo (no por un `UPDATE` posterior), también corre `vincular_cliente_por_email` en ese momento — el mismo trigger de `AFTER UPDATE` nunca se dispara aquí, porque `email_confirmed_at` nunca transiciona de `null` a no-`null`, nace ya así. Es exactamente el caso por el que la vinculación se llama desde los dos triggers (Migración 2).

**2. Antes de promover: probar que esa cuenta (todavía `rol='cliente'`) NO puede escalarse sola**

Dos scripts para el SQL Editor, cada uno en su propio "Run". **Ojo**: en la práctica el Studio SQL Editor *no* envuelve todo el script pegado en una sola transacción — cuando se probó, el `INSERT` de `__prueba_inversa__` sí quedó guardado aunque el `UPDATE` posterior fallara. Después de correr el segundo script, borra la fila de prueba a mano:
```sql
delete from public.clientes where nombre = '__prueba_inversa__';
```

*Intento de auto-promoción a admin* (debe fallar):
```sql
select
  set_config('role', 'authenticated', true),
  set_config(
    'request.jwt.claims',
    json_build_object('sub', u.id, 'role', 'authenticated')::text,
    true
  )
from auth.users u where u.email = 'jpinadev@gmail.com';

update public.profiles set rol = 'admin' where id = auth.uid();
```
Esperado: `ERROR: P0001: Solo un admin puede modificar rol, cliente_id o sucursal_id de un profile`.

*Intento de auto-vinculación a un cliente arbitrario* (debe fallar):
```sql
insert into public.clientes (nombre, telefono)
values ('__prueba_inversa__', '0000000000')
on conflict do nothing;

select
  set_config('role', 'authenticated', true),
  set_config(
    'request.jwt.claims',
    json_build_object('sub', u.id, 'role', 'authenticated')::text,
    true
  )
from auth.users u where u.email = 'jpinadev@gmail.com';

update public.profiles
set cliente_id = (select id from public.clientes where nombre = '__prueba_inversa__')
where id = auth.uid();
```
Mismo error esperado. Recuerda borrar `__prueba_inversa__` de `clientes` después (ver nota arriba).

**3. Promoción real** (SQL Editor corre como `postgres`, sin simular ninguna sesión — por eso esto sí funciona):
```sql
update public.profiles set rol = 'admin'
where id = (select id from auth.users where email = 'jpinadev@gmail.com');
```

**4. Verificación**:
```sql
select p.id, p.rol, p.cliente_id, u.email
from public.profiles p
join auth.users u on u.id = p.id
where u.email = 'jpinadev@gmail.com';
```
Debe mostrar `rol = 'admin'`.

De ahí en adelante, cualquier otro admin o staff se crea desde ese primer admin (invite server-side), nunca repitiendo este procedimiento.

Deliberadamente no vive en una migración: hardcodear un correo personal en el esquema correría en cualquier entorno nuevo (staging, clon del proyecto) y es exactamente el tipo de dato que no pertenece a una migración versionada.

## Bug corregido: `max(uuid)` en la vinculación

La primera versión de `vincular_cliente_por_email` usaba `select count(*), max(id)`. Postgres no tiene operador de orden para `uuid`, así que `max(uuid)` no existe — y como la función corre dentro del trigger `AFTER UPDATE on auth.users`, el error tumbaba la transacción completa de confirmación de correo (el `UPDATE` a `email_confirmed_at` se revertía; el usuario quedaba sin confirmar de verdad aunque hubiera dado clic en el link).

Fix en Migración 4 (`fix_vincular_cliente_por_email_max_uuid`): `array_agg(id)` + `array_length(...) = 1` en vez de `count`/`max`, y toda la función envuelta en `exception when others` — si algo truena ahí, el profile simplemente se queda sin vincular en vez de tumbar el alta o la confirmación del usuario.

Verificado con datos desechables vía `supabase db query --linked` (bypassa RLS):
- **Cero coincidencias**: confirmar el correo no truena; `profiles.cliente_id` queda `null`.
- **Una coincidencia**: `profiles.cliente_id` se llena con el id correcto.
- **Dos clientes activos con el mismo correo**: irrepresentable en la tabla — `clientes_email_activo_idx` (índice único parcial de Migración 1) lo rechaza con `duplicate key value violates unique constraint`. El `array_length(...) = 1` en la función es una defensa adicional para ese caso, hoy inalcanzable por diseño.

## Verificación de aislamiento por rol (Migración 3)

El límite de envío de correos del proyecto (2/hora en el plan hosted) impidió confirmar cuentas de prueba reales para los 4 roles por REST. En su lugar se simuló la sesión de PostgREST directamente en SQL — técnica estándar, más fiel que HTTP porque prueba la capa donde vive RLS de verdad:

```sql
set local role authenticated;
set local request.jwt.claims to '{"sub":"<uuid-de-prueba>","role":"authenticated"}';
-- auth.uid() lee request.jwt.claim.sub / request.jwt.claims->>'sub', igual que con un JWT real
```

Con 5 profiles y 2 clientes de prueba (borrados al terminar), resultado:

| Rol probado | `profiles` visibles | `clientes` visibles |
|---|---|---|
| admin | 5 (todos) | 2 (todos) |
| recepcion | 2 (el suyo + cola de pendientes por vincular) | 2 (todos) |
| estetica | 1 (solo el suyo) | 2 (todos) |
| cliente vinculado | 1 (solo el suyo) | 1 (solo su cliente) |
| cliente sin vincular | 1 (solo el suyo) | 0 |

Casos de seguridad, ambos bloqueados como se esperaba:
- Un `cliente` intentando `update profiles set rol = 'admin'` sobre su propia fila → `P0001: Solo un admin puede modificar rol, cliente_id o sucursal_id de un profile`.
- Un `cliente` intentando `insert into clientes` → `42501: new row violates row-level security policy for table "clientes"`.

Camino permitido confirmado: un `admin` sí puede resolver la cola de vinculación pendiente (`update profiles set cliente_id = ...` sobre el profile de otro usuario).

Pendiente real (no cubierto por esta simulación): probar el flujo completo con un JWT emitido de verdad por GoTrue vía login — requiere esperar el reset del rate limit de email o configurar SMTP propio. La simulación por SQL cubre las políticas RLS al 100%, pero no cubre bugs de configuración de Auth en sí (ej. algo mal puesto en `site_url`/redirects).

## Fase 1 — completa

Los 7 puntos construidos y verificados en el navegador con cuentas/JWT reales (no solo simulación):

1. **Login/logout** — `/login`, Server Actions (`useActionState`), error visible para credenciales inválidas y correo sin confirmar. Middleware refresca la sesión en cada request.
2. **Guardas de ruta por rol** — mismo middleware, lee `profiles.rol` en cada request. Con sesión pero rol equivocado redirige a la zona correcta, nunca a `/login`. Páginas → redirect; API → 401/403 JSON.
3. **Layout con navegación por rol** — grupo de rutas `(staff)` con sidebar filtrado por rol (`src/lib/nav/config.ts`, agregar sección = agregar entrada), drawer móvil de 44px. Portal tiene su propio layout, más simple.
4. **Panel de admin** — lista de cuentas (`listar_cuentas()`), invitar staff (`POST /api/staff/invite`) con link de un solo uso.
5. **Alta y listado de clientes** — `/clientes`, teléfono normalizado a 10 dígitos, búsqueda por nombre/teléfono, baja lógica con confirmación en dos pasos.
6. **Cola de vinculación pendiente** — `/vinculacion` (admin y recepción, no estética), confirmación explícita mostrando ambas partes antes de vincular, desvincular reversible, bitácora (`vinculacion_eventos`) con quién/cuándo/automático.
7. **Portal del cliente** — datos reales (nombre solo lectura, teléfono/correo editables vía RPC `actualizar_mi_cliente`), placeholder de "Tus perros" para Fase 2.

### Decisión de modelado: una cuenta por cliente

`profiles.cliente_id` tiene constraint único (`profiles_cliente_id_unico_idx`, ya desde Migración 2) — un cliente no puede tener dos cuentas de portal a la vez. **Pendiente para Fase 2**: el caso real de una pareja que comparte perro y quiere acceso cada quien (hoy uno de los dos se queda sin cuenta propia; hay que decidir si es un segundo `cliente_id` en `profiles`, una tabla de "contactos autorizados" separada, u otra cosa — no decidido).

### Bug transversal a recordar: índices únicos + RLS

Encontrado dos veces en Fase 1 (vinculación de `profiles.cliente_id`, y de nuevo al diseñar la edición de `clientes.email` desde el portal): si una columna con **índice único** también está protegida por una política RLS de `SELECT` que **no** cubre el estado que tendría una fila en conflicto, Postgres no puede verificar la unicidad y lo reporta como `"violates row-level security policy"` en vez de como conflicto de índice — aunque no exista ningún conflicto real. Dos salidas, según el caso:
- Si quien escribe es personal de confianza (recepción vinculando cuentas): ampliar su política de `SELECT` al estado completo relevante.
- Si quien escribe es un cliente externo (portal editando su propio correo): **nunca** ampliar su visibilidad de otros registros por esto — usar una función `SECURITY DEFINER` que haga el `UPDATE` con visibilidad completa internamente, acotada por `auth.uid()` en la lógica de la función, no por RLS. Ver `actualizar_mi_cliente()`.

Cualquier tabla nueva con índice único + RLS restrictivo (Fase 2 en adelante: `perros`, reservas, etc.) debe revisarse contra esto antes de darla por buena.

### Pendiente para fases posteriores

- Caso de la pareja con dos cuentas por cliente (arriba).
- Repetir las pruebas de aislamiento por rol con un JWT **emitido de verdad por GoTrue vía login** (no simulado con `set_config` ni creado por Admin API) — quedó pendiente por el rate limit de envío de correo del proyecto (2/hora). La simulación cubre las políticas RLS al 100%, pero no bugs de configuración de Auth en sí (`site_url`, redirects, plantillas de correo).
- UI para ver la bitácora de vinculación completa (hoy solo se ve inline en `/vinculacion`; no hay pantalla de auditoría dedicada).
- El expediente completo del perro (Fase 2) — el portal solo tiene el placeholder "Tus perros".

## Fase 2 — completa (esquema + UI)

Modelo del expediente del perro y las pantallas que lo usan: migraciones y UI construidas y verificadas con JWTs reales (cuentas de prueba creadas vía Admin API + login real, no solo simulación) en cada punto.

### Modelo de datos

- **`tamanos_categoria`, `tipos_pelaje`**: catálogos (chico/mediano/grande/gigante; corto/medio/largo/rizado). Fase 3 los usa para tarifa — el pelaje pesa tanto como el tamaño en el precio de estética.
- **`perros`**: tabla base — identidad del perro, tamaño/pelaje, `fallecido`/`fecha_fallecimiento` (no reutiliza `deleted_at`: un perro fallecido sigue siendo parte del historial del cliente, solo se muestra con tacto). Los 5 campos que el dueño puede editar (contacto de emergencia, veterinario, autorización médica, tope de gasto, notas de alimentación) conviven en la misma fila con campos de solo-staff — por eso el dueño no tiene política de `UPDATE` directa, edita vía `actualizar_mi_perro()` (`SECURITY DEFINER`, mismo patrón que `actualizar_mi_cliente`).
- **`perro_historial_dueno`**: bitácora append-only de cambios de dueño (trigger `registrar_cambio_dueno_perro` en `perros.cliente_id`).
- **`perro_accesos_compartidos`**: resuelve el caso "pareja separada, dos cuentas, un perro" (pendiente desde Fase 1, ver abajo) sin tocar el modelo cliente/profile — dueño principal sigue siendo `perros.cliente_id`, un acceso compartido solo da lectura adicional. Solo staff lo da de alta.
- **`tipos_requisito_sanitario`**: catálogo generalizado de vacuna + desparasitación (misma forma: fecha, vigencia, obligatoria — Fase 4 va a preguntar "¿qué le falta a este perro?" cruzando ambas categorías con una sola vista, no dos sistemas paralelos). `es_critica` (bordetella) da prominencia de UI sin mezclarse con `obligatoria` (que es la señal de bloqueo de negocio). `dias_aviso_vencimiento` (default 30) fija el umbral de "por vencer" ahí — no incrustado en la vista, porque es un número que el negocio va a querer mover.
- **`requisitos_sanitarios_aplicados`**: aplicaciones reales. `fecha_vencimiento` es una columna generada (`GENERATED ALWAYS AS (...) STORED`) a partir de `vigencia_meses_aplicado`, congelado en cada fila al momento de aplicar — un cambio futuro a la vigencia del catálogo no recalcula vencimientos ya registrados. Incluye `comprobante_path` (foto del carnet físico, mismas reglas de privacidad que la foto del perro).
- **Vista `perro_requisitos_sanitarios_estado`**: cruza cada perro activo contra cada requisito obligatorio (`CROSS JOIN` + `LEFT JOIN LATERAL` a la última aplicación), devuelve 4 estados: `sin_registro`, `vigente`, `por_vencer`, `vencida`. `security_invoker = true` (respeta el RLS de quien consulta). Punto clave: un perro sin ningún registro aparece como `sin_registro` en vez de desaparecer de la consulta — con un `DISTINCT ON` ingenuo sobre las aplicaciones existentes, ese perro se hubiera colado sin bloqueo en la futura Fase 4.
- **`pesos_registrados`** + vista `perro_peso_actual` (`DISTINCT ON`): peso historizado, no vive en `perros` — cambia cada visita, a diferencia del tamaño (que sí vive ahí porque fija tarifa).
- **`catalogo_alertas`** + **`perro_alertas`**: vocabulario controlado de alertas de manejo (muerde, se escapa, no socializa, agresivo con la comida, alergia grave, ansiedad de separación) en vez de texto libre — así se puede destacar en la UI de recepción, no enterrarse en un párrafo. Staff-only incluso para lectura (no se muestra en el portal). `activa` reemplaza a `deleted_at` en esta tabla: una alerta resuelta sigue en el historial, no se borra.
- **`perro_alergias`**: columnas `confirmada`/`reportado_por` agregadas ya (default `confirmada=true`, sin reporte) para la función futura "el dueño reporta una alergia, recepción la confirma" — no construida todavía, solo prevista para no requerir otra migración cuando se construya.
- **`perro_medicamentos`**: régimen/prescripción (dosis, horario, vigencia), no el registro de si ya se administró — eso queda para Fase 9 a propósito, y el `id` de esta tabla ya es estable para que esa fase solo agregue una tabla nueva que la referencie.
- **`actualizar_mi_perro()`**: RPC `SECURITY DEFINER`, mismo patrón que `actualizar_mi_cliente()`. Solo el dueño principal (`perros.cliente_id`), no un acceso compartido.
- **Bucket Storage `perros-archivos`** (privado): foto de perfil del perro + comprobante de vacuna/desparasitación. Ruta `{cliente_id}/{perro_id}/perfil/...` o `{cliente_id}/{perro_id}/requisitos/{requisito_id}/...`. Las políticas de `storage.objects` **no confían en el segmento `{cliente_id}` de la ruta** (cualquiera podría escribir ahí un cliente_id ajeno) — validan contra la propiedad real de `{perro_id}` en `public.perros` (+ acceso compartido). El folder `{cliente_id}` es solo organización para el staff, nunca la fuente de verdad del permiso.

### Quién escribe qué (acordado con el negocio)

- **Dueño edita** (vía RPC, nunca RLS directo): contacto de emergencia, veterinario, autorización médica, tope de gasto, notas de alimentación.
- **Los tres roles de staff escriben**: peso, alergias, alertas — quien detecta el problema lo reporta.
- **Solo admin/recepción escriben**: alta/edición del perro, vacunas/desparasitación, medicamentos.
- **Visibilidad**: alertas y alergias son staff-only incluso para lectura. Vacunas, peso y medicamentos sí los puede leer el dueño (transparencia — "¿cuándo le toca la próxima vacuna a mi perro?").

### UI construida (los 6 puntos, en orden)

1. **Alta/edición de perro** — accesible desde el expediente del cliente (`/clientes/[id]/perros/nuevo`, `/perros/[id]`), porque así es como recepción llega: primero a la persona, luego a su perro. Solo admin/recepción editan los campos base; estética ve la misma pantalla en solo lectura.
2. **Foto del perro** — subida directa desde el navegador con la sesión del usuario (no pasa por el servidor de Next.js), compresión y corrección de orientación EXIF del lado del cliente antes de subir (`createImageBitmap` + canvas, ver `src/lib/imagen.ts`), input con `capture="environment"` para cámara en tablet, ruta fija por perro para que reemplazar sea un upsert sin huérfanos, y una política de `DELETE` para staff que faltaba en el bucket original (migración aparte, `add_perros_archivos_delete_staff`).
3. **Requisitos sanitarios** — registro (tipo, fecha con tope de hoy, veterinario/producto según categoría, notas, comprobante), historial completo, y el resumen de 4 estados visible tanto en el expediente del perro como en el del dueño. `sin_registro` usa el mismo tratamiento visual que `vencida` a propósito — es el caso más peligroso, no debe leerse como "más tranquilo". Bordetella lleva una insignia "CRÍTICA" aparte del color de estado.
4. **Peso** — registrar lectura + historial. El aviso de "baja notable" exige **dos condiciones a la vez**: 10% relativo Y un piso absoluto de 0.4 kg (sin el piso, un chihuahua que baja 200 g dispara la alerta por nada). Se muestra el tiempo entre lecturas, y si la baja fue en menos de 30 días el aviso escala (borde más grueso, texto más urgente). Un alza notable se marca en tono informativo (azul), no de alarma.
5. **Alertas de manejo y alergias** — nunca se borran, se desactivan (`activa=false`) y el motivo de baja se guarda con fecha en las notas de esa fila. El banner de alertas activas + alergias graves no colapsa nada: se muestra completo, arriba de todo (antes que el resumen sanitario), en el expediente del perro y, en versión compacta, junto a cada perro en el expediente del dueño. Verificado con JWT real que un `cliente` no puede leer `perro_alertas` (RLS ya lo bloqueaba desde el esquema) aunque sí lee `perro_alergias`.
6. **Portal del cliente** — lista de perros con foto (propios + acceso compartido, RLS ya combina ambos sin necesidad de filtrar en la query), ficha en solo lectura de lo clínico, edición únicamente de los 5 campos vía `actualizar_mi_perro()`. Estado sanitario redactado como recordatorio ("Para tu próxima visita: ..."), no como regaño. Un perro con acceso compartido se ve igual pero con una insignia "Acceso compartido" y sin formulario de edición. Un perro fallecido se queda en la lista tal cual, con una insignia gris discreta — nunca tachado en rojo ni ocultado de golpe. Verificado con JWT real que un perro con alerta crítica no muestra ni rastro de ella en el portal.

### Bug corregido: fechas `date` mostradas un día antes

`formatearFecha()` (Fase 1) hace `new Date(iso)` y formatea con `Intl.DateTimeFormat` — correcto para `timestamptz`, pero una columna `date` como `"2026-07-28"` se parsea como medianoche UTC, y en un huso horario negativo (México, UTC-6) eso se muestra como el día **anterior**. Apareció al construir el historial de requisitos sanitarios y de peso. Fix: `formatearFechaCalendario()` nueva en `src/lib/formato.ts`, arma la fecha con año/mes/día locales (`new Date(anio, mes-1, dia)`) en vez de parsear el string ISO directo. Se usa en todo lo que muestre una columna `date` (`fecha_aplicacion`, `fecha_vencimiento`, `fecha_nacimiento`, `pesos_registrados.fecha`); `formatearFecha()` original se deja intacta para `timestamptz` (`created_at`, etc.), donde sí es correcta.

### `created_by` automático (aplica a todo el proyecto, no solo Fase 2)

Se agregó `default auth.uid()` a la columna `created_by` en las 15 tablas del patrón (Fase 1: `sucursales`, `clientes`, `profiles`; Fase 2: las 12 nuevas). Antes dependía de que cada pantalla lo mandara explícito; con 7 fases más por delante era cuestión de tiempo que se olvidara justo donde importara la auditoría. Un `DEFAULT` alcanza (no hace falta trigger): si el `INSERT` no lo manda, Postgres llama a `auth.uid()`; si lo manda explícito, ese valor gana.

**Límite conocido**: un `INSERT` hecho con la secret key (`service_role`, sin sesión) o SQL corrido directo como `postgres` (migraciones, SQL Editor) sigue dando `null` — no hay JWT que `auth.uid()` pueda leer ahí, el default no inventa un usuario donde no lo hay. Hoy el único uso del cliente admin en el código (`/api/staff/invite`) hace `UPDATE`, no `INSERT`, así que no lo toca. Si en el futuro se agrega un `INSERT` vía el cliente admin actuando en nombre de un staff, ese código va a tener que mandar `created_by` explícito con el id del caller.

### Verificado con JWTs reales (cuentas de prueba vía Admin API + login real, todas borradas al terminar)

- Aislamiento de `perros`: cliente ve solo el suyo (+ acceso compartido); staff ve todos.
- Cliente bloqueado en `UPDATE` directo a `perros` (0 filas); sí puede vía `actualizar_mi_perro()`.
- Cliente bloqueado en lectura de `perro_alertas` de su propio perro.
- Acceso compartido: solo lectura confirmada; RPC de edición bloqueado para quien no es el dueño principal.
- Estética escribe peso; bloqueada en `requisitos_sanitarios_aplicados` y en edición de `perros`.
- Vista de 4 estados probada con perros reales de prueba: `sin_registro`, `vigente`, `vencida`, `por_vencer`, los 4 correctos.
- Trigger de historial de dueño: cambio de `cliente_id` quedó registrado con el cliente anterior y el nuevo.
- `created_by` se llena solo sin que la app lo mande explícito.
- Storage: cliente lee su propia foto (200); ruta real de un perro ajeno y ruta manipulada (su propio `cliente_id` + `perro_id` ajeno) ambas bloqueadas igual (404, RLS oculta la existencia del objeto); subida bloqueada para cliente (403 RLS); sin política de `DELETE` para staff — confirmado que ni con JWT de recepción se pudo borrar un objeto (siguió existiendo hasta borrarlo con la secret key).

### Decisiones propias marcadas para confirmar con el negocio

- Vigencia de desparasitación interna: **6 meses, valor supuesto** (no confirmado). En cachorro es más frecuente, pero como ya es editable por aplicación individual no hace falta modelarlo por edad.
- `perro_medicamentos` se dejó como solo admin/recepción (el acuerdo Q2 no cubrió medicamentos explícitamente) — confirmar si estética también debería poder registrar uno.
- Acceso compartido (`perro_accesos_compartidos`) es de solo lectura por defecto — nadie más que el dueño principal (`perros.cliente_id`) edita.

Ya confirmados con el negocio en esta fase (dejan de ser supuestos): el umbral de "por vencer" (30 días, ahora en `tipos_requisito_sanitario.dias_aviso_vencimiento`, no en la vista) y el criterio de "baja notable" de peso (10% relativo + piso absoluto de 0.4 kg + escalamiento si la baja fue en menos de 30 días).

### Pendiente

- **UI de `perro_medicamentos`**: el esquema y las políticas RLS existen (solo admin/recepción escriben), pero ninguna pantalla los usa todavía — no se pidió como parte de los 6 puntos de esta fase.
- **UI para dar de alta un acceso compartido**: `perro_accesos_compartidos` funciona de punta a punta (el portal ya lo muestra correctamente, con su insignia y sin edición) pero hoy la única forma de crear ese acceso es SQL directo — falta un botón/formulario en el expediente del perro para que admin/recepción lo den de alta sin tocar la base a mano.
- Repetir las pruebas de aislamiento por rol de Fase 1 con un JWT emitido de verdad por GoTrue vía login (login normal, no invite) — sigue pendiente desde Fase 1, no bloquea nada de Fase 2.

## Fase 3 — completa (catálogo de servicios y tarifas)

Resumen retroactivo (construida en una sesión anterior a la que documentó el resto de este archivo en detalle):

- **`servicios`**: catálogo con `categoria` (`guarderia`, `hotel`, `estetica`, `cargo`) — esta columna termina siendo la bisagra de Fase 4: distingue qué servicios pueden ir en una `estancia` (guardería/hotel), cuáles en una `cita_estetica` (estética) y cuáles son cargos extra aplicables sobre una estancia (`cargo`, p. ej. recogida tardía).
- **`tarifas`**: tabla insert-only (vigencia por fecha, nunca se edita una tarifa ya capturada — una corrección es una fila nueva con vigencia posterior). Precio depende de tamaño del perro y, para estética, también del pelaje.
- **`resolver_precio(p_servicio_id, p_tamano_id, p_pelaje_id, p_cantidad, p_fecha default fecha_negocio())`**: función canónica de resolución de precio, siempre devuelve una fila con `estado` en (`disponible`, `no_aplica`, `sin_tarifa`) — nunca un `null` silencioso. Se volvió el patrón repetido en Fase 4 (`resolver_cupo_configuracion`, `perro_requisitos_sanitarios_estado`): estado explícito sobre ausencia silenciosa.
- **`tarifas_vigentes`**: vista de solo lectura para mostrar la tarifa vigente de cada combinación sin repetir la lógica de `resolver_precio` en el cliente.
- UI: catálogo de servicios y matriz de captura de tarifas (`matriz-tarifas.tsx`) por tamaño × pelaje.
- **Bug corregido, relevante para el checklist de CLAUDE.md**: `created_by` de `servicios`/`tarifas` no tenía `default auth.uid()` — encontrado con JWT real ya en Fase 4, corregido en `fix_created_by_default_fase3_fase4.sql`. Motivó agregar la sección "Checklist: tabla nueva" a `CLAUDE.md`.

## Fase 4 — completa (reservas, cupo, calendario, check-in/out, cargos, agenda de estética, series recurrentes)

Seis pantallas, construidas y verificadas con JWT real en cada una. Tema transversal de la fase: **disciplina de zona horaria** (San Luis Potosí = `America/Mexico_City`, UTC-6 fijo, sin horario de verano desde 2022; el servidor de Postgres corre en UTC). Toda fecha/hora de negocio se resuelve con `fecha_negocio()`/`hora_negocio()` (SQL) o `hoyNegocio()`/`fechaLocalDeInstante()`/`horaLocalDeInstante()` (`src/lib/formato.ts`) — nunca `current_date`/`now()`/`new Date().toISOString().slice(0,10)` directo en lógica de negocio. Un barrido sistemático a mitad de fase encontró y corrigió 7 bugs de esta clase (`barrido_zona_horaria_fixes.sql` + varios archivos de la app).

### Modelo de datos

- **`estancias`**: unifica guardería y hotel. `daterange(fecha_entrada, fecha_salida)` generado — guardería siempre es un rango de 1 día (`fecha_salida = fecha_entrada + 1`), hotel abarca noches reales. `EXCLUDE` por GiST evita que el mismo perro tenga dos estancias activas traslapadas. Cupo (`cupo_configuracion` + `resolver_cupo_configuracion()`, diurno/nocturno por separado) se hace cumplir en el trigger `validar_estancia()` con `pg_advisory_xact_lock` + recorrido día a día — a nivel de trigger, no de un RPC opcional, para que ningún camino de inserción se lo salte.
- **`reservas`**: encabezado ligero (cliente, notas), sin estado propio — el estado real vive por `estancia` (o por `cita_estetica`), porque cancelar un perro de una reserva familiar no debe tocar a los demás.
- **Máquina de estados compartida**: `estado_inicial_reserva_valido()` y `transicion_estado_reserva_valida()` — mismas funciones usadas por `validar_estancia()` y `validar_cita_estetica()`. `reservada → confirmada → en_curso → finalizada`, con `cancelada`/`no_llego` como ramas terminales desde `reservada`/`confirmada`.
- **`cargos_aplicados`**: cargos extra (recogida tardía, etc.) sobre una estancia, con snapshot de precio vía `resolver_precio`. Cancelar un cargo deja rastro (`cancelado`, `motivo_cancelacion`, `cancelado_por`, `cancelado_at` — llenados por trigger) y **un cargo cancelado nunca se puede reactivar**: es la defensa contra el hueco clásico de caja en efectivo.
- **`citas_estetica`**: tabla separada de `estancias` porque el recurso es distinto (tiempo de un empleado, no cupo de guardería). `EXCLUDE` por `empleado_id` + rango de tiempo. `estancia_id` nullable: si la cita es de un perro que ya está hospedado, no pide entrega/recogida propias (esos campos solo son obligatorios en visitas sueltas de estética).
- **`series_recurrentes`**: el patrón ("este perro viene todos los martes y jueves a guardería") — `perro_id`, `servicio_id`, `dias_semana int[]` (1=lunes…7=domingo, mismo criterio que `extract(isodow from fecha)`), `fecha_inicio`, `fecha_fin` opcional.
- **`generar_estancias_serie(p_serie_id, p_horizonte_semanas default 8)`**: materializa un horizonte acotado (nunca genera años a futuro de una sola vez). Cada fecha candidata se intenta en su propio savepoint implícito (`BEGIN/EXCEPTION` de plpgsql) — si una fecha choca con cupo o requisito sanitario, no aborta el resto del horizonte; devuelve `(fecha, exito, motivo)` por fecha. Salta en silencio (sin reportar ni éxito ni fallo) las fechas que ya tienen una estancia no borrada para esa serie — necesario para que "renovar horizonte" no reintente y reporte como "fallidas" fechas que ya existían.
- **`series_pausas`**: rango de pausa por vacaciones (`desde`, `hasta`, `motivo`), tabla aparte de `series_recurrentes` porque puede haber varias pausas en la vida de una serie. `generar_estancias_serie` salta cualquier fecha dentro de un rango de pausa activo.
- **Distinción clave para "editar una serie ya materializada"**: al cambiar el patrón (días/servicio/fecha fin), las estancias futuras que **todavía no iniciaron** (`estado in ('reservada','confirmada')` y `fecha_entrada >= hoy`) se cancelan **y además se borran** (`deleted_at`) — no solo se cancelan — para que `generar_estancias_serie` no las cuente como "ya existentes" y pueda rellenar esas fechas con el patrón nuevo. Una cancelación suelta de un día (`cancelarEstancia`, reutilizada tal cual de la pantalla 2) nunca toca `deleted_at`, así que una fecha dada de baja a propósito no revive sola en la siguiente renovación. Las estancias con check-in ya hecho o que ya pasaron nunca se tocan, sin importar cuál de los dos caminos se use.

### Las seis pantallas

1. **Calendario de ocupación** (`/reservas`) — llegadas/salidas/quién está adentro del día, más una tabla de disponibilidad diurna/nocturna de los próximos 14 días (`calendario_ocupacion()` RPC, vistas `llegadas_hoy`/`salidas_hoy`/`quienes_estan_adentro`).
2. **Crear reserva** (`/reservas/nueva`, también walk-in en `/reservas/checkin/walkin` reusando el mismo formulario) — uno o varios perros de la misma familia, éxito parcial por perro (reintentar solo lo que falló, incluida excepción sanitaria autorizada por admin con motivo). Detalle de reserva (`/reservas/[id]`) con cancelar estancia suelta, mover fechas, marcar "no llegó", cancelar la reserva completa (solo toca lo cancelable, cuenta lo que no).
3. **Check-in/check-out** (`/reservas/estancias/[id]/checkin|checkout`) — hora real de entrada/salida, pertenencias confirmadas también al checkout (no solo capturadas al entrar), quién entrega/quién recoge con distinción explícita de si es el dueño registrado, foto de llegada, botón "Extender estancia" de un clic, walk-in con las mismas validaciones que cualquier reserva.
4. **Cargos aplicados** — catálogo de cargos con snapshot de precio, total corriente visible en la estancia y en la reserva, sugerencia (no aplicación automática) de cargo por recogida tardía calculada con `minutos_retraso_cierre()`, cancelación con rastro obligatorio.
5. **Agenda de estética** (`/agenda`) — vista día/semana por empleado, agendar/reagendar/cancelar/marcar no llegó/iniciar/finalizar, aviso (no bloqueo) de fuera de horario, cita ligada a una estancia en curso no pide entrega/recogida propias.
6. **Series recurrentes** (`/reservas/series`) — crear el patrón y generar el horizonte de 8 semanas mostrando qué fechas se crearon y cuáles no cupieron con su motivo; renovar horizonte con un botón; **editar el patrón** mostrando cuántas estancias futuras se van a cancelar y regenerar antes de confirmar; **pausar por vacaciones** (libera cupo de un rango sin cancelar la serie ni tocar día por día); cancelar un día suelto o la serie completa (cancela solo lo futuro sin iniciar, nunca lo que ya tiene check-in o ya pasó); insignia de "serie recurrente activa" en el expediente del perro y aviso en los formularios de nueva reserva para que recepción no acepte una reserva suelta que choque con el patrón.

### Bug encontrado y corregido durante la construcción de la pantalla 6

Al cancelar la serie completa, la página de detalle daba **404** justo después de la acción: la consulta filtraba `deleted_at is null` sobre `series_recurrentes`, y cancelar la serie es precisamente poner `deleted_at`. Corregido quitando ese filtro de la página de detalle (una serie cancelada debe poder seguir viéndose, con su historial, solo sin las acciones de mutación) — el listado (`/reservas/series`) sí mantiene el filtro, para no mostrar series canceladas como activas.

### Verificado con JWT real (cuenta de prueba vía Admin API, datos borrados al terminar)

- `generar_estancias_serie` con bloqueo sanitario real (perro sin requisitos vigentes): las 17 fechas del horizonte fallan limpio con motivo explícito, sin dejar estancias huérfanas.
- Con requisitos sanitarios vigentes: mismo horizonte, 17/17 fechas creadas.
- Renovar horizonte sin cambios: devuelve `[]` (ninguna fecha ya existente se reintenta ni se reporta como fallo).
- Renovar con horizonte más amplio: solo devuelve las fechas nuevas más allá de las ya generadas.
- Cancelar un día suelto y renovar de nuevo: esa fecha no revive.
- Editar el patrón (martes/jueves → miércoles): preview mostró el conteo correcto de estancias futuras afectadas (20), las canceló, regeneró 8 fechas nuevas con el patrón nuevo, y una fecha cancelada suelta previamente se mantuvo intacta (no se tocó ni se regeneró).
- Pausar por vacaciones: registra la pausa y cancela las estancias futuras dentro del rango; quitar la pausa no resucita lo ya cancelado (solo permite que una futura renovación vuelva a generar esas fechas si aún no pasaron).
- Cancelar serie completa: cuenta correctamente 0 afectadas cuando ya no quedaba nada pendiente por cancelar.
- Insignia de "serie recurrente activa" visible en el expediente del perro (solo series activas, no las canceladas) y aviso correspondiente en "Nueva reserva" antes de marcar el perro.

### Pendiente / decisiones marcadas para confirmar con el negocio

- `servicios.duracion_minutos` para las filas de estética existentes se llenó con valores supuestos al agregar la columna — no confirmado con el negocio.
- No hay UI para "deshacer" una pausa mal capturada más allá de quitarla hacia adelante (no resucita estancias ya canceladas por esa pausa) — si el negocio pide eso, hace falta un flujo explícito de "restaurar" en vez de solo insertar la reserva/estancia de nuevo a mano.
- La visibilidad de "serie activa" se resolvió en el expediente del perro y en el formulario de nueva reserva (el punto concreto de riesgo de choque); no se agregó a la tabla agregada de ocupación de `/reservas` por no tener una columna natural por perro ahí — revisar si el negocio la echa de menos ahí también.

## Fase 5 — en curso (POS: cobros, bonos, descuentos, caja)

Construida en cuatro bloques (A–D), cada uno parado para prueba del negocio antes de seguir con el siguiente, más una decisión explícita (Bloque E) sobre qué hacer si se cae el internet a media venta.

### Bloque A — la cuenta y el cobro

- **`cuenta_lineas_reserva(p_reserva_id)`** / **`cuenta_totales_reserva(p_reserva_id)`**: juntan en una sola cuenta las estancias, cargos y citas de estética ligadas de una reserva (una cita ligada a una estancia se incluye por `estancia_id`, no por su propio `reserva_id` — `crearCita` siempre le crea su propia reserva de un renglón, aunque esté ligada). `cuenta_totales_reserva` es la única fuente de verdad del saldo pendiente; se fue extendiendo en cada bloque siguiente (bono, descuento) en vez de duplicarse.
- **`cobros` / `cobro_metodos`**: un cobro puede repartirse entre efectivo/terminal/transferencia, cada método con su propia propina (la de efectivo está físicamente en el cajón, la de terminal no — por eso vive por método, no como un monto global). Tablas ledger puras: sin política de UPDATE para `authenticated`, así que ni con acceso directo a la API se puede editar o borrar un cobro ya hecho. Única puerta de entrada: `registrar_cobro()` (`SECURITY DEFINER`), que resuelve el turno abierto él mismo y mete encabezado + líneas en una sola transacción.
- **`devoluciones` / `devolucion_metodos`**: nunca tocan el cobro original — un movimiento inverso aparte, con motivo obligatorio y `autorizado_por`. Decisión propia: **solo admin puede registrar una devolución** (dinero saliendo de caja es más sensible que dinero entrando); si el negocio prefiere que recepción también pueda bajo un tope, avisar. No se puede devolver más de lo que sigue cobrado neto de ese cobro.
- **Bug real encontrado construyendo esto**: `estancia-fila.tsx` y las pantallas de check-in/checkout (Fase 4) mostraban `precio_unitario` como si fuera el total de la estancia — para hotel de varias noches cobraba de menos (guardería, siempre 1 noche, lo ocultaba). Corregido ahí y es la razón por la que `cuenta_lineas_reserva` multiplica por noches en vez de repetir el cálculo a mano en cada pantalla.

### Bloque B — bonos prepagados

- **`bonos_clientes`**: por cliente, no por perro (cualquier perro de la familia lo puede consumir). `cantidad_total`, `precio_pagado` y `fecha_vencimiento` son snapshots al comprar. `reserva_id` nunca es null: comprar un bono pasa por el mismo `registrar_cobro()` que cualquier otra cosa (`comprar_bono()` le crea su propia reserva de un renglón), así el arqueo (Bloque D) nunca tiene que sumar una segunda fuente de dinero.
- **`movimientos_bono`**: `tipo` explícito `'venta'` (ingreso diferido, no reconocido) / `'consumo'` (ingreso reconocido, prorrateado a `precio_pagado / cantidad_total` — así Fase 8 puede sumar cada tipo sin inferir nada).
- **Bug real, el más delicado de la fase**: el saldo pendiente restaba el monto de `'consumo'` (el ingreso reconocido, ya con el descuento del paquete) en vez del valor de lista de la línea cubierta — dejaba un saldo falso pendiente en una visita ya pagada por completo con el bono. Son dos números a propósito: `movimientos_bono.monto` sigue siendo el ingreso reconocido (correcto para reportes), pero lo que resta del saldo en `cuenta_totales_reserva` es `cantidad × precio real de la línea`.
- **Segundo bug**: nada impedía aplicar un bono dos veces sobre la misma línea. Corregido en el propio RPC (`consumir_bono` topa contra la cantidad propia de la línea, no solo en la pantalla) y la pantalla ya oculta el botón cuando la línea ya está cubierta.

### Bloque C — descuentos

- **`catalogo_descuentos`**: motivo controlado (segundo perro, cliente frecuente, temporada, referido, cortesía por incidente), editable a futuro sin migración.
- **`configuracion_descuentos`**: tope de recepción versionado por fecha (mismo patrón que `tarifas`/`cupo_configuracion`) — **sin configurar, el tope es $0**, nunca "sin límite". Configurable desde `/admin`.
- **`aplicar_descuento()`**: porcentaje o monto fijo, resuelto contra el total de la cuenta en pesos. Dentro del tope, recepción o admin; arriba del tope, solo admin y con motivo obligatorio — validado en el RPC, no solo en la pantalla. No se puede descontar más de lo que vale la cuenta.

### Bloque D — turno de caja y arqueo

- **`turnos_caja`**: un solo turno abierto a la vez (índice único parcial). Recepción cierra su propio turno; admin ve y cierra todos.
- **`movimientos_caja`**: retiros parciales de efectivo (solo efectivo tiene sentido físico aquí).
- **`cortes_caja` / `corte_metodos`**: el arqueo. **Corte ciego real, no solo de pantalla**: `cerrar_turno()` recibe el conteo de los tres métodos y, si hay diferencia, la revela recién ahí (nunca antes) junto con pedir una explicación obligatoria — la función se llama dos veces con el mismo conteo (primera vez sin explicación, revela; segunda vez con explicación, cierra). Sin diferencia, cierra directo en la primera llamada. Las diferencias nunca se ajustan solas: quedan con su monto exacto y la explicación, siempre.
- `esperado` por método: efectivo = fondo inicial + cobros (monto + propina) − devoluciones − retiros, de ese turno; terminal/transferencia = cobros (monto + propina) − devoluciones de ese turno, sin fondo ni retiros (no hay nada físico que sacarles).

### Bloque E — qué pasa si se cae el internet a media venta

**Decisión: no se construye modo offline. Se cobra en papel y se captura en el sistema en cuanto vuelva la conexión.** Documentado aquí a propósito para que quede como decisión consciente, no como algo que se nos olvidó resolver.

Qué tan grave es en la práctica: la app entera depende de Supabase para todo, no solo para cobrar — sin internet tampoco se puede hacer check-in, ver el calendario, nada. Es un solo local con conexión fija (no un caso de campo con señal irregular por naturaleza), así que la frecuencia esperada es baja; cuando pasa, es total pero acotado en el tiempo. El riesgo real de "a media venta" no es que el dinero se pierda — nada impide que el staff cobre efectivo en la mano aunque la pantalla no cargue — es que ese cobro no quede registrado a tiempo y se reconcilie mal después.

Por qué no construir offline ahora: requeriría cola local de cobros pendientes, sincronización con reintentos, y resolución de conflictos si el turno ya se cerró para cuando vuelve la conexión — todo esto directamente en la ruta de dinero, que es exactamente donde un bug sutil es más caro. Es alcance de fase completa, no un ajuste chico, para un evento de baja frecuencia en un solo local.

Mitigación que ya existe sin construir nada nuevo: cada operación de dinero (`registrar_cobro`, `comprar_bono`, `consumir_bono`, `aplicar_descuento`, `cerrar_turno`) es una sola transacción atómica — si la conexión se cae a medio clic, no puede quedar un cobro a medias (encabezado sin métodos, corte con solo 2 de 3 métodos, etc.): o se guardó completo, o no se guardó nada. Eso ya cubre el escenario más peligroso de "a media venta" sin ningún código adicional.

Procedimiento recomendado, sin construir nada: cobrar en papel (monto, método, cliente) durante la caída; en cuanto vuelva la conexión, capturar cada cobro con `registrar_cobro` normal, usando el campo de notas para dejar constancia ("cobrado en papel a las X, capturado tarde"). Un punto operativo importante que si no se dice se presta a un arqueo falso: **no cerrar el turno del día hasta haber capturado todos los cobros en papel de ese turno** — si se cierra antes, el conteo ciego va a mostrar un faltante que no es real, y quien lo cierre va a tener que escribir una explicación de una diferencia que en realidad es solo captura pendiente.

Si en el futuro esto se vuelve un problema recurrente (varios locales, personal en campo, internet poco confiable de verdad), ahí sí vale la pena revisar opciones — no antes.

## Fase 6 — contratos (plantillas, PDF, firma, visibilidad operativa)

Construida en tres bloques (A–C), cada uno probado con JWTs reales (cuentas de prueba vía Admin API, datos borrados al terminar) antes de seguir con el siguiente.

### Bloque A — plantillas con versionado

- **`plantillas_contrato`**: insert-only, `version` autoincremental, bandera `activa` con índice único parcial (`where activa`) en vez de vigencia por fecha — publicar un contrato nuevo es una decisión explícita de negocio, no algo que deba activarse solo en una fecha futura. Publicar (`publicar_plantilla()`, solo admin) desactiva la anterior e inserta la nueva versión en la misma transacción. Cambiar el texto nunca toca las plantillas ya usadas — `contratos.plantilla_id` es FK dura a la versión exacta con la que se firmó cada contrato, para siempre.
- **Válvula `requiere_refirma`** (agregada después de cerrar la fase, a petición explícita del negocio): sin esto, un contrato firmado hace años sigue contando como al día para siempre, aunque cambie algo de fondo (tope de gasto médico, cláusula de responsabilidad). Marcar una versión como `requiere_refirma = true` (al publicarla, vía `publicar_plantilla(..., p_requiere_refirma)`, o después vía `marcar_requiere_refirma()` sobre cualquier versión ya publicada) la convierte en el "punto de quiebre": cualquier contrato firmado con una versión **anterior** a la marcada más alta deja de contar como vigente — ver Bloque C.
- **`resolver_campos_contrato(p_perro_id)`**: junta datos del dueño, del perro, autorización médica con su tope de gasto y consentimiento de uso de imagen en un solo `jsonb` para llenar los `{{token}}` de la plantilla. Deliberadamente **no** es `security definer` — corre con el RLS de quien la llama, así que un dueño consultando el perro de otra familia recibe `null`, no el expediente ajeno. Verificado con JWT real.

### Bloque B — generación, firma y subida en papel

- **`contratos`**: `perro_id` + `cliente_id` denormalizado (mismo criterio que `estancias`/`reservas` — sobrevive un cambio de dueño futuro), `estado` en (`pendiente_firma`, `firmado_digital`, `firmado_papel`, `cancelado`) con checks que exigen los campos correctos según el estado (`firmado_digital` pide `firmado_por` + `ip_firma`; `firmado_papel` pide `subido_por`; `cancelado` pide `motivo_cancelacion`). Tabla ledger: sin política de INSERT/UPDATE para `authenticated`, todo pasa por RPC (`generar_contrato`, `finalizar_firma_contrato`, `subir_contrato_papel`, `cancelar_contrato`).
- **PDF con `pdf-lib`**: generado, en el caso de firma digital, del lado del servidor (no en el navegador) — el bloque de auditoría necesita la IP real del request (`headers().get('x-forwarded-for')`), que no se puede confiar si la calcula JS del cliente. El hash SHA-256 se calcula sobre los bytes finales del PDF (que ya incluyen fecha/hora/IP impresas) y se guarda **fuera** del PDF, en `contratos.hash_pdf` — verificar después es descargar el archivo y recalcular el hash, sin depender de nada que viva dentro del propio documento.
- **Firma en pantalla**: canvas con eventos de puntero (mouse/dedo/lápiz unificados), pensado para firmar con el dedo en un celular.
- **Contrato firmado en papel**: mismo patrón de subida directa que la foto del perro (Fase 2) — el navegador sube el archivo directo a Storage con la sesión del usuario, calculando el hash del lado del cliente (`crypto.subtle.digest`) antes de subir. Queda marcado como `firmado_papel`, nunca se confunde con una firma electrónica.
- **Bug real, encontrado probando con un cliente de verdad**: la política de SELECT de `plantillas_contrato` era solo para staff — un cliente veía su propio `contrato` pero el join embebido a la plantilla le regresaba `null`, y la firma hubiera fallado siempre para un dueño real. Corregido ampliando el SELECT a cualquier autenticado (mismo criterio que `servicios`/`tarifas`: el texto que vas a firmar no es información confidencial del negocio).
- **Verificado con JWT real**: firma digital de punta a punta (incluida descarga independiente del PDF y recálculo del hash, coincide exacto); subida en papel de punta a punta (hash del lado del cliente, subida directa, RPC); un cliente ajeno no puede descargar el PDF firmado de otra familia ni por objeto directo (400) ni generando su propia URL firmada (404, RLS lo oculta antes de que "exista" para él); `cancelar_contrato` exige motivo y bloquea cancelar dos veces.

### Bloque C — visibilidad operativa y vigencia

**Decisión de vigencia (pedida explícitamente, documentada aquí a propósito):** el contrato es **por perro**, no por cliente ni por reserva/estancia — cada perro tiene su propia autorización médica y tope de gasto, así que cada uno necesita su propia firma. Es **de vigencia abierta, sin fecha de vencimiento**: una vez firmado (digital o papel), sigue vigente indefinidamente. No se re-firma en cada visita ni cada vez que se publica una plantilla nueva — un cliente con serie recurrente de guardería (Fase 4) no debe firmar cada semana, y publicar una plantilla nueva (Bloque A) nunca invalida lo ya firmado. La única forma de que un contrato deje de contar es que alguien lo cancele explícitamente (`cancelar_contrato`, motivo obligatorio) — no hay expiración automática por calendario. Re-firmar es entonces una decisión operativa: cancelar el vigente y generar uno nuevo.

- **Vista `perros_contrato_estado`** (`perro_id`, `estado` en `sin_contrato` / `vigente` / `requiere_actualizacion`): estado explícito de 3 valores, mismo criterio que `perro_requisitos_sanitarios_estado`/`resolver_precio` (nunca ausencia silenciosa). `vigente` exige, además de un contrato firmado no cancelado, que su `plantilla.version` sea igual o posterior al punto de quiebre más alto marcado con `requiere_refirma` (0 si nadie ha marcado ninguna — entonces todo firmado cuenta como vigente, el comportamiento original). No hace falta mirar "el más reciente" contrato del perro: basta con que **alguno** de sus contratos firmados cumpla la versión mínima. `security_invoker = true`.
- **Aviso, no bloqueo, en los dos casos "malos"**: a diferencia de un requisito sanitario vencido, el riesgo aquí es legal, no de contagio — bloquear la entrada lo perdería clientes. `ContratoEstadoBanner` (`src/app/(staff)/perros/contrato-estado-banner.tsx`) distingue los dos casos por color para que se note cuál es más urgente: ámbar "Sin contrato firmado" (nunca ha firmado nada) vs. azul "Requiere actualización" (ya firmó, pero con una versión que el negocio marcó como superada). Se ve en los mismos tres lugares: lista de check-in del día, check-in individual (junto a alertas de manejo y estado sanitario) y ficha del cliente.
- **Verificado con JWT real**: perro sin ningún contrato → `sin_contrato` en los tres lugares; tras firmar → `vigente`; al marcar la versión activa como `requiere_refirma` → el mismo perro pasa a `requiere_actualizacion` sin tocar su fila de `contratos`; al volver a firmar con la versión marcada → `vigente` de nuevo; `marcar_requiere_refirma` bloqueado para `recepcion` (solo admin); un cliente ajeno sin relación al perro no puede leer su fila de `perros_contrato_estado` (RLS heredado de `perros`, `[]` vacío).

## Fase 7 — en curso (inventario)

### Bloque A — catálogo y existencias

- **`unidades_medida`**: catálogo con `magnitud` (`volumen`/`peso`/`pieza`) y `equivalencia_en_base` — todo movimiento de inventario se guarda internamente en la unidad BASE de su magnitud (mililitro para volumen, gramo para peso, pieza para pieza), nunca en la unidad de compra ni de consumo directamente. Es justamente la razón de ser de esta tabla: "se compra un galón y se consume en mililitros" — si la existencia se guardara en la unidad de cada movimiento tal cual se capturó, dos movimientos en unidades distintas del mismo insumo serían incomparables y la existencia mentiría. **Galón asumido como galón líquido estadounidense (3785.41 ml), no confirmado con el negocio.**
- **`categorias_insumo`**: catálogo editable (Estética, Limpieza, Alimento, General), mismo patrón que `tamanos_categoria`.
- **`proveedores`**: no es dato financiero — cualquier staff lo lee, solo admin lo edita (los costos/compras en sí son Bloque B, ahí sí solo admin).
- **`insumos`**: `unidad_compra_id` y `unidad_consumo_id` pueden diferir (comprar en galón, consumir en mililitro) pero deben compartir `magnitud` — lo hace cumplir un trigger (`validar_insumo_unidades`), porque un `CHECK` no puede mirar otra tabla. `stock_minimo` y `existencia_inicial` se guardan en unidad base; el formulario los captura en la unidad de consumo (más intuitiva para quien lo da de alta) y el server action hace la conversión antes de guardar — probado con un insumo cuya unidad de consumo NO es la base (kilogramo, equivalencia 1000) para confirmar que la conversión es real y no una coincidencia de que todo esté en base 1. `requiere_caducidad` + `dias_aviso_caducidad` son a nivel catálogo (¿este tipo de insumo caduca, con cuánto aviso?), mismo criterio que `tipos_requisito_sanitario.es_critica`/`dias_aviso_vencimiento` en Fase 2 — la fecha real de caducidad de cada lote comprado vive en el movimiento de entrada (Bloque B), no aquí. Solo admin da de alta/edita el catálogo (mismo criterio que `servicios` en Fase 3); los tres roles de staff lo leen, porque Bloque B los deja registrar consumo/merma.
- **`existencia_inicial`** es el punto de partida ("cuánto hay hoy al dar de alta este insumo") — Bloque B agrega `movimientos_inventario` como ledger y la vista de existencia se extiende para sumarlos sobre esta base, mismo patrón que `cuenta_totales_reserva` extendiéndose en cada bloque de Fase 5.
- **Vista `insumos_existencia_actual`** (`insumo_id`, `existencia_actual`, `stock_minimo`, `bajo_minimo`): la alerta de stock mínimo vive aquí, explícita y visible desde el catálogo mismo — un banner en `/inventario` cuenta cuántos insumos están debajo de su mínimo, no enterrado en un reporte aparte. `security_invoker = true`.
- **UI**: `/inventario` (lista con existencia convertida a unidad de consumo para mostrarse, badge "Bajo mínimo"/"OK", banner de alerta arriba de todo), `/inventario/nuevo` y `/inventario/[id]` (alta/edición, con el selector de unidad de consumo filtrado en vivo a la misma magnitud que la unidad de compra elegida), `/inventario/proveedores` (CRUD simple). Nav actualizado: "Inventario" pasa de `proximamente` a real, con roles `admin/recepcion/estetica` (antes solo tenía `admin/estetica` en el stub — recepción también lo necesita, Bloque B la deja registrar consumo/merma).
- **Verificado con JWT real**: trigger bloquea unidad de compra/consumo de magnitud distinta con mensaje explícito; conversión correcta con unidad de consumo = base (ml, equivalencia 1) y ≠ base (kg, equivalencia 1000); vista de existencia y bandera `bajo_minimo` correctas en ambos casos; recepción/estética leen insumos y existencias pero **no pueden** insertar/actualizar insumos ni proveedores (RLS bloquea con `42501`); flujo completo probado en navegador real (alta de insumo con conversión de unidades en vivo, alta de proveedor).

### Bloque B — movimientos

- **`movimientos_inventario`**: ledger append-only (mismo criterio que `cobros`/`movimientos_caja` — nunca se edita ni se borra, una corrección es un ajuste inverso nuevo). `cantidad_base` siempre positiva; el signo con el que afecta la existencia lo da `tipo` (`entrada_compra`, `salida_consumo`, `salida_merma`, `ajuste_positivo`, `ajuste_negativo`), no el número. **Deliberadamente sin columnas de dinero** — RLS no puede filtrar por columna, solo por fila, así que "recepción/estética no ven costos" se resuelve separando el dato financiero en una tabla aparte en vez de intentar esconder columnas de la misma fila.
- **`compras_insumos`**: el detalle financiero de una entrada (proveedor, cantidad comprada, costo unitario, costo total generado), 1 a 1 con su fila en `movimientos_inventario` vía `movimiento_id`. Select solo admin — la otra mitad de "solo admin ve costos y captura compras".
- **RPCs**: `registrar_entrada_compra()` (solo admin, valida fecha de caducidad obligatoria si el insumo la requiere, convierte la cantidad de unidad de compra a base); `registrar_salida()` (los tres roles de staff, `tipo` en `consumo`/`merma`, motivo obligatorio solo para merma, nunca pide costo); `registrar_ajuste()` (los tres roles, motivo **siempre** obligatorio — a diferencia de la merma, un ajuste por conteo físico siempre necesita explicación). Las tres bloquean dejar la existencia en negativo (salida o ajuste negativo que no cabe → error explícito, se resuelve con un ajuste, no forzando el movimiento).
- **Vista `insumos_existencia_actual`** extendida (`DROP`+`CREATE`, mismo patrón que `cuenta_totales_reserva`): ahora suma `existencia_inicial` más el ledger completo vía `existencia_actual_insumo()` (función interna, no expuesta a PostgREST). Como `movimientos_inventario` tiene SELECT abierto a los tres roles de staff, la suma da el mismo resultado sin importar quién la consulte.
- **Vista `insumos_proxima_caducidad`**: mismo criterio de 3 estados (`vigente`/`por_vencer`/`vencida`) que `perro_requisitos_sanitarios_estado`. Simplificación consciente: toma la fecha de caducidad de la **compra más reciente registrada** de ese insumo, no rastrea lotes por separado con su propia existencia restante (FEFO real) — para un negocio de un solo local avisa a tiempo; si se necesita por lote, es extensión futura.
- **Bug real, encontrado probando con dos lotes de fechas distintas**: la primera versión de la vista ordenaba por `fecha_caducidad desc` (la fecha más lejana en el futuro) en vez de por la compra más reciente — con un lote lejano (60 días) y uno próximo a vencer (5 días) registrado después, ganaba el lejano y el aviso real quedaba escondido, exactamente el caso que se quiere avisar. Corregido a `created_at desc`.
- **UI**: sección "Movimientos" en `/inventario/[id]` — historial completo visible a los tres roles (cantidad en unidad de consumo, motivo, fecha; el detalle de proveedor/costo de cada entrada solo se muestra si `esAdmin`), con tres formularios inline para registrar entrada/salida/ajuste. Banner de "insumos por caducar o caducados" agregado a `/inventario` junto al de stock mínimo.
- **Verificado con JWT real**: recepción bloqueada en `registrar_entrada_compra` (solo admin); conversión de unidades correcta en entradas reales (2 galones × 3785.41 = 7570.82 ml); merma sin motivo rechazada, con motivo aceptada; ajuste sin motivo rechazado; salida/ajuste que dejaría existencia negativa rechazados con mensaje claro; recepción/estética leen `movimientos_inventario` completo pero `compras_insumos` les regresa vacío (RLS); existencia final tras 4 movimientos distintos coincide exacto con la suma esperada; los 3 estados de caducidad (`vigente`/`por_vencer`/`vencida`) verificados con fechas reales; flujo completo probado en navegador real (registrar salida desde el formulario, aparece en el historial de inmediato).

### Bloque C — consumo por receta

- **`recetas_consumo`**: cuánto insumo gasta un servicio de estética, por tamaño de perro — mismo criterio que `depende_tamano` en tarifas (Fase 3). Se captura en la unidad de CONSUMO del insumo, no versionada como tarifas: lo que queda fijo para siempre es la cantidad REAL consumida en cada cita (su propio `movimiento_inventario`), la receta es solo la sugerencia por default al finalizar. Un trigger (`validar_receta_servicio_estetica`) exige que el servicio sea de categoría `estetica` — un `CHECK` no puede mirar otra tabla. Único activo por `(servicio_id, tamano_id, insumo_id)` vía índice parcial, mismo patrón que `clientes_email_activo_idx`. Solo admin edita, los tres roles de staff la leen (la necesitan para ajustar la cantidad real al finalizar).
- **`movimientos_inventario.cita_estetica_id`** (columna nueva, nullable): rastrea qué consumo vino de qué cita — sin esto, Fase 8 no podría cruzar consumo con `compras_insumos` para calcular costo real por servicio. Solo lo llenan las salidas automáticas; las manuales (`registrar_salida`) nunca lo tocan.
- **`finalizar_cita_con_consumo()`**: única puerta para cerrar una cita de estética y descontar su consumo en la misma transacción. Recibe `p_ajustes` (jsonb `[{insumo_id, cantidad}]`) — un insumo de la receta sin ajuste usa su cantidad sugerida tal cual; una entrada con cantidad `0` se interpreta como "esta vez no se usó" y se omite. `SECURITY DEFINER` porque inserta en `movimientos_inventario` (sin política de INSERT para `authenticated`) — por eso replica adentro el mismo permiso que `citas_estetica_update_staff` (admin/recepción, o el propio empleado asignado) en vez de confiar en el RLS de `citas_estetica`, que una función definer salta.
- **Decisión deliberada, distinta a `registrar_salida`**: el consumo automático de una receta se registra aunque deje la existencia en negativo — el servicio ya se prestó y el insumo ya se usó; bloquear el cierre de la cita por un faltante de inventario detendría trabajo real por un problema de abasto. Ese faltante ya se ve solo (existencia negativa siempre dispara la alerta de stock mínimo).
- **UI**: `/servicios/[id]/receta` (solo para servicios de categoría estética) — líneas agrupadas por tamaño, alta con selects de tamaño/insumo/cantidad, "Quitar" da de baja lógica. En el cierre de una cita (`/agenda/[citaId]`), un bloque "Consumo de inventario — ajusta si se usó más o menos" muestra cada insumo de la receta con la cantidad sugerida precargada y editable, antes de "Confirmar cierre".
- **Verificado con JWT real**: trigger bloquea receta sobre servicio no-estética; recepción/estética leen la receta pero no pueden escribirla (RLS); un estilista NO asignado a la cita queda bloqueado de finalizarla ("No tienes permiso para cerrar esta cita"), el asignado sí puede; finalizar con un ajuste (180 ml en vez de 150 sugeridos) generó el movimiento correcto con `cita_estetica_id` enlazado y descontó la existencia exacta; reintentar finalizar una cita ya finalizada falla limpio; un ajuste que deja existencia negativa se registra igual (a diferencia de una salida manual) y dispara la alerta de bajo mínimo; flujo completo probado en navegador real (formulario de cierre con el insumo precargado en 150, ajustado a 200, confirmado, y el movimiento apareció con la cantidad y el enlace a la cita correctos).

## Fase 8 — en curso (reportes)

### Bloque A — reporte financiero por periodo

- **`reporte_financiero_periodo(p_desde, p_hasta)`**: admin-only (regla desde Fase 1: recepción no ve costos ni reportes). No es `security definer` — corre con el RLS de quien llama, así que necesita un chequeo explícito de `is_admin()` adentro: `cobros`/`cobro_metodos`/etc. tienen SELECT abierto a `is_staff()` (recepción los necesita para su día a día), y sin el chequeo explícito recepción podría llamar la función igual y el RLS de las tablas de abajo no la detendría — un reporte agregado es una cosa distinta a ver las filas individuales.
- **Distingue a propósito dos números**, exactamente la separación que Fase 5 dejó preparada desde el diseño de `movimientos_bono` ("para que Fase 8 pueda distinguir venta de bono, consumo de bono e ingreso reconocido, sin inferirlo"):
  - **Ingreso neto de caja** (cash-basis): cobros − devoluciones − retiros. Reconcilia con los cortes de caja del periodo.
  - **Ingreso reconocido** (accrual-basis, el número correcto para comparar contra costos en Bloque B): cobros brutos − devoluciones − ventas de bono (diferido, dinero que ya entró pero no se ha "ganado") + consumos de bono (ya devengado). Vender un bono grande no debe inflar el margen del mes en que se vende, ni desinflarlo el mes en que se consume.
- Descuentos otorgados se muestra solo informativo — `cobros.monto` ya refleja el total con el descuento aplicado (`aplicar_descuento` lo resta de `cuenta_totales_reserva` antes de cobrar), así que sumarlo de nuevo aquí sería doble conteo.
- Todo se filtra por `fecha_negocio(created_at)`, nunca por el `created_at` crudo en UTC — misma disciplina de huso horario de toda la app.
- **UI**: `/reportes` (antes "Próximamente" en el nav, ahora real, `roles: ["admin"]`). Selector Desde/Hasta (default: del primer día del mes en curso a hoy), dos tarjetas grandes (ingreso reconocido en verde, ingreso neto de caja en azul) con una frase explicando cada una, tabla de cobros/propinas/devoluciones/retiros por método, y tres tarjetas chicas (bonos vendidos, bonos consumidos, descuentos otorgados).
- **Verificado con JWT real**: recepción bloqueada con "Solo un admin puede ver reportes"; un cobro real (efectivo $1000 + propina $50, terminal $500), una devolución ($200 efectivo) y un retiro ($100) dieron ingreso neto de caja = $1250 exacto; comprar un bono real ($800) subió el ingreso de caja a $2050 pero **no movió** el ingreso reconocido (siguió en $1300) — la separación funciona; simular el consumo de ese bono ($80 reconocido) subió el ingreso reconocido a $1380 sin mover el de caja; un descuento aplicado de $50 apareció correcto en su tarjeta; un rango de fechas sin movimientos regresa todo en cero; flujo completo probado en navegador real con los mismos números exactos.

## Estado actual

Fase 0, Fase 1, Fase 2, Fase 3 y Fase 4 completas (esquema, RLS, Storage y UI, verificado con JWTs reales). Fase 5 (POS) construida en sus cuatro bloques (cobros/devoluciones, bonos, descuentos, caja/arqueo) más la decisión de Bloque E, pendiente de que el negocio termine de probarla para cerrarla formalmente. Fase 6 (contratos) completa en sus tres bloques (plantillas y versionado, generación/firma/papel, visibilidad operativa y vigencia). Fase 7 (inventario) completa en sus tres bloques (catálogo y existencias; movimientos: entradas, salidas, mermas, ajustes; consumo automático por receta al finalizar un servicio de estética, con el enlace a la cita ya listo para que Fase 8 calcule el costo real por servicio). Fase 8 (reportes) en curso: Bloque A (reporte financiero por periodo) completo; pendientes reporte de costos/margen y reporte operativo.

## Invite server-side de staff

`POST /api/staff/invite`, body `{ email, rol, nombre_completo? }`. Solo un `admin` puede llamarlo (verificado vía `getUser()` server-side, revalida contra Auth, nunca confía en un JWT sin revisar).

- **Sin contraseña temporal**: usa `auth.admin.generateLink({ type: 'invite', email })`, que crea el usuario y devuelve un `action_link` sin mandar correo (no depende del rate limit de email). La respuesta trae `invite_link`, nunca una password — el admin se lo pasa al empleado, que define su propia contraseña al abrir el link.
- **Whitelist estricta server-side**: `ROLES_INVITABLES = ['recepcion', 'estetica']`. Nunca `admin` ni `cliente`, sin importar qué mande el body — probado con ambos valores, los dos dan 400.
- **Solo altas nuevas**: antes de invitar, llama a la función `existe_usuario_por_email` (Migración 5, `add_existe_usuario_por_email`) y devuelve 409 si el correo ya tiene cuenta, sin tocar su rol.

**Bug real encontrado al probar, no solo leyendo el código**: `generateLink({type:'invite'})` **no** rechaza un correo ya registrado si esa cuenta sigue sin confirmar — lo reutiliza y regenera el link. La primera versión del endpoint confiaba en que `generateLink` fallara para detectar duplicados; en la práctica, una segunda invitación al mismo correo sin confirmar devolvía 200 y **pisaba el rol existente** (de `recepcion` a `estetica` en la prueba). Fix: chequeo explícito de existencia (`existe_usuario_por_email`, `SECURITY DEFINER`, solo otorgado a `service_role` — expone si un correo está registrado, así que no debe quedar abierta a `anon`/`authenticated`) **antes** de llamar a `generateLink`.

Verificado con JWTs reales (usuarios de prueba creados vía Admin API con `email_confirm:true`, sin depender de links de correo), corriendo el dev server en el puerto 3001 (`npm run dev -- -p 3001` — el puerto 3000 puede estar ocupado por otro proyecto en esta máquina, no asumir que está libre):
- Sin sesión → 401.
- `cliente` real (no admin) → 403.
- `admin` con `rol:"admin"` o `rol:"cliente"` en el body → 400, la whitelist ignora el body.
- `admin` con correo nuevo y `rol:"recepcion"` → 200, `invite_link` presente, sin password.
- Mismo correo otra vez → 409, y el `rol` de la cuenta existente queda intacto (confirmado por SQL directo).

Helpers nuevos: `src/lib/supabase/server.ts` (cliente ligado a cookies, para páginas/route handlers), `src/lib/supabase/admin.ts` (cliente con la secret key — nunca importar desde código de navegador), `src/lib/supabase/anon.ts` y `src/lib/supabase/caller.ts` (resuelve quién llama: cookies de sesión o `Authorization: Bearer`, este último pensado para pruebas y llamadas servidor-a-servidor).

## Nota: puerto de dev

`CLAUDE.md` fija el puerto 3001; el script `dev` en `package.json` tenía solo `next dev` (caía en 3000 por default, que en esta máquina puede estar ocupado por otro proyecto). Corregido a `next dev -p 3001`.
