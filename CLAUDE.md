\# Ludogteka



App interna + portal de clientes para un negocio canino en San Luis Potosí (guardería, hotel, estética).



\## Contexto completo

Antes de trabajar, lee docs/PROYECTO.md: ahí está el detalle de roles, roadmap por fases, reglas de negocio y qué está fuera de alcance.



\## Stack

\- Next.js 16 (App Router, TypeScript, Tailwind), carpeta src/

\- Supabase (Auth, Postgres con RLS, Storage)

\- Esquema por migraciones versionadas: npx supabase migration new <nombre> -> editar .sql -> npx supabase db push

\- Dev en puerto 3001



\## Entornos

\- \*\*Desarrollo\*\* — proyecto Supabase `sgfolltpvktbsiisfuzq` ("Ludogteka"). Es el que queda vinculado al CLI (`npx supabase link`), el que usa `.env.local`, y donde vive todo el residuo de pruebas de las fases 0 a 9.

\- \*\*Producción\*\* — proyecto Supabase `xdsxjhytggpsgrmfuuff` ("ludogteka-prod"), dominio ludogteka.mx, DNS en Hostinger. Sus llaves viven ÚNICAMENTE en las variables de entorno de Vercel — nunca en un archivo del repo, nunca en `.env.local`.

\- \*\*Toda migración se prueba primero en desarrollo.\*\* Solo después de verificarla ahí (REST + navegador) se aplica a producción con `npx supabase db push --db-url <connection string de producción>` — sin re-vincular el CLI, sin tocar el link a desarrollo. Nunca se escribe una migración directo contra producción.

\- \*\*Antes de CUALQUIER despliegue a producción, verificar el estado real de los datos contra la base, nunca contra esta documentación ni contra docs/PROYECTO.md.\*\* Conteos reales de `clientes`, `perros`, `contratos`, `plantillas_contrato`, `cobros`, etc., leídos de producción en ese momento. Los docs describen el estado del día que se escribieron: en Fase 11 decían que producción estaba vacía y ya tenía 14 clientes, 15 perros y el contrato real del negocio publicado — una migración con backfill que se creía inofensiva sí corrió sobre datos reales. Si el conteo no cuadra con lo que esperabas, se para y se revisa antes de migrar.

\- \*\*El despliegue va por `npm run desplegar -- --aplicar`\*\* (`scripts/desplegar-produccion.mjs`), no a mano. El script hace la verificación de datos de arriba, corre el dry-run, aplica las migraciones con reintentos, comprueba que quedaron registradas en la base y SOLO ENTONCES empuja el código. Correrlo primero con `--revisar` (no escribe nada). La cadena de conexión se pasa en `LUDOGTEKA_PROD_DB_URL` al momento de correrlo, nunca en un archivo. \*\*El push del código jamás se encadena a la migración con `;`\*\* — en Fase 11 así fue y el `git push` salió con el `db push` fallado: quedó código nuevo empujado contra esquema viejo, y solo no rompió nada porque el build tardó más que el reintento.

\- \*\*Nunca a mano en producción\*\*: nada de SQL manual por consola/dashboard para cambios de esquema (eso es una migración, sin excepción) ni para cargar datos de negocio reales (tarifas, plantilla de contrato, catálogo de insumos, altas de clientes) — esos se capturan por la UI de la app, igual que los va a capturar el negocio en el día a día. La única SQL manual tolerada en producción es de un administrador de la app resolviendo un caso operativo puntual (nunca cambios de esquema), y siempre documentando qué y por qué.



\## Reglas

\- \*\*Un guardia de rol nunca se escribe contra un valor que pueda ser NULL.\*\* `current_rol()` devolvía NULL para un llamador anónimo, y `null not in ('admin','recepcion')` es NULL, no TRUE: el `if` no se dispara y el guardia deja pasar. Así estuvieron abiertos 39 guardias desde Fase 1 hasta que se encontró en Fase 13. Hoy `current_rol()` devuelve `'anonimo'` y `is_admin()`/`is_staff()` van con `coalesce(..., false)`, así que el idioma de siempre ya es seguro — pero cualquier guardia nuevo se prueba \*\*también con la llave anónima pelada\*\*, no solo con un JWT de cada rol: es el caso que ninguna prueba con sesión puede ver.

\- \*\*`revoke execute ... from public` NO le quita el permiso a `anon` en Supabase.\*\* El proyecto trae ALTER DEFAULT PRIVILEGES que le concede EXECUTE a anon/authenticated/service_role sobre cada función nueva, y eso es una concesión directa al rol: hay que nombrar a `anon` explícitamente para revocárselo.

\- Nada de SQL manual por copy-paste: todo cambio de esquema va como migración.

\- RLS obligatorio en toda tabla nueva. Verificar aislamiento con llamadas REST directas, no solo por UI.

\- Español mexicano en toda la UI (tú, no vos).

\- Roles: admin, recepcion, estetica, cliente. El cliente (dueño del perro) nunca ve datos de otros clientes ni información financiera.

\- Fuera de alcance por ahora: facturación CFDI (solo guardar RFC opcional).

\- Llaves de servicios externos facturables (Google Maps, etc.) van server-side, SIN prefijo NEXT\_PUBLIC\_ — igual que las de Supabase, en .env.local para desarrollo y en variables de Vercel para producción, nunca en el repo.



\## Checklist: tabla nueva

Cada tabla nueva lleva esto DENTRO de su propia migración de creación, no en un ALTER aparte después — así se perdió una vez (created_by sin default en servicios/tarifas de Fase 3, corregido hasta Fase 4 porque la convención solo vivía en las tablas de Fase 2, no estaba escrita en ningún lado):



\- Columnas estándar: id uuid pk default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz not null (sin default, lo llena el trigger), deleted_at timestamptz.

\- created_by uuid references auth.users(id) on delete set null default auth.uid() — el DEFAULT va en el propio CREATE TABLE, siempre.

\- Trigger set_updated_at before insert or update on la tabla for each row execute function public.set_updated_at().

\- alter table ... enable row level security, con al menos una política de SELECT y una de INSERT/UPDATE escritas explícitamente en la misma migración. Nunca dejar una tabla con RLS activado y cero políticas (bloquea todo en silencio) ni con RLS desactivado.

\- Baja lógica (deleted_at), nunca DELETE, en cualquier tabla que el negocio necesite dar de baja sin perder el historial.



\## Estado

Fase 0 a Fase 4 completas (auth con roles, vinculación dueño↔negocio, panel de admin, clientes, portal, expediente completo del perro, catálogo de servicios y tarifas, reservas con cupo y calendario, check-in/check-out, cargos, agenda de estética, series recurrentes). Fase 5 (POS: cobros, bonos, descuentos, turno de caja y arqueo) y Fase 6 (contratos: plantillas versionadas, generación y firma en PDF con evidencia de auditoría, subida en papel, visibilidad operativa y vigencia) construidas y probadas con JWTs reales. Fase 5 pendiente de que el negocio la termine de probar para cerrarla formalmente. Fase 7 (inventario) completa (catálogo, movimientos, consumo automático por receta). Fase 8 (reportes) completa (financiero, costos/margen, operativo). Fase 9 (bitácora diaria y medicamentos) completa (fotos/notas/incidencias con aviso por WhatsApp vía wa.me; régimen y registro de dosis administradas). Con esto las diez fases del roadmap original (0 a 9) están completas. Fase 10 (recolección a domicilio: cotizador de distancia por Google Routes API, reutilizando tarifas/cargos_aplicados de Fase 3/4 sin mecanismo de cobro nuevo) completa, corriendo en modo simulación hasta que el negocio capture direcciones reales, tarifas por km y la llave de Google Maps. Fase 11 (varias plantillas de contrato a la vez: `tipos_contrato` con nombre, versionado y aplicabilidad por categoría de servicio propios; el estado de contrato pasó de un sí/no por perro a uno por tipo, y los avisos dicen cuál falta) completa. Fase 12 (navegación: Reservas dividida en los módulos Guardería y Hotel, Agenda renombrada a Estética y movida a /estetica) completa, sin migraciones — `estancias` sigue siendo una sola tabla porque el cupo es del mismo espacio físico, cada módulo filtra por `servicios.categoria` y **la ocupación que muestran los dos es la de toda la casa**. Fase 13 (alta de clientes por link de invitación: recepción manda el link por WhatsApp, el dueño captura sus datos y los de sus perros, y el expediente nace con `profiles.cliente_id` asignado en la misma transacción — sin pasar por la cola de vinculación; el alta manual y /vinculacion se conservan) completa. Detalle en docs/PROYECTO.md.

