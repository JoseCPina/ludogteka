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

## Fase 2 — esquema completo (falta la UI)

Modelo del expediente del perro: migraciones aplicadas y verificadas con JWTs reales (cuentas de prueba creadas vía Admin API + login real, no solo simulación). Esta fase cerró la base de datos; las pantallas (alta/edición de perro, subida de fotos, registro de vacunas/peso/alertas/medicamentos) todavía no se construyen.

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

### Pendiente

- Toda la UI de Fase 2: formularios de alta/edición de perro, subida de fotos, registro de vacunas/desparasitación/peso/alertas/alergias/medicamentos. Nada de esto se construyó todavía, solo el esquema y las políticas.
- El caso "pareja con dos cuentas" de Fase 1 queda resuelto a nivel de esquema (`perro_accesos_compartidos`); falta la UI para que staff dé de alta ese acceso compartido.

## Estado actual

Fase 0 y Fase 1 completas. Fase 2: esquema y RLS completos y verificados; falta construir la UI.

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
