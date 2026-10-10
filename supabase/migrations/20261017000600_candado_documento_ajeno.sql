-- Veterinaria, Fase 4 · parte 7: el candado también rechaza un documento que no corresponde al
-- producto (p. ej. surtir un Grupo II «contra» el folio de otro producto): antes lo ignoraba.
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.lotes_movimientos_candado()'::regprocedure);
  v_def := replace(v_def,
    $a$  if v_doc = 'libre' or (v_doc = 'receta_simple' and v_tipo is distinct from 'receta') then
    return new;
  end if;$a$,
    $b$  if v_doc = 'libre' or (v_doc = 'receta_simple' and v_tipo is null) then
    return new;
  end if;
  if v_doc = 'receta_simple' and v_tipo <> 'receta' then
    raise exception 'Ese producto no se ampara con ese documento: solo una receta lo respalda.' using errcode = '42501';
  end if;$b$);
  if v_def not like '%solo una receta lo respalda%' then
    raise exception 'No se pudo parchar lotes_movimientos_candado: cambió su texto.';
  end if;
  execute v_def;
end $$;
