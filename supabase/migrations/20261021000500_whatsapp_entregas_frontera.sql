-- Corrige el parche de la lista blanca de 20261021000400 en bases donde ya se había aplicado con el ancla vieja
-- (la tabla wa_entregas quedó fuera de `compartidas`). Idempotente.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('wa_entregas')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('wa_aprendido'), $a$, $b$('wa_aprendido'), ('wa_entregas'), $b$);
    if position($a$('wa_entregas')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar wa_entregas.';
    end if;
    execute v_def;
  end if;
end $$;
