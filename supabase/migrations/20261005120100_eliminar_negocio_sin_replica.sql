-- plataforma_eliminar_negocio sin `session_replication_role`: postgres no
-- tiene permiso de cambiar ese parámetro en Supabase («permission denied to
-- set parameter»). El borrado ahora va por tabla, en pasadas: una tabla que
-- todavía tiene hijas que la apuntan (foreign_key_violation) espera y se
-- reintenta cuando las hijas ya se borraron; una que un disparador impide
-- borrar (p. ej. una tabla inmutable) se borra con sus disparadores de usuario
-- apagados SOLO dentro de esta transacción, y se vuelven a prender al final
-- (si algo falla, todo se deshace, DDL incluido).
create or replace function public.plataforma_eliminar_negocio(p_negocio_id uuid, p_confirmacion text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manifiesto jsonb;
  v_neg jsonb;
  v_f record;
  v_n bigint;
  v_filas jsonb := '{}'::jsonb;
  v_vault int := 0;
  v_huerfanas jsonb;
  v_personas uuid[];
  v_pendientes text[];
  v_sin_disparadores text[] := '{}';
  v_t text;
  v_progreso boolean;
begin
  if not (public.es_admin_plataforma() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  -- Las mismas guardas de «se puede borrar» (lanza si no).
  v_manifiesto := public.plataforma_negocio_a_borrar(p_negocio_id);
  v_neg := v_manifiesto -> 'negocio';
  if btrim(coalesce(p_confirmacion, '')) <> (v_neg ->> 'nombre') then
    raise exception 'Para borrar escribe el nombre del negocio tal cual: «%».', v_neg ->> 'nombre';
  end if;
  perform 1 from public.negocios n where n.id = p_negocio_id for update;

  v_personas := array(select distinct m.profile_id from public.membresias m where m.negocio_id = p_negocio_id);

  -- Credenciales de cobro (Mercado Pago / Clip) en Vault: se desvinculan.
  delete from vault.secrets where id in (select i.secreto_id from public.integraciones_cobro i where i.negocio_id = p_negocio_id and i.secreto_id is not null);
  get diagnostics v_vault = row_count;

  -- La bitácora de la plataforma se conserva, ya sin ligar al negocio.
  update public.plataforma_eventos set negocio_id = null where negocio_id = p_negocio_id;
  update public.wa_hilos set negocio_afectado = null where negocio_afectado = p_negocio_id;
  update public.eventos_stripe set negocio_afectado = null where negocio_afectado = p_negocio_id;

  v_pendientes := array(
    select c.relname::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'negocios'
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
    order by 1);

  while cardinality(v_pendientes) > 0 loop
    v_progreso := false;
    foreach v_t in array v_pendientes loop
      begin
        execute format('delete from public.%I where negocio_id = $1', v_t) using p_negocio_id;
        get diagnostics v_n = row_count;
        if v_n > 0 then
          v_filas := v_filas || jsonb_build_object(v_t, v_n);
        end if;
        v_pendientes := array_remove(v_pendientes, v_t);
        v_progreso := true;
      exception
        when foreign_key_violation then
          null; -- todavía hay tablas hijas que la apuntan: se reintenta en la siguiente pasada
        when others then
          -- Un disparador del negocio (tabla inmutable, bitácora) impide borrar:
          -- se apagan los de usuario de ESA tabla, una vez, y se reintenta.
          if v_t = any(v_sin_disparadores) then
            raise;
          end if;
          execute format('alter table public.%I disable trigger user', v_t);
          v_sin_disparadores := v_sin_disparadores || v_t;
          v_progreso := true;
      end;
    end loop;
    if not v_progreso then
      raise exception 'No se pudo borrar por dependencias entre tablas (quedan: %). No se borró nada.', array_to_string(v_pendientes, ', ');
    end if;
  end loop;

  delete from public.negocios where id = p_negocio_id;

  foreach v_t in array v_sin_disparadores loop
    execute format('alter table public.%I enable trigger user', v_t);
  end loop;

  -- Nada puede quedar apuntando al negocio borrado.
  for v_f in
    select k.conrelid::regclass::text as tabla, a.attname::text as columna
    from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    where k.confrelid = 'public.negocios'::regclass and k.contype = 'f'
  loop
    execute format('select count(*) from %s where %I = $1', v_f.tabla, v_f.columna) into v_n using p_negocio_id;
    if v_n > 0 then
      raise exception 'Quedaron % filas en % (%) apuntando al negocio. No se borró nada.', v_n, v_f.tabla, v_f.columna;
    end if;
  end loop;

  -- Cuentas que se quedaron sin ningún negocio (ni son de la plataforma): el
  -- servidor las quita de Auth.
  select coalesce(jsonb_agg(p), '[]'::jsonb) into v_huerfanas
  from unnest(v_personas) p
  where not exists (select 1 from public.membresias m where m.profile_id = p and m.deleted_at is null)
    and not exists (select 1 from public.plataforma_admins a where a.profile_id = p);

  insert into public.plataforma_eventos (accion, negocio_id, persona_id, motivo, detalle, created_by)
  values ('eliminar_negocio', null, null, 'Negocio de prueba o suspendido borrado desde la plataforma',
          jsonb_build_object('negocio_id', p_negocio_id, 'slug', v_neg ->> 'slug', 'nombre', v_neg ->> 'nombre', 'plan', v_neg ->> 'plan',
                             'telefonos', v_manifiesto -> 'telefonos', 'filas', v_filas, 'secretos_vault', v_vault,
                             'archivos_storage', jsonb_array_length(v_manifiesto -> 'objetos'),
                             'tablas_con_disparadores_apagados', to_jsonb(v_sin_disparadores),
                             'via', case when auth.role() = 'service_role' then 'servicio' else 'sesion' end),
          auth.uid());

  return jsonb_build_object('negocio', v_neg, 'filas', v_filas, 'secretos_vault', v_vault, 'cuentas_huerfanas', v_huerfanas, 'manifiesto', v_manifiesto);
end;
$$;
revoke execute on function public.plataforma_eliminar_negocio(uuid, text) from public, anon;
grant execute on function public.plataforma_eliminar_negocio(uuid, text) to authenticated, service_role;
