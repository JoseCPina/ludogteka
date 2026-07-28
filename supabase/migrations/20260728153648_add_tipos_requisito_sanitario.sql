-- Decisión (adición 3, desparasitación): se generaliza el catálogo de
-- vacunas a "requisitos sanitarios" cubriendo tanto vacuna como
-- desparasitación, en vez de modelar la desparasitación aparte. Las dos
-- comparten exactamente la misma forma (fecha de aplicación, vigencia,
-- producto/responsable, si es obligatoria) y Fase 4 va a necesitar
-- preguntar "¿qué le falta a este perro?" cruzando AMBAS categorías con
-- una sola consulta/vista, no dos sistemas paralelos. `categoria` distingue
-- el tipo sin duplicar tablas; si en el futuro aparece un tercer requisito
-- con esta misma forma (p. ej. un chequeo veterinario anual), entra como
-- una fila más de este catálogo, no como otra tabla.
create table public.tipos_requisito_sanitario (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('vacuna', 'desparasitacion')),
  clave text not null unique,
  etiqueta text not null,
  vigencia_meses int not null,
  obligatoria boolean not null default true,
  -- Adición 5 (bordetella): columna ortogonal a `obligatoria`, para que la
  -- UI le dé prominencia especial (alerta visual propia) sin mezclar ese
  -- criterio con "falta para poder reservar". Todas las obligatorias
  -- bloquean igual; es_critica es señal de UI, no de negocio.
  es_critica boolean not null default false,
  orden int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at before insert or update on public.tipos_requisito_sanitario
  for each row execute function public.set_updated_at();

alter table public.tipos_requisito_sanitario enable row level security;

create policy tipos_requisito_sanitario_select_autenticados on public.tipos_requisito_sanitario
  for select to authenticated
  using (true);

create policy tipos_requisito_sanitario_insert_admin on public.tipos_requisito_sanitario
  for insert to authenticated
  with check (public.is_admin());

create policy tipos_requisito_sanitario_update_admin on public.tipos_requisito_sanitario
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.tipos_requisito_sanitario
  (categoria, clave, etiqueta, vigencia_meses, obligatoria, es_critica, orden, updated_at)
values
  ('vacuna', 'antirrabica', 'Antirrábica', 12, true, false, 1, now()),
  ('vacuna', 'multiple_sextuple', 'Múltiple / séxtuple', 12, true, false, 2, now()),
  ('vacuna', 'bordetella', 'Bordetella', 12, true, true, 3, now()),
  -- Vigencia de 6 meses es un valor supuesto (no confirmado por el
  -- negocio) porque la desparasitación interna típica se reaplica cada
  -- 3-6 meses en adultos; ajustar aquí si el negocio maneja otro criterio.
  ('desparasitacion', 'desparasitacion_interna', 'Desparasitación interna', 6, true, false, 4, now());
