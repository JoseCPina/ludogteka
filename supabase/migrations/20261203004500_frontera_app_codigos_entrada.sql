-- app_codigos_entrada es de la persona, no de un negocio (como app_entradas): entra a la lista de tablas sin negocio de
-- auditoria_frontera. Solo la toca el servidor (migración 20261203004400).
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position('app_codigos_entrada' in v_def) = 0 then
    if position($a$('app_entradas')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no encuentro app_entradas en su lista.';
    end if;
    v_def := replace(v_def, $a$('app_entradas')$a$, $b$('app_entradas'), ('app_codigos_entrada')$b$);
    execute v_def;
  end if;
end $$;
