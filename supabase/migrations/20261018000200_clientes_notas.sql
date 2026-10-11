-- Notas del cliente: texto libre del negocio, solo para el personal.
-- El importador ya traía el mapeo «Notas del dueño» pero avisaba que no tenía dónde guardarlas.

alter table public.clientes add column if not exists notas text;
alter table public.clientes drop constraint if exists clientes_notas_largo;
alter table public.clientes add constraint clientes_notas_largo check (notas is null or char_length(notas) <= 2000);

-- Parche de las dos funciones del importador (sin reescribirlas completas).
do $$
declare
  v_def text;
  v_nuevo text;
  r record;
begin
  -- importacion_procesar_fila
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'importacion_procesar_fila';
  v_nuevo := v_def;

  v_nuevo := replace(v_nuevo, 'v_nombre text; v_email text; v_dir text;', 'v_nombre text; v_email text; v_dir text; v_cnotas text;');
  v_nuevo := replace(v_nuevo,
    E'v_dir := nullif(btrim(coalesce(d->>''c_direccion'', '''')), '''');',
    E'v_dir := nullif(btrim(coalesce(d->>''c_direccion'', '''')), '''');\n  v_cnotas := nullif(left(btrim(coalesce(d->>''c_notas'', '''')), 500), '''');');
  v_nuevo := replace(v_nuevo,
    'insert into public.clientes (nombre, telefono, email, direccion)
    values (v_nombre, public.importacion_telefono(d->>''c_telefono''), v_email, v_dir)',
    'insert into public.clientes (nombre, telefono, email, direccion, notas)
    values (v_nombre, public.importacion_telefono(d->>''c_telefono''), v_email, v_dir, v_cnotas)');
  v_nuevo := replace(v_nuevo,
    E'      if v_cli_cambio then\n        update public.clientes c set',
    E'      if v_cnotas is not null and v_cnotas is distinct from rc.notas then v_cli_antes := v_cli_antes || jsonb_build_object(''notas'', rc.notas); v_cli_cambio := true; end if;\n      if v_cli_cambio then\n        update public.clientes c set');
  v_nuevo := replace(v_nuevo,
    'direccion = coalesce(v_dir, c.direccion)
        where c.id = rc.id;',
    'direccion = coalesce(v_dir, c.direccion),
          notas = coalesce(v_cnotas, c.notas)
        where c.id = rc.id;');
  v_nuevo := replace(v_nuevo,
    E'  if nullif(btrim(coalesce(d->>''c_notas'', '''')), '''') is not null then\n    v_avisos := array_append(v_avisos, ''Las notas del cliente no se guardaron: el sistema aún no tiene dónde.'');\n  end if;\n',
    '');

  if v_nuevo = v_def or position('v_cnotas' in v_nuevo) = 0
     or position('no se guardaron: el sistema' in v_nuevo) > 0
     or position('notas = coalesce(v_cnotas' in v_nuevo) = 0
     or position('direccion, notas)' in v_nuevo) = 0
     or position('rc.notas' in v_nuevo) = 0 then
    raise exception 'importacion_procesar_fila: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;

  -- importacion_deshacer
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'importacion_deshacer';
  v_nuevo := replace(v_def,
    'direccion = case when a ? ''direccion'' then a->>''direccion'' else c.direccion end',
    'direccion = case when a ? ''direccion'' then a->>''direccion'' else c.direccion end,
        notas = case when a ? ''notas'' then a->>''notas'' else c.notas end');
  if v_nuevo = v_def then
    raise exception 'importacion_deshacer: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;
end $$;

-- Las notas que quedaron en el historial de importaciones (filas aplicadas) pasan a la ficha.
update public.clientes c
set notas = n.nota
from (
  select distinct on (f.cliente_id) f.cliente_id, nullif(left(btrim(f.datos->>'c_notas'), 500), '') as nota
  from public.importacion_filas f
  where f.estado in ('creada', 'actualizada') and f.cliente_id is not null
    and nullif(btrim(coalesce(f.datos->>'c_notas', '')), '') is not null
  order by f.cliente_id, f.n desc
) n
where c.id = n.cliente_id and c.notas is null and c.deleted_at is null;
