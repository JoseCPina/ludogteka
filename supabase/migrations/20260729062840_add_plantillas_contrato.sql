-- Fase 6, Bloque A: plantilla de contrato, insert-only y versionada —
-- mismo principio que tarifas/cupo_configuracion/configuracion_descuentos:
-- cambiar el texto NUNCA es un UPDATE a una fila existente, siempre un
-- INSERT nuevo. Un contrato ya generado (migración siguiente) referencia
-- el id de la versión exacta que usó — como esa fila nunca se edita,
-- el contrato firmado sigue apuntando al texto original para siempre,
-- sin importar cuántas versiones nuevas se publiquen después.
--
-- cuerpo usa placeholders {{token}} en texto plano/Markdown simple,
-- resueltos por resolver_campos_contrato() (migración siguiente) al
-- generar el PDF — nunca se interpola nada en el propio SQL.
create table public.plantillas_contrato (
  id uuid primary key default gen_random_uuid(),
  version int not null,
  titulo text not null,
  cuerpo text not null,
  activa boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  unique (version)
);

create trigger set_updated_at before insert or update on public.plantillas_contrato
  for each row execute function public.set_updated_at();

-- Solo una versión activa a la vez — la que se usa para generar contratos
-- nuevos. Las versiones viejas se quedan en la tabla (nunca se borran),
-- solo dejan de ser la vigente.
create unique index plantillas_contrato_una_activa_idx on public.plantillas_contrato (activa) where activa;

alter table public.plantillas_contrato enable row level security;

create policy plantillas_contrato_select_staff on public.plantillas_contrato
  for select to authenticated
  using (public.is_staff());

-- Sin política de INSERT/UPDATE para authenticated a propósito: la única
-- puerta de entrada es publicar_plantilla() (abajo), SECURITY DEFINER,
-- solo admin — así ninguna pantalla puede editar por accidente una
-- versión que un contrato ya firmado está referenciando.
create or replace function public.publicar_plantilla(
  p_titulo text,
  p_cuerpo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version int;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede editar la plantilla del contrato.';
  end if;

  if p_titulo is null or btrim(p_titulo) = '' then
    raise exception 'El título no puede estar vacío.';
  end if;
  if p_cuerpo is null or btrim(p_cuerpo) = '' then
    raise exception 'El cuerpo del contrato no puede estar vacío.';
  end if;

  update public.plantillas_contrato set activa = false where activa = true;

  select coalesce(max(version), 0) + 1 into v_version from public.plantillas_contrato;

  insert into public.plantillas_contrato (version, titulo, cuerpo, activa, created_by)
  values (v_version, btrim(p_titulo), p_cuerpo, true, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.publicar_plantilla(text, text) from public;
grant execute on function public.publicar_plantilla(text, text) to authenticated;
