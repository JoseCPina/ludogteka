-- Plan único de PeluDesk (22 de octubre de 2026): $649 al mes + IVA, sin costo
-- inicial, con todos los módulos (Veterinaria, Hotel y guardería, Estética,
-- inventario, empleados, gastos, reportes, portal y página web) para todos.
--
-- Los planes viven en la base (nunca en el código): el plan «completo» (su
-- clave se conserva: la prueba y los negocios ya apuntan a él) pasa a llamarse
-- «PeluDesk» con el precio y los módulos nuevos; Estética, Guardería y hotel y
-- el complemento de página web se dejan inactivos (no se borran: quedan para
-- el historial). El anual sigue siendo diez mensualidades.
--
-- Los precios de Stripe NO se tocan aquí: al cobrar, la app crea el precio nuevo
-- con la misma lookup key (el anterior se queda como estaba) y nadie con una
-- suscripción vigente cambia de importe hasta su siguiente cargo. A la fecha
-- no hay suscripciones de pago.

do $$
declare
  v_modulos text[];
  v_antes jsonb;
begin
  select coalesce(array_agg(m.clave order by m.orden), '{}'::text[]) into v_modulos
  from public.modulos m
  where m.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object('clave', p.clave, 'activo', p.activo, 'precio_mensual', p.precio_mensual, 'precio_anual', p.precio_anual, 'modulos', p.modulos) order by p.orden), '[]'::jsonb)
    into v_antes
  from public.planes p where p.deleted_at is null;

  update public.planes
     set nombre = 'PeluDesk',
         descripcion = 'Todo incluido: Veterinaria, Hotel y guardería, Estética y página web. Sin costo inicial.',
         tipo = 'plan',
         precio_mensual = 649,
         precio_anual = 6490,
         modulos = v_modulos,
         orden = 1,
         activo = true
   where clave = 'completo' and deleted_at is null;
  if not found then
    raise exception 'No existe el plan «completo» que se convierte en el plan único.';
  end if;

  update public.planes
     set activo = false
   where clave in ('estetica', 'guarderia_hotel', 'pagina_web') and deleted_at is null;

  insert into public.plataforma_eventos (accion, motivo, detalle)
  values ('editar_plan', 'Plan único: $649 al mes + IVA con todos los módulos, sin costo inicial',
          jsonb_build_object('antes', v_antes, 'despues_modulos', to_jsonb(v_modulos)));
end;
$$;

-- Quien ya apuntaba a un plan que se retiró pasa al plan único (cambia su
-- nombre en pantalla; sus módulos y su cobro no cambian).
update public.negocios n
   set plan_id = (select p.id from public.planes p where p.clave = 'completo' and p.deleted_at is null)
 where n.plan_id in (select p.id from public.planes p where p.clave in ('estetica', 'guarderia_hotel', 'pagina_web'));

-- El registro de la prueba ya no sugiere un plan por servicios: hay uno solo.
do $$
declare
  v_def text;
  v_nuevo text;
  v_viejo text := $viejo$  v_plan := case
    when v_vet then 'completo'
    when 'estetica' = any(v_servicios) and not v_estancias then 'estetica'
    when v_estancias and not ('estetica' = any(v_servicios)) then 'guarderia_hotel'
    else 'completo' end;$viejo$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'registrar_negocio_prueba';
  if v_def is null then raise exception 'No se encontró registrar_negocio_prueba.'; end if;
  v_nuevo := replace(v_def, v_viejo, E'  v_plan := ''completo'';');
  if v_nuevo = v_def then raise exception 'registrar_negocio_prueba cambió: no se encontró la selección de plan por servicios.'; end if;
  execute v_nuevo;
end;
$$;
