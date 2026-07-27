\# Ludogteka



App interna + portal de clientes para un negocio canino en San Luis Potosí (guardería, hotel, estética).



\## Stack

\- Next.js 16 (App Router, TypeScript, Tailwind), carpeta src/

\- Supabase (Auth, Postgres con RLS, Storage)

\- Esquema por migraciones versionadas: npx supabase migration new <nombre> -> editar .sql -> npx supabase db push

\- Dev en puerto 3001



\## Reglas

\- Nada de SQL manual por copy-paste: todo cambio de esquema va como migración.

\- RLS obligatorio en toda tabla nueva. Verificar aislamiento con llamadas REST directas, no solo por UI.

\- Español mexicano en toda la UI (tú, no vos).

\- Roles: admin, recepcion, estetica, cliente. El cliente (dueño del perro) nunca ve datos de otros clientes ni información financiera.

\- Fuera de alcance por ahora: facturación CFDI (solo guardar RFC opcional).



\## Estado

Fase 0 lista. En curso: Fase 1 = auth con roles + vinculación dueño↔negocio.

