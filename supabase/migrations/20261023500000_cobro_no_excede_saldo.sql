-- registrar_cobro valida el monto contra el saldo de la cuenta (la QA cobró $200
-- a una cuenta de $116 y quedó saldo −$84 «a favor», cobrable otra vez).
--  · Cuenta sin saldo por cobrar: no se cobra.
--  · Efectivo recibido de más es CAMBIO: se registra por el saldo y a la caja entra solo el saldo.
--  · Terminal, transferencia y tarjeta manual no pueden pasar del saldo (un saldo a favor
--    es una acción explícita aparte, nunca un accidente).
-- La propina no cuenta contra el saldo. Mismo criterio que registrar_cobro_grupo.
do $$
declare
  v_def text;
  v_nuevo text;
begin
  select replace(pg_get_functiondef('public.registrar_cobro(uuid,text,jsonb)'::regprocedure), chr(13), '') into v_def;

  v_nuevo := replace(v_def, E'  v_saldo numeric;\nbegin', E'  v_saldo numeric;\n  v_saldo_cuenta numeric;\n  v_exceso numeric;\n  v_quita numeric;\n  v_efectivo_total numeric;\n  v_resto_total numeric;\nbegin');
  if v_nuevo = v_def then raise exception 'registrar_cobro cambió (declaraciones).'; end if;
  v_def := v_nuevo;

  v_nuevo := replace(v_def, E'  insert into public.cobros (reserva_id, turno_id, notas, created_by)',
    E'  -- El monto contra el saldo (en la base, no solo en la pantalla).\n  select t.saldo into v_saldo_cuenta from public.cuenta_totales_reserva(p_reserva_id) t;\n  if coalesce(v_saldo_cuenta, 0) <= 0.005 then\n    raise exception ''Esta cuenta no tiene saldo por cobrar (saldo $%). No se puede cobrar de nuevo.'', coalesce(v_saldo_cuenta, 0);\n  end if;\n  select coalesce(sum(case when m ->> ''metodo'' = ''efectivo'' then coalesce((m ->> ''monto'')::numeric, 0) end), 0),\n         coalesce(sum(case when m ->> ''metodo'' <> ''efectivo'' then coalesce((m ->> ''monto'')::numeric, 0) end), 0)\n  into v_efectivo_total, v_resto_total\n  from jsonb_array_elements(p_metodos) m;\n  if v_resto_total > v_saldo_cuenta + 0.005 then\n    raise exception ''Con terminal, transferencia o tarjeta no se puede cobrar más que el saldo de la cuenta ($%). Solo el efectivo admite cambio.'', v_saldo_cuenta;\n  end if;\n  v_exceso := greatest(v_efectivo_total + v_resto_total - v_saldo_cuenta, 0);\n  if v_exceso < 0.005 then v_exceso := 0; end if;\n\n  insert into public.cobros (reserva_id, turno_id, notas, created_by)');
  if v_nuevo = v_def then raise exception 'registrar_cobro cambió (inicio).'; end if;
  v_def := v_nuevo;

  -- El efectivo de más es cambio: a la caja entra solo lo que cubre el saldo.
  v_nuevo := replace(v_def, E'    if v_propina < 0 then\n      raise exception ''La propina no puede ser negativa.'';\n    end if;\n',
    E'    if v_propina < 0 then\n      raise exception ''La propina no puede ser negativa.'';\n    end if;\n    if v_nombre_metodo = ''efectivo'' and v_exceso > 0 then\n      v_quita := least(v_exceso, v_monto);\n      v_monto := v_monto - v_quita;\n      v_exceso := v_exceso - v_quita;\n      if v_monto <= 0.005 then\n        continue;\n      end if;\n    end if;\n');
  if v_nuevo = v_def then raise exception 'registrar_cobro cambió (cambio en efectivo).'; end if;
  execute v_nuevo;
end $$;
