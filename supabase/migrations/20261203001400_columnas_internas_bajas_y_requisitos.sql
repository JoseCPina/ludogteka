-- Columnas internas fuera del alcance del dueño, segunda vuelta (1 de noviembre de 2026; regla de docs/columnas-internas.md:
-- la RLS no filtra columnas, así que un dato interno nunca es columna de una tabla que el dueño pueda leer).
--
-- Lo que se encontró en producción (lectura con el JWT de una dueña): `perros_select_propio` deja leer la fila entera de
-- `perros`, y con ella `baja_nota` (texto libre del personal) y `baja_por` (quién dio la baja), nacidas el 31 de octubre
-- con la baja de mascotas (migración 20261203000700); `requisitos_sanitarios_aplicados_select_propio` deja leer
-- `anulado_por`, `anulado_motivo` y `historial` (quién corrigió o anuló cada registro y por qué, con lo que decía antes),
-- nacidas el 20 de octubre (20261101000000). Y `perros_bajas_select_propio` dejaba leer la bitácora entera de las bajas
-- del cliente, incluida la nota del personal de una baja hecha por el negocio. Ninguna pantalla las enseñaba al dueño;
-- la exposición era por la API. Expuestos: 0 notas de baja, 1 baja con motivo (Ludogteka, 31 de octubre 23:22 UTC, sin
-- nota) y 1 anulación con motivo («Duplicada», Ludogteka, 31 de octubre 20:47 UTC).
--
-- Qué cambia:
--   1. `perros.baja_nota` y `perros.baja_por` se van: viven ya en la bitácora `perros_bajas` (tipo 'baja': nota y
--      atendida_por), que es solo del personal. `baja_motivo` se queda: el dueño lo ve en su portal a propósito
--      («Falleció», «Ya no viene»…).
--   2. `perros_bajas` deja de ser legible por el dueño; lo que él pidió (sus solicitudes, con la respuesta del negocio)
--      sale por `portal_solicitudes_baja(perro)`.
--   3. `requisitos_sanitarios_aplicados.anulado_por`, `anulado_motivo` e `historial` pasan a la tabla interna
--      `requisitos_sanitarios_internos` (solo personal). `anulado_at` se queda: el portal lo usa para no enseñar lo anulado.

-- ── 1. perros: la nota y el autor de la baja viven en perros_bajas ────────────────────────────────────────────────
-- Respaldo: una baja inactiva sin su renglón en la bitácora (no debería haber) lo recibe ahora, con su nota y su autor.
insert into public.perros_bajas (negocio_id, perro_id, perro_nombre, cliente_id, tipo, motivo, nota, resultado, atendida_por, atendida_at, created_at)
select p.negocio_id, p.id, p.nombre, p.cliente_id, 'baja', p.baja_motivo, p.baja_nota, 'inactiva', p.baja_por, p.deleted_at, p.deleted_at
from public.perros p
where p.deleted_at is not null and p.baja_motivo is not null
  and not exists (select 1 from public.perros_bajas b where b.perro_id = p.id and b.tipo = 'baja' and b.deleted_at is null);

-- Las funciones que las escribían: se parchan sobre su definición viva (solo las líneas de esas dos columnas).
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.perro_dar_de_baja(uuid, text, text, uuid)'::regprocedure), chr(13), '') into v_def;
  v_def := replace(v_def, E'      baja_motivo = p_motivo,\n      baja_nota = nullif(btrim(coalesce(p_nota, \'\')), \'\'),\n      baja_por = auth.uid(),\n', E'      baja_motivo = p_motivo,\n');
  v_def := replace(v_def, E'deleted_at = now(), baja_motivo = p_motivo, baja_nota = nullif(btrim(coalesce(p_nota, \'\')), \'\'), baja_por = auth.uid(),', E'deleted_at = now(), baja_motivo = p_motivo,');
  if position('baja_nota' in v_def) > 0 or position('baja_por' in v_def) > 0 then
    raise exception 'perro_dar_de_baja cambió: no se pudieron quitar baja_nota / baja_por.';
  end if;
  execute v_def;

  select replace(pg_get_functiondef('public.perro_reactivar(uuid)'::regprocedure), chr(13), '') into v_def;
  v_def := replace(v_def, 'baja_motivo = null, baja_nota = null, baja_por = null', 'baja_motivo = null');
  if position('baja_nota' in v_def) > 0 or position('baja_por' in v_def) > 0 then
    raise exception 'perro_reactivar cambió: no se pudieron quitar baja_nota / baja_por.';
  end if;
  execute v_def;

  -- El resumen del personal las lee de la bitácora (la última baja de la mascota).
  select replace(pg_get_functiondef('public.perro_baja_resumen(uuid)'::regprocedure), chr(13), '') into v_def;
  v_def := replace(v_def,
    $a$'baja_at', v_perro.deleted_at, 'baja_motivo', v_perro.baja_motivo, 'baja_nota', v_perro.baja_nota, 'baja_por', v_perro.baja_por,$a$,
    $b$'baja_at', v_perro.deleted_at, 'baja_motivo', v_perro.baja_motivo,
    'baja_nota', (select b.nota from public.perros_bajas b where b.perro_id = p_perro_id and b.tipo = 'baja' and b.deleted_at is null order by b.created_at desc limit 1),
    'baja_por', (select b.atendida_por from public.perros_bajas b where b.perro_id = p_perro_id and b.tipo = 'baja' and b.deleted_at is null order by b.created_at desc limit 1),$b$);
  if position('v_perro.baja_nota' in v_def) > 0 then
    raise exception 'perro_baja_resumen cambió: no se pudo cambiar la fuente de baja_nota / baja_por.';
  end if;
  execute v_def;
end $$;

alter table public.perros drop column baja_nota, drop column baja_por;

-- ── 2. perros_bajas: solo personal; el dueño ve sus solicitudes por función ──────────────────────────────────────
drop policy if exists perros_bajas_select_propio on public.perros_bajas;

create or replace function public.portal_solicitudes_baja(p_perro_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', b.id, 'motivo', b.motivo, 'nota', b.nota, 'resultado', b.resultado, 'respuesta', b.respuesta,
        'created_at', b.created_at, 'atendida_at', b.atendida_at
      ) order by b.created_at desc)
    from public.perros_bajas b
    where b.perro_id = p_perro_id
      and b.negocio_id = public.negocio_actual()
      and b.tipo = 'solicitud'
      and b.deleted_at is null
      and b.cliente_id is not null
      and b.cliente_id = public.mi_cliente_id()
  ), '[]'::jsonb);
$$;
alter function public.portal_solicitudes_baja(uuid) owner to peludesk_definer;
revoke execute on function public.portal_solicitudes_baja(uuid) from public, anon;
grant execute on function public.portal_solicitudes_baja(uuid) to authenticated, service_role;

-- ── 3. requisitos sanitarios: quién corrigió o anuló, y por qué, en tabla interna ────────────────────────────────
create table public.requisitos_sanitarios_internos (
  requisito_id uuid primary key references public.requisitos_sanitarios_aplicados(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  anulado_por uuid references auth.users(id) on delete set null,
  anulado_motivo text,
  historial jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index requisitos_sanitarios_internos_negocio_idx on public.requisitos_sanitarios_internos (negocio_id);
create trigger set_updated_at before insert or update on public.requisitos_sanitarios_internos for each row execute function public.set_updated_at();
alter table public.requisitos_sanitarios_internos enable row level security;
-- Solo lo lee el personal; lo escriben las funciones (peludesk_definer). Ningún dueño, nunca.
create policy requisitos_sanitarios_internos_select_staff on public.requisitos_sanitarios_internos for select to authenticated using ((select public.is_staff()));
create policy requisitos_sanitarios_internos_negocio on public.requisitos_sanitarios_internos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy requisitos_sanitarios_internos_negocio_definer on public.requisitos_sanitarios_internos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.requisitos_sanitarios_internos to peludesk_definer;

-- Lo que ya había pasa a la tabla interna.
insert into public.requisitos_sanitarios_internos (requisito_id, negocio_id, anulado_por, anulado_motivo, historial, created_at, updated_at)
select r.id, r.negocio_id, r.anulado_por, r.anulado_motivo, coalesce(r.historial, '[]'::jsonb), coalesce(r.anulado_at, r.updated_at), now()
from public.requisitos_sanitarios_aplicados r
where r.anulado_at is not null or r.anulado_por is not null or r.anulado_motivo is not null or coalesce(r.historial, '[]'::jsonb) <> '[]'::jsonb;

-- El candado de la tabla ya no conoce esas columnas.
create or replace function public.requisito_aplicado_protegido()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.perro_id is distinct from old.perro_id
    or new.tipo_requisito_id is distinct from old.tipo_requisito_id
    or new.fecha_aplicacion is distinct from old.fecha_aplicacion
    or new.vigencia_meses_aplicado is distinct from old.vigencia_meses_aplicado
    or new.detalle is distinct from old.detalle
    or new.notas is distinct from old.notas
    or new.deleted_at is distinct from old.deleted_at
    or new.anulado_at is distinct from old.anulado_at
  ) then
    raise exception 'Un registro sanitario se corrige o se anula con «Corregir» o «Anular con motivo».' using errcode = '42501';
  end if;
  return new;
end;
$$;

alter table public.requisitos_sanitarios_aplicados drop column anulado_por, drop column anulado_motivo, drop column historial;

-- Corregir: lo que decía antes queda en el historial interno.
create or replace function public.corregir_requisito_aplicado(p_id uuid, p_fecha date, p_detalle text, p_notas text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not (coalesce(public.is_admin(), false) or public.vet_puede('registrar_vacunas')) then
    raise exception 'Corregir un registro sanitario es de admin o de quien tenga «Registrar vacunas y desparasitaciones».' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la corrección.';
  end if;
  select * into v_r from public.requisitos_sanitarios_aplicados r
  where r.id = p_id and r.negocio_id = public.negocio_actual();
  if not found then
    raise exception 'Ese registro no existe.';
  end if;
  if v_r.deleted_at is not null then
    raise exception 'Ese registro ya está anulado.';
  end if;
  if p_fecha is null or p_fecha > public.fecha_negocio() then
    raise exception 'La fecha de aplicación no puede ser futura.';
  end if;
  if p_fecha < date '1990-01-01' then
    raise exception 'La fecha de aplicación no es válida.';
  end if;
  if exists (
    select 1 from public.requisitos_sanitarios_aplicados r
    where r.perro_id = v_r.perro_id and r.tipo_requisito_id = v_r.tipo_requisito_id and r.fecha_aplicacion = p_fecha
      and r.deleted_at is null and r.negocio_id = v_r.negocio_id and r.id <> v_r.id
  ) then
    raise exception 'Ya hay otro registro de ese requisito con esa fecha para esta mascota.';
  end if;
  update public.requisitos_sanitarios_aplicados set
    fecha_aplicacion = p_fecha,
    detalle = nullif(btrim(coalesce(p_detalle, '')), ''),
    notas = nullif(btrim(coalesce(p_notas, '')), '')
  where id = v_r.id;
  insert into public.requisitos_sanitarios_internos as i (requisito_id, negocio_id, historial, updated_at)
  values (v_r.id, v_r.negocio_id, jsonb_build_array(jsonb_build_object(
      'tipo', 'correccion', 'motivo', v_motivo, 'por', auth.uid(), 'cuando', now(),
      'antes', jsonb_build_object('fecha_aplicacion', v_r.fecha_aplicacion, 'detalle', v_r.detalle, 'notas', v_r.notas))), now())
  on conflict (requisito_id) do update set
    historial = i.historial || excluded.historial,
    updated_at = now();
end;
$$;

-- Anular con motivo (no se borra): la marca en la tabla, el motivo y el autor en la interna.
create or replace function public.anular_requisito_aplicado(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_r record;
begin
  if not (coalesce(public.is_admin(), false) or public.vet_puede('registrar_vacunas')) then
    raise exception 'Anular un registro sanitario es de admin o de quien tenga «Registrar vacunas y desparasitaciones».' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la anulación.';
  end if;
  update public.requisitos_sanitarios_aplicados set deleted_at = now(), anulado_at = now()
  where id = p_id and negocio_id = public.negocio_actual() and deleted_at is null
  returning * into v_r;
  if not found then
    raise exception 'Ese registro no existe o ya estaba anulado.';
  end if;
  insert into public.requisitos_sanitarios_internos as i (requisito_id, negocio_id, anulado_por, anulado_motivo, historial, updated_at)
  values (v_r.id, v_r.negocio_id, auth.uid(), v_motivo,
          jsonb_build_array(jsonb_build_object('tipo', 'anulacion', 'motivo', v_motivo, 'por', auth.uid(), 'cuando', now())), now())
  on conflict (requisito_id) do update set
    anulado_por = excluded.anulado_por,
    anulado_motivo = excluded.anulado_motivo,
    historial = i.historial || excluded.historial,
    updated_at = now();
end;
$$;
alter function public.corregir_requisito_aplicado(uuid, date, text, text, text) owner to peludesk_definer;
alter function public.anular_requisito_aplicado(uuid, text) owner to peludesk_definer;
revoke execute on function public.corregir_requisito_aplicado(uuid, date, text, text, text) from public, anon;
revoke execute on function public.anular_requisito_aplicado(uuid, text) from public, anon;
grant execute on function public.corregir_requisito_aplicado(uuid, date, text, text, text) to authenticated, service_role;
grant execute on function public.anular_requisito_aplicado(uuid, text) to authenticated, service_role;

-- Reversa (no se corre sola): volver a agregar las columnas y copiarlas desde perros_bajas / requisitos_sanitarios_internos.
