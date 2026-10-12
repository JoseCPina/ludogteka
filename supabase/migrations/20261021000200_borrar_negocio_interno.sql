-- Un negocio INTERNO de pruebas (p. ej. la «Clínica Demo PeluDesk») se puede borrar y volver a sembrar desde la
-- plataforma. Antes `plataforma_negocio_a_borrar` lo negaba por estar exento de cobro. Siguen sin poder borrarse:
-- el demo, Ludogteka, un negocio no interno exento y cualquier negocio con cobros reales (pagos de suscripción,
-- cobros con terminal o link, suscripción viva): esas guardas no cambian.
-- Reversa: restaurar la función de 20261005120000.
do $$
declare
  v_def text;
begin
  v_def := replace(pg_get_functiondef('public.plataforma_negocio_a_borrar(uuid)'::regprocedure), E'\r', '');
  v_def := replace(v_def, 'n.cobro_exento, n.deleted_at into v_neg', 'n.cobro_exento, n.interno, n.deleted_at into v_neg');
  v_def := replace(v_def, 'if v_neg.cobro_exento or v_neg.slug = ''ludogteka'' then', 'if (v_neg.cobro_exento and not v_neg.interno) or v_neg.slug = ''ludogteka'' then');
  v_def := replace(v_def, 'if not (v_neg.plan = ''prueba'' or not v_neg.activo) then', 'if not (v_neg.plan = ''prueba'' or not v_neg.activo or v_neg.interno) then');
  if position('and not v_neg.interno' in v_def) = 0 or position('or v_neg.interno' in v_def) = 0 or position('n.interno, n.deleted_at' in v_def) = 0 then
    raise exception 'No se pudo parchar plataforma_negocio_a_borrar: cambió su texto.';
  end if;
  execute v_def;
end $$;
