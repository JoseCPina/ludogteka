-- carnet_recordatorio_marcar es de peludesk_definer y no puede tocar wa_entregas (tabla de la plataforma):
-- resuelve el aviso por una función puente de postgres, acotada al negocio de la petición.
create or replace function public.wa_entrega_resolver(p_origen text, p_ref uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal del negocio.' using errcode = '42501';
  end if;
  update public.wa_entregas set resuelto_at = now(), resuelto_por = auth.uid()
   where origen = p_origen and ref_id = p_ref and negocio_ref = public.negocio_actual() and estado = 'fallido' and resuelto_at is null;
end;
$$;
alter function public.wa_entrega_resolver(text, uuid) owner to postgres;
revoke execute on function public.wa_entrega_resolver(text, uuid) from public, anon;
grant execute on function public.wa_entrega_resolver(text, uuid) to authenticated, service_role, peludesk_definer;

do $$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('public.carnet_recordatorio_marcar(uuid,text,text)'::regprocedure), E'\r', '');
  v_def := replace(v_def, E'  update public.wa_entregas set resuelto_at = now(), resuelto_por = auth.uid()\n   where origen = ''carnet_recordatorio'' and ref_id = p_id and negocio_ref = public.negocio_actual() and estado = ''fallido'' and resuelto_at is null;',
                          E'  perform public.wa_entrega_resolver(''carnet_recordatorio'', p_id);');
  if position('wa_entrega_resolver' in v_def) = 0 then raise exception 'No se pudo parchar carnet_recordatorio_marcar.'; end if;
  execute v_def;

  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position('wa_entrega_resolver' in v_def) = 0 then
    v_def := replace(v_def, $a$('carnet_recordatorio_reintentar')$a$, $b$('carnet_recordatorio_reintentar'), ('wa_entrega_resolver')$b$);
    if position('wa_entrega_resolver' in v_def) = 0 then raise exception 'auditoria_frontera cambió.'; end if;
    execute v_def;
  end if;
end $$;
