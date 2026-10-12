-- Cierra el ciclo de un mensaje que no llegó:
--  · «Ya lo mandé» (a mano por wa.me) u «Omitir» en un recordatorio resuelve también su aviso de «Necesita atención».
--  · «Reintentar envío» vuelve el recordatorio a «pendiente» (la tarea lo manda otra vez) y resuelve el aviso.
--  · Un envío nuevo para la misma cosa (misma cita, mismo recordatorio) deja resuelto el fallo anterior.
-- Se quita wa_fallo_reintentar (el reintento va por el recordatorio, que es lo que el personal tiene delante).
drop function if exists public.wa_fallo_reintentar(uuid);

do $$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('public.carnet_recordatorio_marcar(uuid,text,text)'::regprocedure), E'\r', '');
  if position('wa_entrega' in v_def) = 0 then
    v_def := replace(v_def, E'  if not found then\n    raise exception ''Ese recordatorio no existe o ya se resolvió.'';\n  end if;',
      E'  if not found then\n    raise exception ''Ese recordatorio no existe o ya se resolvió.'';\n  end if;\n  update public.wa_entregas set resuelto_at = now(), resuelto_por = auth.uid()\n   where origen = ''carnet_recordatorio'' and ref_id = p_id and negocio_ref = public.negocio_actual() and estado = ''fallido'' and resuelto_at is null;');
    if position('wa_entrega' in v_def) = 0 then raise exception 'No se pudo parchar carnet_recordatorio_marcar: cambió su texto.'; end if;
    execute v_def;
  end if;
end $$;

create or replace function public.carnet_recordatorio_reintentar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('registrar_vacunas') then
    raise exception 'Reintentar un recordatorio es de un médico veterinario, de admin o de quien tenga «Registrar vacunas y desparasitaciones».' using errcode = '42501';
  end if;
  update public.carnet_recordatorios set estado = 'pendiente', error = null, intentos = 0
   where id = p_id and negocio_id = public.negocio_actual() and estado = 'fallido' and deleted_at is null;
  if not found then
    raise exception 'Ese recordatorio no existe o ya se resolvió.';
  end if;
  update public.wa_entregas set resuelto_at = now(), resuelto_por = auth.uid()
   where origen = 'carnet_recordatorio' and ref_id = p_id and negocio_ref = public.negocio_actual() and estado = 'fallido' and resuelto_at is null;
end;
$$;
alter function public.carnet_recordatorio_reintentar(uuid) owner to postgres;
revoke execute on function public.carnet_recordatorio_reintentar(uuid) from public, anon;
grant execute on function public.carnet_recordatorio_reintentar(uuid) to authenticated, service_role;

-- Un envío nuevo para la misma cosa resuelve el fallo anterior.
do $$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('public.wa_entrega_registrar(text,text,text,uuid,uuid,text,text,text)'::regprocedure), E'\r', '');
  if position('superseded' in v_def) = 0 then
    v_def := replace(v_def, E'  -- Si el estado llegó antes',
      E'  -- superseded: un envío nuevo para la misma cosa deja resuelto el fallo anterior.\n  if p_ref is not null then\n    update public.wa_entregas set resuelto_at = now()\n     where ref_id = p_ref and origen = coalesce(p_origen, ''desconocido'') and estado = ''fallido'' and resuelto_at is null and wa_message_id <> p_wa_id;\n  end if;\n  -- Si el estado llegó antes');
    if position('superseded' in v_def) = 0 then raise exception 'No se pudo parchar wa_entrega_registrar.'; end if;
    execute v_def;
  end if;
end $$;

-- La función es de postgres y trabaja sobre una tabla sin negocio_id: a la lista blanca.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position('carnet_recordatorio_reintentar' in v_def) = 0 then
    v_def := replace(v_def, $a$('wa_fallo_reintentar')$a$, $b$('carnet_recordatorio_reintentar')$b$);
    if position('carnet_recordatorio_reintentar' in v_def) = 0 then raise exception 'auditoria_frontera cambió.'; end if;
    execute v_def;
  end if;
end $$;
