-- «Invitar al portal»: un enlace de un solo uso para que un cliente que ya
-- existe (dado de alta en el mostrador, sin cuenta) escoja su contraseña la
-- primera vez. El enlace lleva un token de 32 bytes; aquí SOLO se guarda su
-- sha256 y su vencimiento. El servidor valida token + vencimiento + negocio
-- con la secret key y crea la cuenta; esta tabla solo la escribe la función
-- de abajo (personal) o el servidor.

create table public.portal_invitaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  cliente_id uuid not null references public.clientes(id),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  expira_at timestamptz not null,
  usada_at timestamptz,
  cancelada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index portal_invitaciones_token_idx on public.portal_invitaciones (token_hash);
create index portal_invitaciones_negocio_idx on public.portal_invitaciones (negocio_id);
create index portal_invitaciones_cliente_idx on public.portal_invitaciones (negocio_id, cliente_id) where deleted_at is null;
create trigger set_updated_at before insert or update on public.portal_invitaciones for each row execute function public.set_updated_at();
create trigger exigir_modulo before insert or update on public.portal_invitaciones for each row execute function public.exigir_modulo_tabla('portal');

alter table public.portal_invitaciones enable row level security;
create policy portal_invitaciones_negocio on public.portal_invitaciones as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy portal_invitaciones_negocio_definer on public.portal_invitaciones for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy portal_invitaciones_escritura_ins on public.portal_invitaciones as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy portal_invitaciones_escritura_upd on public.portal_invitaciones as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy portal_invitaciones_escritura_del on public.portal_invitaciones as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
-- Leer: el personal. Escribir: solo por la función de abajo y el servidor.
create policy portal_invitaciones_select on public.portal_invitaciones for select to authenticated
  using ((select public.is_staff()));
revoke all on public.portal_invitaciones from anon, authenticated;
grant select on public.portal_invitaciones to authenticated;
grant select, insert, update, delete on public.portal_invitaciones to peludesk_definer;

-- El personal (admin o recepción) la crea; el token en claro NUNCA llega aquí.
create or replace function public.crear_invitacion_portal(p_cliente_id uuid, p_token_hash text, p_dias integer default 7)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expira timestamptz;
  v_tiene_cuenta boolean;
begin
  if not (coalesce((select public.is_admin()), false) or coalesce((select public.current_rol()), 'anonimo') = 'recepcion') then
    raise exception 'Invitar al portal es de admin o recepción.' using errcode = '42501';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 30 then
    raise exception 'La invitación puede durar de 1 a 30 días.';
  end if;
  if not exists (select 1 from public.clientes where id = p_cliente_id and deleted_at is null and publico_general = false and negocio_id = (select public.negocio_actual())) then
    raise exception 'No encontré a ese cliente.';
  end if;
  select exists (select 1 from public.membresias where cliente_id = p_cliente_id and negocio_id = (select public.negocio_actual()) and deleted_at is null) into v_tiene_cuenta;
  if v_tiene_cuenta then
    raise exception 'Este cliente ya tiene cuenta. Si olvidó su contraseña, restablécesela.';
  end if;
  -- Una invitación vigente a la vez: la anterior deja de servir.
  update public.portal_invitaciones set cancelada_at = now()
  where cliente_id = p_cliente_id and negocio_id = (select public.negocio_actual()) and usada_at is null and cancelada_at is null and deleted_at is null;
  v_expira := now() + make_interval(days => p_dias);
  insert into public.portal_invitaciones (cliente_id, token_hash, expira_at) values (p_cliente_id, p_token_hash, v_expira);
  return v_expira;
end;
$$;
alter function public.crear_invitacion_portal(uuid, text, integer) owner to peludesk_definer;
revoke execute on function public.crear_invitacion_portal(uuid, text, integer) from public, anon;
grant execute on function public.crear_invitacion_portal(uuid, text, integer) to authenticated, service_role;
