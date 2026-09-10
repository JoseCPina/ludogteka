-- AGUJERO DE SEGURIDAD REAL, encontrado probando el alta por link con la
-- llave anónima. No lo introdujo esa fase: estaba desde Fase 1 y afectaba
-- a 39 guardias repartidos en 23 migraciones.
--
-- Qué pasaba: current_rol() hace
--     select rol from public.profiles where id = auth.uid()
-- y para un llamador ANÓNIMO (sin sesión, solo con la anon key, que es
-- pública por definición: viaja en el bundle del navegador) auth.uid() es
-- null, no hay fila, y la función devuelve NULL.
--
-- Y en SQL, NULL no es "distinto de admin": es desconocido.
--
--     null not in ('admin', 'recepcion')  ->  NULL   (no TRUE)
--     not null                            ->  NULL
--
-- Un `if <NULL> then raise ...` NO se dispara. Así que todos los guardias
-- escritos con este idioma —el estándar del proyecto— dejaban pasar de
-- largo justo al llamador con menos permisos de todos:
--
--     if not public.is_admin() then raise exception 'Solo un admin...';
--     if public.current_rol() not in ('admin','recepcion') then raise ...;
--
-- Verificado en desarrollo antes de este arreglo: con la anon key y sin
-- ninguna sesión se pudo ejecutar crear_tipo_contrato (creó el tipo y
-- devolvió su id), reporte_estado_operativo_actual (devolvió las cifras
-- del negocio), generar_contrato y crear_invitacion_cliente — esta última
-- devolviendo un token de alta válido.
--
-- Por qué el RLS sí aguantó: una política que da `using (public.is_staff())`
-- evalúa NULL y Postgres trata NULL como "no" al filtrar filas. El RLS
-- nunca estuvo comprometido; lo que fallaba eran los guardias en plpgsql,
-- donde NULL significa "no entres al if".
--
-- El arreglo va en la raíz y no en los 39 guardias: si current_rol() nunca
-- devuelve NULL, todos los `not in (...)` y `not is_admin()` vuelven a
-- evaluar TRUE para un anónimo y disparan su excepción. Corregir función
-- por función habría dejado el mismo idioma frágil esperando a la número
-- 40.
--
-- 'anonimo' no es un rol del sistema (el CHECK de profiles.rol sigue
-- admitiendo solo admin/recepcion/estetica/cliente): es un valor
-- centinela que nunca va a coincidir con ninguna lista de permitidos.
create or replace function public.current_rol()
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select rol from public.profiles where id = auth.uid()),
    'anonimo'
  );
$$;

-- Los dos derivados dejan de poder devolver NULL por la misma razón, y
-- además se blindan con coalesce por si alguna vez se les cambia el
-- cuerpo: un booleano de permiso que puede ser NULL es una trampa, no una
-- respuesta.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(public.current_rol() = 'admin', false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(public.current_rol() in ('admin', 'recepcion', 'estetica'), false);
$$;

-- Defensa en profundidad para las funciones de esta fase: además de que
-- el guardia ya funciona, anon no tiene por qué poder ni llamarlas.
--
-- Ojo para el futuro: `revoke ... from public` NO alcanza en Supabase.
-- El proyecto trae ALTER DEFAULT PRIVILEGES que le concede EXECUTE a
-- anon/authenticated/service_role sobre cada función nueva, y eso es una
-- concesión DIRECTA al rol: revocarle a `public` no la quita. Hay que
-- nombrar a anon explícitamente, como se hace aquí.
revoke execute on function public.crear_invitacion_cliente(text, text, int) from anon;
revoke execute on function public.cancelar_invitacion_cliente(uuid) from anon;
revoke execute on function public.marcar_datos_revisados(uuid) from anon;
