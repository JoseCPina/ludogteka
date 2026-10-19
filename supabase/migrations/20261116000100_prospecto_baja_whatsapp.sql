-- BAJA por WhatsApp de cualquiera (19 de octubre de 2026), complemento de 20261116000000_meta_audiencias.

-- El aviso de privacidad dice que un negocio pide la baja escribiendo BAJA al WhatsApp de PeluDesk. Si el número no
-- está en el seguimiento de pruebas, el webhook llama esta función: el teléfono queda excluido para siempre
-- (seguimiento_pruebas_exclusiones, la misma lista) y los prospectos con ese número quedan fuera de la publicidad.
create or replace function public.prospecto_baja_whatsapp(p_telefono text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_n int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  if length(v_tel) = 12 and v_tel like '52%' then v_tel := substr(v_tel, 3); end if;
  if length(v_tel) = 13 and v_tel like '521%' then v_tel := substr(v_tel, 4); end if;
  if length(v_tel) <> 10 then return 0; end if;
  insert into public.seguimiento_pruebas_exclusiones (telefono, motivo, created_by) values (v_tel, 'baja', null)
  on conflict on constraint seguimiento_pruebas_exclusiones_unico do nothing;
  update public.prospectos set publicidad_baja_at = now(), publicidad_baja_motivo = 'Escribió BAJA por WhatsApp'
  where deleted_at is null and publicidad_baja_at is null and (telefono_norm = v_tel or whatsapp_bot = v_tel or right(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), 10) = v_tel);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.prospecto_baja_whatsapp(text) from public, anon, authenticated;
grant execute on function public.prospecto_baja_whatsapp(text) to service_role;

do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position($a$('prospecto_baja_whatsapp')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('meta_audiencias_negocios')$a$, $b$('meta_audiencias_negocios'), ('prospecto_baja_whatsapp')$b$);
    if position($a$('prospecto_baja_whatsapp')$a$ in v_def) = 0 then raise exception 'auditoria_frontera cambió: no se pudo agregar prospecto_baja_whatsapp.'; end if;
  end if;
  execute v_def;
end $$;
