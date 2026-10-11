-- Notas internas fuera del alcance del dueño (19 de octubre de 2026).
--
-- El dueño puede leer por la API las filas propias de clientes, perros y
-- contratos (la política de fila deja pasar la fila ENTERA): clientes.notas,
-- perros.notas_clinicas, perros.evaluacion_comportamiento_notas/_por y
-- contratos.regenerar_motivo/motivo_cancelacion eran legibles desde su sesión
-- aunque el portal no los mostrara. Una RLS no filtra columnas, y un revoke por
-- columna no sirve (staff y dueño son el mismo rol de Postgres), así que lo
-- interno vive en tablas propias que SOLO lee el personal del negocio:
--
--   clientes_notas_internas      → clientes.notas              (personal)
--   perros_notas_clinicas        → perros.notas_clinicas       (ficha clínica)
--   perros_evaluaciones          → evaluacion_comportamiento_notas/_por (personal)
--   contratos_internos           → regenerar_motivo, regenerar_marcado_at,
--                                  motivo_cancelacion          (personal)
--
-- Además, el dueño ya no lee pesos_registrados (el portal no la usa y trae
-- notas del personal). Los datos se MIGRAN antes de quitar las columnas.
--
-- Reversa: volver a crear las columnas y copiar de las tablas nuevas.

-- ── 1. Tablas ──────────────────────────────────────────────────────

create table public.clientes_notas_internas (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  notas text not null check (char_length(notas) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table public.perros_notas_clinicas (
  perro_id uuid primary key references public.perros(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  notas text not null check (char_length(notas) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table public.perros_evaluaciones (
  perro_id uuid primary key references public.perros(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  notas text check (notas is null or char_length(notas) <= 2000),
  por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table public.contratos_internos (
  contrato_id uuid primary key references public.contratos(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  regenerar_motivo text,
  regenerar_marcado_at timestamptz,
  motivo_cancelacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

do $$
declare
  t text;
begin
  foreach t in array array['clientes_notas_internas', 'perros_notas_clinicas', 'perros_evaluaciones', 'contratos_internos'] loop
    execute format('create index %I on public.%I (negocio_id)', t || '_negocio_idx', t);
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I as restrictive for all to authenticated
      using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
      with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))$p$, t || '_negocio', t);
    execute format($p$create policy %I on public.%I for all to peludesk_definer
      using (negocio_id = (select public.negocio_actual()))
      with check (negocio_id = (select public.negocio_actual()))$p$, t || '_negocio_definer', t);
    execute format($p$create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer
      with check ((select public.exigir_negocio_escribible()))$p$, t || '_escritura_ins', t);
    execute format($p$create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))$p$, t || '_escritura_upd', t);
    execute format($p$create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible()))$p$, t || '_escritura_del', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to peludesk_definer', t);
  end loop;
end $$;

-- Leer: SOLO personal del negocio (nunca el dueño ni la llave anónima).
-- Escribir: solo por las funciones de más abajo.
create policy clientes_notas_internas_select on public.clientes_notas_internas
  for select to authenticated using ((select public.is_staff()));
create policy perros_evaluaciones_select on public.perros_evaluaciones
  for select to authenticated using ((select public.is_staff()));
create policy contratos_internos_select on public.contratos_internos
  for select to authenticated using ((select public.is_staff()));
-- Las notas clínicas: quien edita la ficha clínica o puede leer el expediente.
create policy perros_notas_clinicas_select on public.perros_notas_clinicas
  for select to authenticated
  using ((select public.tiene_permiso('editar_ficha_clinica')) or (select public.vet_puede_leer()));


-- ── 2. Migrar lo que ya hay ────────────────────────────────────────

insert into public.clientes_notas_internas (cliente_id, negocio_id, notas)
select c.id, c.negocio_id, btrim(c.notas) from public.clientes c
where nullif(btrim(coalesce(c.notas, '')), '') is not null;

insert into public.perros_notas_clinicas (perro_id, negocio_id, notas)
select p.id, p.negocio_id, btrim(p.notas_clinicas) from public.perros p
where nullif(btrim(coalesce(p.notas_clinicas, '')), '') is not null;

insert into public.perros_evaluaciones (perro_id, negocio_id, notas, por)
select p.id, p.negocio_id, nullif(btrim(coalesce(p.evaluacion_comportamiento_notas, '')), ''), p.evaluacion_comportamiento_por
from public.perros p
where nullif(btrim(coalesce(p.evaluacion_comportamiento_notas, '')), '') is not null
   or p.evaluacion_comportamiento_por is not null;

insert into public.contratos_internos (contrato_id, negocio_id, regenerar_motivo, regenerar_marcado_at, motivo_cancelacion)
select c.id, c.negocio_id, c.regenerar_motivo, c.regenerar_marcado_at, c.motivo_cancelacion
from public.contratos c
where c.regenerar_motivo is not null or c.regenerar_marcado_at is not null or c.motivo_cancelacion is not null;

-- Después de migrar: solo una escritura NUEVA exige el módulo prendido.
create trigger exigir_modulo before insert or update on public.perros_notas_clinicas
  for each row execute function public.exigir_modulo_tabla('veterinaria');

-- ── 3. Funciones de escritura ──────────────────────────────────────

create or replace function public.cliente_notas_guardar(p_cliente uuid, p_notas text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_texto text := nullif(btrim(coalesce(p_notas, '')), '');
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden editar las notas internas del cliente.' using errcode = '42501';
  end if;
  if v_texto is not null and char_length(v_texto) > 2000 then
    raise exception 'Las notas internas llevan hasta 2,000 caracteres.';
  end if;
  if not exists (select 1 from public.clientes c where c.id = p_cliente and c.deleted_at is null) then
    raise exception 'Cliente no encontrado.';
  end if;
  if v_texto is null then
    delete from public.clientes_notas_internas where cliente_id = p_cliente;
  else
    insert into public.clientes_notas_internas (cliente_id, notas) values (p_cliente, v_texto)
    on conflict (cliente_id) do update set notas = excluded.notas;
  end if;
  -- El sello de "modificado" del cliente: el deshacer del importador lo usa.
  update public.clientes c set nombre = c.nombre where c.id = p_cliente;
end;
$$;
alter function public.cliente_notas_guardar(uuid, text) owner to peludesk_definer;
revoke execute on function public.cliente_notas_guardar(uuid, text) from public, anon;
grant execute on function public.cliente_notas_guardar(uuid, text) to authenticated, service_role;

create or replace function public.perro_notas_clinicas_guardar(p_perro uuid, p_notas text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_texto text := nullif(btrim(coalesce(p_notas, '')), '');
begin
  if not coalesce(public.tiene_permiso('editar_ficha_clinica'), false) then
    raise exception 'La ficha clínica (especie, microchip, folio de registro y notas clínicas) la edita un admin o quien tenga el permiso «Editar ficha clínica», con el módulo Veterinaria prendido.'
      using errcode = '42501';
  end if;
  if v_texto is not null and char_length(v_texto) > 4000 then
    raise exception 'Las notas clínicas llevan hasta 4,000 caracteres.';
  end if;
  if not exists (select 1 from public.perros p where p.id = p_perro and p.deleted_at is null) then
    raise exception 'Mascota no encontrada.';
  end if;
  if v_texto is null then
    delete from public.perros_notas_clinicas where perro_id = p_perro;
  else
    insert into public.perros_notas_clinicas (perro_id, notas) values (p_perro, v_texto)
    on conflict (perro_id) do update set notas = excluded.notas;
  end if;
end;
$$;
alter function public.perro_notas_clinicas_guardar(uuid, text) owner to peludesk_definer;
revoke execute on function public.perro_notas_clinicas_guardar(uuid, text) from public, anon;
grant execute on function public.perro_notas_clinicas_guardar(uuid, text) to authenticated, service_role;

create or replace function public.marcar_evaluacion_comportamiento(p_perro_id uuid, p_fecha date, p_notas text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notas text := nullif(btrim(coalesce(p_notas, '')), '');
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden marcar la evaluación de comportamiento.';
  end if;
  if p_fecha is null then
    raise exception 'Indica la fecha en que se hizo la evaluación.';
  end if;
  if p_fecha > public.fecha_negocio() then
    raise exception 'La fecha de la evaluación no puede ser futura.';
  end if;

  update public.perros
  set evaluacion_comportamiento_fecha = p_fecha
  where id = p_perro_id and deleted_at is null;

  if not found then
    raise exception 'Perro no encontrado.';
  end if;

  insert into public.perros_evaluaciones (perro_id, notas, por) values (p_perro_id, v_notas, auth.uid())
  on conflict (perro_id) do update set notas = excluded.notas, por = excluded.por;
end;
$$;

create or replace function public.quitar_evaluacion_comportamiento(p_perro_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin puede quitar una evaluación ya marcada.';
  end if;
  update public.perros
  set evaluacion_comportamiento_fecha = null
  where id = p_perro_id;
  delete from public.perros_evaluaciones where perro_id = p_perro_id;
end;
$$;

-- Pasar el motivo de un contrato a contratos_internos.
create or replace function public.cancelar_contrato(p_contrato_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden cancelar un contrato.';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo de la cancelación.';
  end if;

  select estado into v_estado from public.contratos where id = p_contrato_id;
  if v_estado is null then
    raise exception 'Contrato no encontrado.';
  end if;
  if v_estado = 'cancelado' then
    raise exception 'Este contrato ya está cancelado.';
  end if;

  update public.contratos
  set estado = 'cancelado'
  where id = p_contrato_id;

  insert into public.contratos_internos (contrato_id, motivo_cancelacion) values (p_contrato_id, btrim(p_motivo))
  on conflict (contrato_id) do update set motivo_cancelacion = excluded.motivo_cancelacion;
end;
$$;

-- ── 4. Parches a funciones que leían las columnas viejas ───────────

do $$
declare
  v_def text;
  v_nuevo text;
begin
  -- proteger_ficha_clinica: las notas clínicas ya no son una columna de perros.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'proteger_ficha_clinica';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := v_def;
  v_nuevo := replace(v_nuevo, E'  new.notas_clinicas := nullif(btrim(coalesce(new.notas_clinicas, '''')), '''');\n', '');
  v_nuevo := replace(v_nuevo, E'\n              or new.folio_registro is not null or new.notas_clinicas is not null;', E'\n              or new.folio_registro is not null;');
  v_nuevo := replace(v_nuevo, E'\n              or new.notas_clinicas is distinct from old.notas_clinicas;', ';');
  v_nuevo := replace(v_nuevo, 'folio de registro y notas clínicas)', 'folio de registro)');
  if v_nuevo = v_def or position('notas_clinicas' in v_nuevo) > 0 then
    raise exception 'proteger_ficha_clinica: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;

  -- generar_contratos_de_paquete: el motivo del reemplazo va a contratos_internos.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'generar_contratos_de_paquete';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := replace(v_def,
    E'    update public.contratos c\n    set estado = ''cancelado'',\n        motivo_cancelacion = format(''Reemplazado por el contrato de la compra de %s del %s.'',\n          v_paquete, to_char(new.fecha_compra, ''DD/MM/YYYY''))\n    from public.plantillas_contrato pl\n    where pl.id = c.plantilla_id\n      and pl.tipo_contrato_id = v_tipo.id\n      and c.perro_id = new.perro_id\n      and c.estado = ''pendiente_firma'';',
    E'    with cancelados as (\n      update public.contratos c\n      set estado = ''cancelado''\n      from public.plantillas_contrato pl\n      where pl.id = c.plantilla_id\n        and pl.tipo_contrato_id = v_tipo.id\n        and c.perro_id = new.perro_id\n        and c.estado = ''pendiente_firma''\n      returning c.id\n    )\n    insert into public.contratos_internos (contrato_id, motivo_cancelacion)\n    select x.id, format(''Reemplazado por el contrato de la compra de %s del %s.'',\n      v_paquete, to_char(new.fecha_compra, ''DD/MM/YYYY''))\n    from cancelados x\n    on conflict (contrato_id) do update set motivo_cancelacion = excluded.motivo_cancelacion;');
  if v_nuevo = v_def or position('motivo_cancelacion = format' in v_nuevo) > 0 then
    raise exception 'generar_contratos_de_paquete: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;

  -- regenerar_contrato: lee el motivo de contratos_internos.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'regenerar_contrato';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := v_def;
  v_nuevo := replace(v_nuevo, 'select c.id, c.perro_id, c.created_at, c.regenerar_motivo, pl.tipo_contrato_id', 'select c.id, c.perro_id, c.created_at, ci.regenerar_motivo, pl.tipo_contrato_id');
  v_nuevo := replace(v_nuevo, E'  from public.contratos c\n  join public.plantillas_contrato pl on pl.id = c.plantilla_id\n  where c.id = p_contrato_id;', E'  from public.contratos c\n  join public.plantillas_contrato pl on pl.id = c.plantilla_id\n  left join public.contratos_internos ci on ci.contrato_id = c.id\n  where c.id = p_contrato_id;');
  if v_nuevo = v_def or position('ci.regenerar_motivo' in v_nuevo) = 0 or position('contratos_internos' in v_nuevo) = 0 then
    raise exception 'regenerar_contrato: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;

  -- Importador (clientes.notas → clientes_notas_internas).
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'importacion_procesar_fila';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := v_def;
  v_nuevo := replace(v_nuevo, 'v_cnotas text;', 'v_cnotas text; v_notas_previa text;');
  v_nuevo := replace(v_nuevo,
    E'insert into public.clientes (nombre, telefono, email, direccion, notas)\n    values (v_nombre, public.importacion_telefono(d->>''c_telefono''), v_email, v_dir, v_cnotas)\n    returning id into v_cli;',
    E'insert into public.clientes (nombre, telefono, email, direccion)\n    values (v_nombre, public.importacion_telefono(d->>''c_telefono''), v_email, v_dir)\n    returning id into v_cli;\n    if v_cnotas is not null then\n      insert into public.clientes_notas_internas (cliente_id, notas) values (v_cli, v_cnotas);\n    end if;');
  v_nuevo := replace(v_nuevo,
    E'      if v_cnotas is not null and v_cnotas is distinct from rc.notas then v_cli_antes := v_cli_antes || jsonb_build_object(''notas'', rc.notas); v_cli_cambio := true; end if;',
    E'      select n.notas into v_notas_previa from public.clientes_notas_internas n where n.cliente_id = rc.id;\n      if v_cnotas is not null and v_cnotas is distinct from v_notas_previa then v_cli_antes := v_cli_antes || jsonb_build_object(''notas'', v_notas_previa); v_cli_cambio := true; end if;');
  v_nuevo := replace(v_nuevo,
    E'direccion = coalesce(v_dir, c.direccion),\n          notas = coalesce(v_cnotas, c.notas)\n        where c.id = rc.id;',
    E'direccion = coalesce(v_dir, c.direccion)\n        where c.id = rc.id;\n        if v_cnotas is not null then\n          insert into public.clientes_notas_internas (cliente_id, notas) values (rc.id, v_cnotas)\n          on conflict (cliente_id) do update set notas = excluded.notas;\n        end if;');
  if v_nuevo = v_def or position('c.notas' in v_nuevo) > 0 or position('rc.notas' in v_nuevo) > 0
     or position('clientes_notas_internas' in v_nuevo) = 0 then
    raise exception 'importacion_procesar_fila: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'importacion_deshacer';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := replace(v_def,
    E'direccion = case when a ? ''direccion'' then a->>''direccion'' else c.direccion end,\n        notas = case when a ? ''notas'' then a->>''notas'' else c.notas end\n      where c.id = f.cliente_id\n      returning c.updated_at into v_nuevo;',
    E'direccion = case when a ? ''direccion'' then a->>''direccion'' else c.direccion end\n      where c.id = f.cliente_id\n      returning c.updated_at into v_nuevo;\n      if a ? ''notas'' then\n        if nullif(a->>''notas'', '''') is null then\n          delete from public.clientes_notas_internas where cliente_id = f.cliente_id;\n        else\n          insert into public.clientes_notas_internas (cliente_id, notas) values (f.cliente_id, a->>''notas'')\n          on conflict (cliente_id) do update set notas = excluded.notas;\n        end if;\n      end if;');
  if v_nuevo = v_def or position('c.notas' in v_nuevo) > 0 then
    raise exception 'importacion_deshacer: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;
end $$;

-- ── 5. La vista de contratos por atender (sin las columnas viejas) ──

create or replace view public.contratos_por_atender as
 SELECT
        CASE
            WHEN (c.estado = 'pendiente_firma'::text) THEN 'por_firmar'::text
            ELSE 'por_regenerar'::text
        END AS situacion,
    c.id AS contrato_id,
    c.perro_id,
    p.nombre AS perro_nombre,
    c.cliente_id,
    cl.nombre AS cliente_nombre,
    cl.telefono AS cliente_telefono,
    t.nombre AS tipo_nombre,
    nombre_paquete_de_bono(c.bono_cliente_id) AS paquete_nombre,
    c.created_at,
    c.fecha_firma,
    ci.regenerar_motivo,
    ci.regenerar_marcado_at,
        CASE
            WHEN (c.estado = 'pendiente_firma'::text) THEN c.created_at
            ELSE COALESCE(ci.regenerar_marcado_at, c.fecha_firma, c.created_at)
        END AS espera_desde
   FROM (((((contratos c
     JOIN perros p ON (((p.id = c.perro_id) AND (p.deleted_at IS NULL))))
     JOIN clientes cl ON ((cl.id = c.cliente_id)))
     JOIN plantillas_contrato pl ON ((pl.id = c.plantilla_id)))
     JOIN tipos_contrato t ON ((t.id = pl.tipo_contrato_id)))
     LEFT JOIN contratos_internos ci ON ((ci.contrato_id = c.id)))
  WHERE ((c.deleted_at IS NULL) AND ((c.estado = 'pendiente_firma'::text) OR ((ci.regenerar_motivo IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM (contratos c2
             JOIN plantillas_contrato pl2 ON ((pl2.id = c2.plantilla_id)))
          WHERE ((c2.perro_id = c.perro_id) AND (pl2.tipo_contrato_id = pl.tipo_contrato_id) AND (c2.created_at > c.created_at) AND (c2.estado <> 'cancelado'::text) AND (c2.deleted_at IS NULL))))))));
alter view public.contratos_por_atender set (security_invoker = true);

-- ── 6. Quitar las columnas viejas ──────────────────────────────────

alter table public.clientes drop column notas;
alter table public.perros drop column notas_clinicas;
alter table public.perros drop column evaluacion_comportamiento_notas;
alter table public.perros drop column evaluacion_comportamiento_por;
alter table public.contratos drop column regenerar_motivo;
alter table public.contratos drop column regenerar_marcado_at;
alter table public.contratos drop column motivo_cancelacion;

-- ── 7. El dueño ya no lee los pesos (el portal no los usa; traen notas del personal) ──

drop policy if exists pesos_registrados_select_propio on public.pesos_registrados;
