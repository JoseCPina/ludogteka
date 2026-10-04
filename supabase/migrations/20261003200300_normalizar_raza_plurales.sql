-- Plurales en -es de las razas más escritas: «pastores alemanes» → «pastor
-- aleman», «bulldogs franceses» → «bulldog frances». Solo con palabras de más
-- de 5 letras (así «Great Danes» sigue siendo «dane»). Gemela de normalizarRaza()
-- en src/lib/razas.ts: se cambian juntas.
create or replace function public.normalizar_raza(p_texto text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
  w text;
  salida text[] := '{}';
  vacias constant text[] := array['perro','perra','perros','perras','raza','razas','de','del','la','el','los','las','un','una','mi'];
begin
  v := lower(coalesce(p_texto, ''));
  v := translate(v, 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc');
  v := regexp_replace(v, '[^a-z0-9]+', ' ', 'g');
  foreach w in array regexp_split_to_array(btrim(v), ' +') loop
    if w = '' or w = any (vacias) then continue; end if;
    if length(w) > 5 and w ~ '(ores|eres|eses|anes)$' then
      w := left(w, length(w) - 2);
    elsif length(w) > 3 and w ~ '[^s]s$' then
      w := left(w, length(w) - 1);
    end if;
    salida := array_append(salida, w);
  end loop;
  return array_to_string(salida, ' ');
end;
$$;
