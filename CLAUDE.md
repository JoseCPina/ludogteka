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

\- \*\*Nunca a mano en producción\*\*: nada de SQL manual por consola/dashboard para cambios de esquema (eso es una migración, sin excepción) ni para cargar datos de negocio reales (tarifas, plantilla de contrato, catálogo de insumos, altas de clientes) — esos se capturan por la UI de la app, igual que los va a capturar el negocio en el día a día. La única SQL manual tolerada en producción es de un administrador de la app resolviendo un caso operativo puntual (nunca cambios de esquema), y siempre documentando qué y por qué.



\## Reglas

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

Fase 0 a Fase 4 completas (auth con roles, vinculación dueño↔negocio, panel de admin, clientes, portal, expediente completo del perro, catálogo de servicios y tarifas, reservas con cupo y calendario, check-in/check-out, cargos, agenda de estética, series recurrentes). Fase 5 (POS: cobros, bonos, descuentos, turno de caja y arqueo) y Fase 6 (contratos: plantillas versionadas, generación y firma en PDF con evidencia de auditoría, subida en papel, visibilidad operativa y vigencia) construidas y probadas con JWTs reales. Fase 5 pendiente de que el negocio la termine de probar para cerrarla formalmente. Fase 7 (inventario) completa (catálogo, movimientos, consumo automático por receta). Fase 8 (reportes) completa (financiero, costos/margen, operativo). Fase 9 (bitácora diaria y medicamentos) completa (fotos/notas/incidencias con aviso por WhatsApp vía wa.me; régimen y registro de dosis administradas). Con esto las diez fases del roadmap original (0 a 9) están completas. Fase 10 (recolección a domicilio: cotizador de distancia por Google Routes API, reutilizando tarifas/cargos_aplicados de Fase 3/4 sin mecanismo de cobro nuevo) completa, corriendo en modo simulación hasta que el negocio capture direcciones reales, tarifas por km y la llave de Google Maps. Detalle en docs/PROYECTO.md.

