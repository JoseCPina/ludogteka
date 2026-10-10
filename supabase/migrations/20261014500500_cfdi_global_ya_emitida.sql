-- Facturación CFDI: un periodo que YA tiene su factura global vigente (o cancelándose)
-- deja de ofrecerse como «por emitir». Sin esto, un cobro que se registra con fecha
-- dentro de un periodo ya facturado (una corrección tardía) volvía a mostrar el periodo
-- como pendiente y la base lo rechazaba por duplicado (una global por periodo).
-- Esos cobros se facturan aparte, con los datos de quien los pida.
-- REVERSA: volver a crear cfdi_global_periodos() con la guardia de la migración 20261014500100.

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.cfdi_global_periodos()'::regprocedure) into v_def;
  if position('f.estado in (''vigente'', ''cancelacion_pendiente'')' in v_def) = 0 then
    v_def := replace(v_def, 'where pe.d2 < v_hoy',
      $r$where pe.d2 < v_hoy
    and not exists (
      select 1 from public.cfdi_facturas f
      where f.negocio_id = v_neg and f.tipo = 'global' and f.periodo_desde = pe.d1 and f.periodo_hasta = pe.d2
        and f.estado in ('vigente', 'cancelacion_pendiente') and f.deleted_at is null
    )$r$);
    if position('f.estado in (''vigente'', ''cancelacion_pendiente'')' in v_def) = 0 then
      raise exception 'cfdi_global_periodos cambió: no se pudo excluir los periodos ya emitidos.';
    end if;
    execute v_def;
  end if;
end $$;
