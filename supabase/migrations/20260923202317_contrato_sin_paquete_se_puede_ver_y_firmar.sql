-- Los contratos sin paquete se vuelven a poder ver y firmar
-- (23 de septiembre de 2026).
--
-- resolver_campos_de_contrato (migración 20260923155157) leía v_bono.nombre
-- aunque el contrato no viniera de un paquete. En PL/pgSQL un record que
-- nunca se asignó no es NULL: leerlo truena con 55000 'record "v_bono" is
-- not assigned yet'. Todo contrato sin bono_cliente_id (el general y el de
-- hotel, los que genera el alta) fallaba al generar la vista previa y al
-- firmar: en producción lo vio Ronith Navarrete al completar el alta de
-- guardería de Greta, como {"error":"No pudimos leer los datos del
-- expediente."} en crudo.
--
-- Copia exacta de la definición anterior; solo cambia cómo se decide si
-- hay paquete.

create or replace function public.resolver_campos_de_contrato(p_contrato_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_contrato record;
  v_bono record;
  v_hay_bono boolean := false;
  v_campos jsonb;
begin
  select c.id, c.perro_id, c.cliente_id, c.bono_cliente_id into v_contrato
  from public.contratos c where c.id = p_contrato_id;
  if not found then
    raise exception 'Contrato no encontrado.';
  end if;

  if not (
    coalesce(public.is_staff(), false)
    or exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid() and pr.cliente_id = v_contrato.cliente_id
    )
  ) then
    raise exception 'No tienes acceso a este contrato.';
  end if;

  v_campos := public.resolver_campos_contrato(v_contrato.perro_id);

  if v_contrato.bono_cliente_id is not null then
    select s.nombre, bc.ilimitado, bc.cantidad_total, bc.fecha_compra, bc.fecha_vencimiento
      into v_bono
    from public.bonos_clientes bc
    join public.servicios s on s.id = bc.servicio_id
    where bc.id = v_contrato.bono_cliente_id;
    v_hay_bono := found;
  end if;

  -- Sin paquete, v_bono nunca se asignó y leer v_bono.nombre truena con
  -- 'record "v_bono" is not assigned yet'. Por eso se pregunta a la
  -- bandera, no al record.
  if not v_hay_bono then
    return v_campos || jsonb_build_object(
      'paquete_guarderia', 'Sin paquete (pago por día)',
      'numero_day_pass', 'No aplica',
      'vigencia_inicio', 'No aplica',
      'vigencia_fin', 'No aplica'
    );
  end if;

  return v_campos || jsonb_build_object(
    'paquete_guarderia', v_bono.nombre,
    'numero_day_pass', case when v_bono.ilimitado
      then 'Ilimitado (mensualidad)'
      else v_bono.cantidad_total::text end,
    'vigencia_inicio', to_char(v_bono.fecha_compra, 'DD/MM/YYYY'),
    'vigencia_fin', coalesce(to_char(v_bono.fecha_vencimiento, 'DD/MM/YYYY'), 'Sin vencimiento')
  );
end;
$$;
