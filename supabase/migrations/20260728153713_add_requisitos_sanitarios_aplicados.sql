-- Aplicaciones reales de cada requisito sanitario (vacuna o desparasitación)
-- por perro. Un GENERATED column no puede resolver un subquery contra otra
-- tabla, así que vigencia_meses_aplicado congela aquí, al momento de la
-- aplicación, el valor que tenía tipos_requisito_sanitario.vigencia_meses.
-- Es una ventaja, no un rodeo: si el negocio ajusta la vigencia del
-- catálogo más adelante, las aplicaciones ya registradas no cambian de
-- fecha de vencimiento retroactivamente.
create table public.requisitos_sanitarios_aplicados (
  id uuid primary key default gen_random_uuid(),
  perro_id uuid not null references public.perros(id),
  tipo_requisito_id uuid not null references public.tipos_requisito_sanitario(id),
  fecha_aplicacion date not null,
  vigencia_meses_aplicado int not null,
  fecha_vencimiento date generated always as (
    (fecha_aplicacion + (vigencia_meses_aplicado * interval '1 month'))::date
  ) stored,
  -- Vacuna: veterinario y clínica responsable. Desparasitación: producto
  -- aplicado. Un solo campo de texto le basta a ambas categorías.
  detalle text,
  -- Adición 2: foto del carnet físico, mismas reglas de privacidad que
  -- perros.foto_path (Storage, migración aparte).
  comprobante_path text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at before insert or update on public.requisitos_sanitarios_aplicados
  for each row execute function public.set_updated_at();

create index requisitos_sanitarios_aplicados_perro_tipo_fecha_idx
  on public.requisitos_sanitarios_aplicados (perro_id, tipo_requisito_id, fecha_aplicacion desc);

-- Congela vigencia_meses_aplicado desde el catálogo si no se manda
-- explícito, para que la app no tenga que conocer el valor vigente.
create or replace function public.fijar_vigencia_aplicada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vigencia_meses_aplicado is null then
    select vigencia_meses into new.vigencia_meses_aplicado
    from public.tipos_requisito_sanitario
    where id = new.tipo_requisito_id;
  end if;
  return new;
end;
$$;

create trigger fijar_vigencia_aplicada
before insert on public.requisitos_sanitarios_aplicados
for each row execute function public.fijar_vigencia_aplicada();

alter table public.requisitos_sanitarios_aplicados enable row level security;

create policy requisitos_sanitarios_aplicados_select_staff on public.requisitos_sanitarios_aplicados
  for select to authenticated
  using (public.is_staff());

-- El dueño puede ver el historial de vacunas/desparasitación de su propio
-- perro (le sirve para saber cuándo toca la siguiente), aunque no pueda
-- escribirlo.
create policy requisitos_sanitarios_aplicados_select_propio on public.requisitos_sanitarios_aplicados
  for select to authenticated
  using (
    exists (
      select 1 from public.perros p
      where p.id = requisitos_sanitarios_aplicados.perro_id
        and (
          p.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
          or exists (
            select 1 from public.perro_accesos_compartidos pac
            where pac.perro_id = p.id
              and pac.deleted_at is null
              and pac.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
          )
        )
    )
  );

-- Solo admin/recepción registran vacunas y desparasitaciones (acuerdo Q2).
create policy requisitos_sanitarios_aplicados_insert_staff on public.requisitos_sanitarios_aplicados
  for insert to authenticated
  with check (public.current_rol() in ('admin', 'recepcion'));

create policy requisitos_sanitarios_aplicados_update_staff on public.requisitos_sanitarios_aplicados
  for update to authenticated
  using (public.current_rol() in ('admin', 'recepcion'))
  with check (public.current_rol() in ('admin', 'recepcion'));
