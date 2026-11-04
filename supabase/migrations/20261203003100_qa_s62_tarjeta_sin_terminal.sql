-- QA S62 (UX).
-- ── UX: la tarjeta manual sin terminal vinculada no pregunta «¿Por qué no se cobró con la terminal?» ───────────
-- Sin terminal vinculada (terminal_manual_bloqueada() = false) el motivo es «sin_terminal» y no se pregunta; con
-- terminal vinculada sigue siendo obligatorio uno de los de siempre (y «sin_terminal» se rechaza).
alter table public.tarjetas_manuales drop constraint if exists tarjetas_manuales_motivo_check;
alter table public.tarjetas_manuales add constraint tarjetas_manuales_motivo_check check (motivo in ('terminal_no_responde', 'sin_senal', 'otra_terminal', 'otro', 'sin_terminal'));

do $$
declare
  f record;
  v_def text;
  v_n int := 0;
  v_viejo text := 'if v_motivo not in (''terminal_no_responde'', ''sin_senal'', ''otra_terminal'', ''otro'') then';
  v_nuevo text := 'if v_motivo = ''sin_terminal'' and coalesce(public.terminal_manual_bloqueada(), false) then
        raise exception ''Con la terminal vinculada, elige por qué no se cobró con ella.'';
      end if;
      if v_motivo not in (''terminal_no_responde'', ''sin_senal'', ''otra_terminal'', ''otro'', ''sin_terminal'') then';
begin
  for f in
    select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc like '%' || v_viejo || '%'
  loop
    select replace(pg_get_functiondef(f.firma), E'\r', '') into v_def;
    execute replace(v_def, v_viejo, v_nuevo);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    raise exception 'No encontré la validación del motivo de la tarjeta manual.';
  end if;
end $$;
