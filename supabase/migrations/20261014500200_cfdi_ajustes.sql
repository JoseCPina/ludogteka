-- Facturación CFDI 4.0, ajustes de la parte 2: la tarea programada (factura global
-- automática y seguimiento de cancelaciones) corre sin sesión de persona, con la
-- secret key atada a UN negocio. Las dos funciones que arman y arrancan un timbrado
-- aceptan service_role además de quien tiene el permiso «Facturar».
-- REVERSA: volver a crear las dos funciones con la guardia de la migración 20261014500100.

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.cfdi_iniciar_timbrado(uuid)'::regprocedure) into v_def;
  if position('auth.role()' in v_def) = 0 then
    v_def := replace(v_def, $a$if not coalesce(public.tiene_permiso('facturar'), false) then$a$,
                            $b$if not (coalesce(public.tiene_permiso('facturar'), false) or coalesce(auth.role(), '') = 'service_role') then$b$);
    if position('auth.role()' in v_def) = 0 then
      raise exception 'cfdi_iniciar_timbrado cambió: no se pudo permitir a la tarea programada.';
    end if;
    execute v_def;
  end if;

  select pg_get_functiondef('public.cfdi_global_periodos()'::regprocedure) into v_def;
  if position('auth.role()' in v_def) = 0 then
    v_def := replace(v_def, $a$if not coalesce(public.tiene_permiso('facturar'), false) then$a$,
                            $b$if not (coalesce(public.tiene_permiso('facturar'), false) or coalesce(auth.role(), '') = 'service_role') then$b$);
    if position('auth.role()' in v_def) = 0 then
      raise exception 'cfdi_global_periodos cambió: no se pudo permitir a la tarea programada.';
    end if;
    execute v_def;
  end if;
end $$;

-- Pasos que la tarea programada necesita ver de todos los negocios con la secret key.
grant select on public.cfdi_facturas, public.cfdi_config_negocio to service_role;
