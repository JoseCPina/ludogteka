-- exigir_modulo_tabla(): leía new.cita_estetica_id / new.bono_cliente_id /
-- new.mp_orden_id directo, y en PL/pgSQL eso truena en las tablas que no
-- tienen esa columna aunque la condición no aplique ("record new has no
-- field"). Se lee la fila como JSON (lo encontró scripts/auditoria/modulos.mjs).
create or replace function public.exigir_modulo_tabla()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_modulo text := tg_argv[0];
  v_fila jsonb;
begin
  if coalesce(auth.role(), '') = 'service_role' or public.modulo_activo(v_modulo) then
    return new;
  end if;
  -- Lo que la app escribe sola por otra operación se salta, no la truena.
  if tg_op = 'INSERT' then
    v_fila := to_jsonb(new);
    if tg_table_name = 'movimientos_inventario' and v_fila ->> 'cita_estetica_id' is not null then return null; end if;
    if tg_table_name = 'contratos' and v_fila ->> 'bono_cliente_id' is not null then return null; end if;
    if tg_table_name = 'gastos' and (v_fila ->> 'mp_orden_id' is not null
       or (v_fila ->> 'recurrente_id' is not null and v_fila ->> 'estado' = 'pendiente')) then return null; end if;
    if tg_table_name = 'movimientos_bono' and v_fila ->> 'tipo' = 'devolucion' then return new; end if;
  end if;
  perform public.exigir_modulo(v_modulo);
  return new;
end;
$$;
