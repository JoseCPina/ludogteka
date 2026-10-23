-- N120 (23 de octubre de 2026): el control de concurrencia es por VERSIÓN del registro, no por persona. Con el mismo
-- admin en dos pestañas, la vieja guardaba encima sin aviso porque `concurrencia_solo_mios` perdonaba todo lo que hizo
-- la misma persona. Lo que sí debe seguir sin aviso es lo que hizo ESTA misma pantalla (otro panel de la consulta,
-- una vacuna aplicada en ella…): cada pestaña del navegador manda su id en el encabezado `x-peludesk-pestana`
-- (src/components/concurrencia/pestana.tsx → src/lib/supabase/server.ts), la bitácora lo anota y solo se perdona lo
-- que hizo la misma persona DESDE LA MISMA PESTAÑA. Sin encabezado (scripts, la API) se comporta como antes.
-- Aplica a todas las tablas con `concurrencia_antes` (citas, reservas, estancias, consultas, clientes, perros…).

alter table public.registro_ediciones add column pestana text;

-- El id de la pestaña de la petición (un uuid; cualquier otra cosa cuenta como «sin pestaña»).
create or replace function public.concurrencia_pestana()
returns text
language sql
stable
set search_path = ''
as $$
  select case when v ~ '^[0-9a-f-]{36}$' then v end
    from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-peludesk-pestana' as v) h;
$$;
revoke execute on function public.concurrencia_pestana() from public, anon;
grant execute on function public.concurrencia_pestana() to authenticated, service_role, peludesk_definer;

-- Solo perdona lo que hizo la misma persona desde la misma pestaña (antes: la misma persona desde cualquier lado).
create or replace function public.concurrencia_solo_mios(p_tabla text, p_id uuid, p_desde timestamptz, p_yo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.registro_ediciones e
            where e.tabla = p_tabla and e.registro_id = p_id and e.ultimo_at > p_desde
              and e.negocio_id = public.negocio_actual())
     and not exists (
           select 1 from public.registro_ediciones e
            where e.tabla = p_tabla and e.registro_id = p_id and e.ultimo_at > p_desde
              and e.negocio_id = public.negocio_actual()
              and (e.profile_id is distinct from p_yo or e.pestana is distinct from public.concurrencia_pestana()));
$$;
alter function public.concurrencia_solo_mios(text, uuid, timestamptz, uuid) owner to peludesk_definer;
revoke execute on function public.concurrencia_solo_mios(text, uuid, timestamptz, uuid) from public, anon;
grant execute on function public.concurrencia_solo_mios(text, uuid, timestamptz, uuid) to authenticated, service_role;

-- La bitácora anota la pestaña, y solo junta en una fila las ediciones seguidas de la misma persona Y la misma pestaña
-- (si juntara las de otra pestaña, la de la pestaña vieja quedaría como «mía» y no avisaría).
create or replace function public.concurrencia_despues()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col text := coalesce(tg_argv[0], 'id');
  v_id uuid := (to_jsonb(new) ->> v_col)::uuid;
  v_quien uuid := auth.uid();
  v_cambios jsonb;
  v_leida timestamptz;
  v_antes timestamptz := (to_jsonb(old) ->> 'updated_at')::timestamptz;
  v_forzado boolean := false;
  v_previa record;
  v_negocio uuid := (to_jsonb(new) ->> 'negocio_id')::uuid;
  v_pestana text := public.concurrencia_pestana();
  k text;
  par jsonb;
begin
  if v_quien is null or v_negocio is null then
    return null;
  end if;
  select coalesce(jsonb_object_agg(o.key, jsonb_build_array(o.value, n.value)), '{}'::jsonb)
    into v_cambios
    from jsonb_each(to_jsonb(old)) o
    join jsonb_each(to_jsonb(new)) n using (key)
   where o.value is distinct from n.value
     and o.key not in ('updated_at', 'rango');
  if v_cambios = '{}'::jsonb then
    return null;
  end if;
  v_leida := public.concurrencia_version_leida(tg_table_name, v_id);
  v_forzado := v_leida is not null and v_antes is not null and v_antes <> now()
    and date_trunc('milliseconds', v_antes) > date_trunc('milliseconds', v_leida)
    and public.concurrencia_forzar();
  begin
    if not v_forzado then
      select e.id, e.cambios into v_previa
        from public.registro_ediciones e
       where e.tabla = tg_table_name and e.registro_id = v_id and e.profile_id = v_quien
         and e.pestana is not distinct from v_pestana
         and e.negocio_id = v_negocio and not e.sobrescribio and e.ultimo_at > now() - interval '2 minutes'
       order by e.ultimo_at desc
       limit 1;
      if found then
        for k, par in select * from jsonb_each(v_cambios) loop
          if v_previa.cambios ? k then
            v_previa.cambios := jsonb_set(v_previa.cambios, array[k], jsonb_build_array(v_previa.cambios -> k -> 0, par -> 1));
          else
            v_previa.cambios := v_previa.cambios || jsonb_build_object(k, par);
          end if;
        end loop;
        update public.registro_ediciones set cambios = v_previa.cambios, ultimo_at = now() where id = v_previa.id;
        return null;
      end if;
    end if;
    insert into public.registro_ediciones
      (negocio_id, tabla, registro_id, profile_id, cambios, ultimo_at, sobrescribio, version_leida, version_encontrada, sobrescrito_de, pestana)
    values
      (v_negocio, tg_table_name, v_id, v_quien, v_cambios, now(), v_forzado,
       case when v_forzado then v_leida end, case when v_forzado then v_antes end,
       case when v_forzado then (public.concurrencia_detalle(tg_table_name, v_id, v_leida) ->> 'quien_id')::uuid end,
       v_pestana);
  exception when others then
    -- La bitácora nunca impide guardar.
    null;
  end;
  return null;
end;
$$;
alter function public.concurrencia_despues() owner to peludesk_definer;
revoke execute on function public.concurrencia_despues() from public, anon;
grant execute on function public.concurrencia_despues() to authenticated, service_role;

-- El detalle dice si quien cambió es la misma persona que intenta guardar (el aviso dice entonces «Cambiaste … desde
-- otra pestaña»).
create or replace function public.concurrencia_detalle(p_tabla text, p_id uuid, p_desde timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_cambios jsonb := '{}'::jsonb;
  v_quien uuid;
  v_cuando timestamptz;
  k text;
  par jsonb;
begin
  for r in
    select e.profile_id, e.ultimo_at, e.cambios
      from public.registro_ediciones e
     where e.tabla = p_tabla and e.registro_id = p_id and e.ultimo_at > coalesce(p_desde, '-infinity'::timestamptz)
       and e.negocio_id = public.negocio_actual()
     order by e.ultimo_at asc
  loop
    v_quien := coalesce(r.profile_id, v_quien);
    v_cuando := r.ultimo_at;
    for k, par in select * from jsonb_each(r.cambios) loop
      if v_cambios ? k then
        v_cambios := jsonb_set(v_cambios, array[k], jsonb_build_array(v_cambios -> k -> 0, par -> 1));
      else
        v_cambios := v_cambios || jsonb_build_object(k, par);
      end if;
    end loop;
  end loop;
  return jsonb_build_object(
    'tabla', p_tabla,
    'id', p_id,
    'quien', case when v_quien is null then null else public.nombre_de_persona(v_quien, null) end,
    'quien_id', v_quien,
    'misma_persona', v_quien is not null and v_quien = auth.uid(),
    'cuando', v_cuando,
    'cambios', v_cambios
  );
end;
$$;
alter function public.concurrencia_detalle(text, uuid, timestamptz) owner to peludesk_definer;
revoke execute on function public.concurrencia_detalle(text, uuid, timestamptz) from public, anon;
grant execute on function public.concurrencia_detalle(text, uuid, timestamptz) to authenticated, service_role;
