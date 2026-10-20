// Borrar negocios de DESARROLLO sin las guardas de producción (lo usan scripts/db/limpiar-dev.mjs
// y scripts/lib/limpieza-dev.mjs). Misma lógica que plataforma_eliminar_negocio: Vault, bitácora
// desligada, tablas con negocio_id en pasadas (apagando los disparadores de usuario solo de la tabla
// que lo exige) y al final la fila de negocios. Se corre por la API de gestión de desarrollo.

/** Negocios que se quedan. Uno nuevo que una auditoría reuse por slug va aquí. */
export const CONSERVAR = [
  "ludogteka", // el negocio #1 (datos de desarrollo de siempre)
  "huellitas", // negocio de prueba de casi todas las auditorías
  "patitasyco", // el demo vigente
  "qa-pruebas", // la QA externa
  "modulos-prueba", // modulos.mjs
  "patitas-pruebas-b", // cancelar-cuenta-dev.mjs
  "cobro-auditoria-a", // cobro.mjs
  "cobro-auditoria-b",
];

export const lit = (a) => `array[${a.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(",")}]`;

export const sqlBorrarNegocios = (lote) => `do $$
declare
  v_ids uuid[] := ${lit(lote)}::uuid[];
  v_pend text[]; v_sin text[] := '{}'; v_t text; v_prog boolean; v_n bigint;
begin
  delete from vault.secrets where id in (select secreto_id from public.integraciones_cobro where negocio_id = any(v_ids) and secreto_id is not null)
    or id in (select llave_secreto_id from public.cfdi_config_negocio where negocio_id = any(v_ids) and llave_secreto_id is not null)
    or exists (select 1 from unnest(v_ids) x where name like 'peludesk:' || x::text || ':%');
  update public.plataforma_eventos set negocio_id = null where negocio_id = any(v_ids);
  update public.wa_hilos set negocio_afectado = null where negocio_afectado = any(v_ids);
  update public.eventos_stripe set negocio_afectado = null where negocio_afectado = any(v_ids);
  delete from public.negocios_slugs_anteriores where negocio_destino = any(v_ids);
  alter table public.vet_citas disable trigger user;
  update public.vet_citas set consulta_id = null where negocio_id = any(v_ids) and consulta_id is not null;
  alter table public.vet_citas enable trigger user;
  v_pend := array(select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'negocios'
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped));
  while cardinality(v_pend) > 0 loop
    v_prog := false;
    foreach v_t in array v_pend loop
      begin
        execute format('delete from public.%I where negocio_id = any($1)', v_t) using v_ids;
        v_pend := array_remove(v_pend, v_t); v_prog := true;
      exception
        when foreign_key_violation then null;
        when others then
          if v_t = any(v_sin) then raise; end if;
          execute format('alter table public.%I disable trigger user', v_t);
          v_sin := v_sin || v_t; v_prog := true;
      end;
    end loop;
    if not v_prog then raise exception 'dependencias entre tablas: %', array_to_string(v_pend, ', '); end if;
  end loop;
  alter table public.negocios disable trigger user;
  delete from public.negocios where id = any(v_ids);
  alter table public.negocios enable trigger user;
  foreach v_t in array v_sin loop execute format('alter table public.%I enable trigger user', v_t); end loop;
end $$`;
