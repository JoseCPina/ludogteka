-- Tiempo del panel, tercera vuelta (1 de noviembre de 2026; docs/rendimiento-panel.md). Solo funciones; nada de datos.
--
-- 1. La sesión del personal en UN viaje. `obtenerSesionConRol` pedía, después de Auth, `acceso_de_sesion`,
--    `mi_cliente_id` y `nombre_de_persona` (tres viajes en paralelo, pero una tanda más después de Auth). `sesion_actual()`
--    los junta, y la app la pide A LA VEZ que Auth (las dos solo dependen del JWT): una tanda en vez de dos, en TODAS las
--    pantallas del personal y del portal. Mismos valores que las tres funciones (comprobado en desarrollo).
create or replace function public.sesion_actual()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.acceso_de_sesion()
    || jsonb_build_object(
         'cliente_id', public.mi_cliente_id(),
         'nombre', public.nombre_de_persona(auth.uid(), null)
       );
$$;
revoke execute on function public.sesion_actual() from public, anon;
grant execute on function public.sesion_actual() to authenticated, service_role;

-- 2. `cuentas_abiertas`: la segunda rama de `candidatas` (una cuenta creada en la ventana SIN estancia ni cita, es decir,
--    un cargo suelto, una venta, un pase o un ajuste) recorría TODAS las reservas creadas en la ventana y las descartaba
--    con dos anti-joins. Como una cuenta sin ninguna línea tiene total 0 y saldo ≤ 0 y `con_saldo` la descarta de
--    todos modos, se le exige primero tener alguna línea (cargo, venta de mostrador, pase o corrección de precio: los
--    mismos orígenes de `lineas`), que son pocas y van por índice. El resultado es idéntico (comprobado en desarrollo,
--    cuenta por cuenta, con 30 y 120 días en dos negocios). Se parcha sobre la definición viva: el resto no cambia.
do $$
declare
  v_def text;
  v_viejo text := E'      and r.created_at >= v.desde and r.created_at < v.hasta\n'
               || E'      and not exists (select 1 from public.cuentas_canceladas cc where cc.reserva_id = r.id)\n'
               || E'      and not exists (select 1 from public.estancias e where e.reserva_id = r.id and e.deleted_at is null and e.estado not in (''cancelada'', ''no_llego''))\n';
  v_nuevo text := E'      and r.created_at >= v.desde and r.created_at < v.hasta\n'
               || E'      -- Solo las cuentas con alguna línea suelta (sin línea no hay saldo que mostrar): pocas, por índice.\n'
               || E'      and (exists (select 1 from public.cargos_aplicados ca where ca.reserva_id = r.id and ca.deleted_at is null and ca.cancelado = false)\n'
               || E'           or exists (select 1 from public.ventas_mostrador vm where vm.reserva_id = r.id and vm.deleted_at is null and not vm.cancelado)\n'
               || E'           or exists (select 1 from public.bonos_clientes bc where bc.reserva_id = r.id and bc.deleted_at is null)\n'
               || E'           or exists (select 1 from public.cuenta_ajustes_precio aj where aj.reserva_id = r.id and aj.deleted_at is null))\n'
               || E'      and not exists (select 1 from public.cuentas_canceladas cc where cc.reserva_id = r.id)\n'
               || E'      and not exists (select 1 from public.estancias e where e.reserva_id = r.id and e.deleted_at is null and e.estado not in (''cancelada'', ''no_llego''))\n';
begin
  select replace(pg_get_functiondef('public.cuentas_abiertas(integer)'::regprocedure), chr(13), '') into v_def;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'cuentas_abiertas cambió: no encuentro la segunda rama de candidatas tal cual.';
  end if;
  v_def := replace(v_def, v_viejo, v_nuevo);
  execute v_def;
end $$;
