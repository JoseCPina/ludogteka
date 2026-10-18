-- Arreglo de 20261111000100: `servicios.incluye` es text[] y la primera versión de esa migración (aplicada solo en
-- desarrollo) insertaba un text. Si crear_negocio todavía trae esa forma, se corrige; si ya trae la buena (producción),
-- no hace nada.
do $$
declare
  v_def text;
begin
  select replace(pg_get_functiondef('public.crear_negocio'::regproc), chr(13), '') into v_def;
  if position('s.duracion, s.orden, s.incluye' in v_def) > 0 then
    v_def := replace(v_def, 's.duracion, s.orden, s.incluye', 's.duracion, s.orden, array[s.incluye]');
    execute v_def;
  end if;
end $$;
