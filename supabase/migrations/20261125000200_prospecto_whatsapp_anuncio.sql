-- El bot sabe si el prospecto llegó por un anuncio de Meta también en los mensajes siguientes al primero (21 de
-- octubre de 2026): prospecto_registrar_whatsapp devuelve además su fuente y si llegó por un anuncio.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.prospecto_registrar_whatsapp(text, text)'::regprocedure);
  if position($a$'por', v_por,$a$ in v_def) = 0 then
    raise exception 'prospecto_registrar_whatsapp cambió: no se encontró «''por'', v_por,».';
  end if;
  if position($a$'anuncio', $a$ in v_def) = 0 then
    v_def := replace(v_def, $a$'por', v_por,$a$, $b$'por', v_por, 'fuente', v.fuente, 'anuncio', (v.anuncio_at is not null),$b$);
    execute v_def;
  end if;
end $$;
revoke execute on function public.prospecto_registrar_whatsapp(text, text) from public, anon, authenticated;
grant execute on function public.prospecto_registrar_whatsapp(text, text) to service_role;
