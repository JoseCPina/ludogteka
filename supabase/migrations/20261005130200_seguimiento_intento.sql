-- El reintento de un envío fallido (una sola vez, 30 minutos después) se mide
-- contra la hora del último INTENTO que guarda la fila y contra la hora que le
-- pasa quien corre la tarea (en producción, la hora real). Antes se medía con
-- updated_at y now() de la base: iguales en producción, pero no se podía
-- probar el tiempo con una hora simulada.
alter table public.seguimiento_pruebas_envios add column ultimo_intento_at timestamptz;
update public.seguimiento_pruebas_envios set ultimo_intento_at = coalesce(enviado_at, updated_at) where ultimo_intento_at is null;

drop function public.seguimiento_reservar(uuid, text, text, text, boolean);
create function public.seguimiento_reservar(p_negocio_id uuid, p_etapa text, p_plantilla text, p_telefono text, p_perfil boolean, p_ahora timestamptz default now())
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.';
  end if;
  if coalesce((select a.valor from public.seguimiento_pruebas_ajustes a where a.clave = 'pausa' and a.deleted_at is null), 'no') = 'si' then
    return null;
  end if;
  if exists (select 1 from public.seguimiento_pruebas_paradas p where p.negocio_id = p_negocio_id and p.deleted_at is null)
     or exists (select 1 from public.seguimiento_pruebas_exclusiones x where x.telefono = p_telefono and x.deleted_at is null) then
    return null;
  end if;
  insert into public.seguimiento_pruebas_envios as e (negocio_id, etapa, plantilla, telefono, estado, intentos, perfil_completo, ultimo_intento_at, created_by)
  values (p_negocio_id, p_etapa, p_plantilla, p_telefono, 'enviando', 1, p_perfil, p_ahora, null)
  on conflict on constraint seguimiento_pruebas_envios_unico do update
    set estado = 'enviando', intentos = e.intentos + 1, plantilla = excluded.plantilla, perfil_completo = excluded.perfil_completo, ultimo_intento_at = p_ahora
    where e.estado = 'fallido' and e.reintentable and e.intentos < 2 and e.ultimo_intento_at < p_ahora - interval '30 minutes'
  returning e.id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.seguimiento_reservar(uuid, text, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.seguimiento_reservar(uuid, text, text, text, boolean, timestamptz) to service_role;

create or replace function public.seguimiento_candidatos()
returns table (negocio_id uuid, slug text, nombre text, zona text, creado_at timestamptz, prueba_termina_at timestamptz,
               telefono text, persona text, perfil_completo boolean, limite_web timestamptz, excluida boolean, detenido boolean, envios jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.';
  end if;
  return query
  select n.id, n.slug, n.nombre, n.zona_horaria, n.created_at, n.prueba_termina_at,
    r.telefono,
    nullif(btrim(split_part(btrim(coalesce(pr.nombre_completo, '')), ' ', 1)), ''),
    public.seguimiento_perfil_completo(n.id),
    n.created_at + interval '7 days',
    exists (select 1 from public.seguimiento_pruebas_exclusiones x where x.telefono = r.telefono and x.deleted_at is null),
    exists (select 1 from public.seguimiento_pruebas_paradas p where p.negocio_id = n.id and p.deleted_at is null),
    coalesce((select jsonb_object_agg(e.etapa, jsonb_build_object('estado', e.estado, 'intentos', e.intentos, 'reintentable', e.reintentable,
                                                                  'updated_at', e.updated_at, 'ultimo_intento_at', coalesce(e.ultimo_intento_at, e.updated_at)))
              from public.seguimiento_pruebas_envios e where e.negocio_id = n.id and e.deleted_at is null), '{}'::jsonb)
  from public.negocios n
  join lateral (select rp.telefono, rp.persona_id from public.registros_prueba rp
                where rp.negocio_id = n.id and rp.deleted_at is null order by rp.created_at desc limit 1) r on true
  left join public.profiles pr on pr.id = r.persona_id
  where n.deleted_at is null and n.activo and n.plan = 'prueba' and not n.cobro_exento
    and n.prueba_termina_at is not null and n.prueba_termina_at > now()
    and length(r.telefono) = 10
    and not exists (select 1 from public.suscripciones s where s.negocio_id = n.id and s.deleted_at is null and s.stripe_subscription_id is not null)
  order by n.created_at;
end;
$$;
