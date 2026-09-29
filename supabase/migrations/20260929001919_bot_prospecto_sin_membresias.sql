-- El bot de WhatsApp trataba a TODO número desconocido como «cliente de un
-- negocio» (dueño de un perro) en vez de posible cliente de PeluDesk:
--
--   select case when bool_or(...) then 'personal' else 'cliente_de_negocio' end
--   into v_otro from membresias where profile_id = any(v_personas) ...
--
-- sobre CERO membresías un agregado igual devuelve una fila, con bool_or NULL,
-- y el case cae en el else. Así le preguntó a un prospecto «¿Tu perro va a
-- guardería…?» (29 de septiembre de 2026). Ahora sin membresías el resultado
-- es NULL y, si tampoco es cliente de nadie por teléfono, queda «prospecto».
-- Mismo dueño (postgres, en la lista blanca de auditoria_frontera) y mismos
-- permisos: solo service_role.
create or replace function public.bot_cuenta_por_telefono(p_telefono text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_personas uuid[];
  v_admin jsonb;
  v_otro text;
begin
  if length(v_tel) = 12 and v_tel like '52%' then v_tel := substr(v_tel, 3); end if;
  if length(v_tel) = 13 and v_tel like '521%' then v_tel := substr(v_tel, 4); end if;
  if length(v_tel) <> 10 then
    return jsonb_build_object('tipo', 'prospecto', 'negocios', '[]'::jsonb);
  end if;

  v_personas := array(
    select u.id from auth.users u where lower(u.email) = 't' || v_tel || '@telefono.ludogteka.mx'
    union
    select r.persona_id from public.registros_prueba r
    where r.telefono = v_tel and r.persona_id is not null and r.deleted_at is null
  );

  select coalesce(jsonb_agg(jsonb_build_object(
      'negocio_id', n.id,
      'nombre', n.nombre,
      'slug', n.slug,
      'dominio', n.dominio,
      'url_publica', n.url_publica,
      'activo', n.activo,
      'plan', n.plan,
      'plan_nombre', p.nombre,
      'prueba_termina_at', n.prueba_termina_at,
      'estado_cobro', public.estado_cobro_en(n.id),
      'periodicidad', s.periodicidad,
      'periodo_fin', s.periodo_fin,
      'cancela_al_terminar', coalesce(s.cancela_al_terminar, false),
      'primer_fallo_at', s.primer_fallo_at,
      'tiene_cuenta_stripe', s.stripe_customer_id is not null
    ) order by n.created_at), '[]'::jsonb)
  into v_admin
  from public.membresias m
  join public.negocios n on n.id = m.negocio_id and n.deleted_at is null
  left join public.planes p on p.id = n.plan_id
  left join public.suscripciones s on s.negocio_id = n.id and s.deleted_at is null
  where m.profile_id = any(v_personas) and m.deleted_at is null and m.rol = 'admin';

  if jsonb_array_length(v_admin) > 0 then
    return jsonb_build_object('tipo', 'admin', 'negocios', v_admin);
  end if;

  select case when count(*) = 0 then null when bool_or(m.rol in ('recepcion', 'estetica')) then 'personal' else 'cliente_de_negocio' end
  into v_otro
  from public.membresias m
  where m.profile_id = any(v_personas) and m.deleted_at is null;
  if v_otro is null and exists (select 1 from public.clientes c where c.telefono = v_tel and c.deleted_at is null) then
    v_otro := 'cliente_de_negocio';
  end if;
  return jsonb_build_object('tipo', coalesce(v_otro, 'prospecto'), 'negocios', '[]'::jsonb);
end;
$$;
revoke execute on function public.bot_cuenta_por_telefono(text) from public, anon, authenticated;
grant execute on function public.bot_cuenta_por_telefono(text) to service_role;
