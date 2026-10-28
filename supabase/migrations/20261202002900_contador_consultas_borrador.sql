-- QA S41 (N139): el mosaico «Expediente clínico» de Veterinaria decía «0 sin firmar» con una consulta en borrador.
-- Leía `consultas_sin_firmar` de veterinaria_atencion(), que es el aviso del tablero: solo cuenta los borradores de MÁS
-- de un día y solo para quien puede firmar. El mosaico necesita los borradores que hay: `consultas_borrador` cuenta
-- todas las consultas en borrador del negocio (para quien lee el expediente), de la misma tabla y con el mismo criterio
-- (estado 'borrador', sin baja) que la línea de tiempo de cada mascota. El aviso del tablero sigue igual.
do $$
declare
  d text;
  nuevo text;
begin
  d := pg_get_functiondef('public.veterinaria_atencion()'::regprocedure);
  nuevo := replace(
    d,
    $x$    'consultas_sin_firmar', case when v_firmar then$x$,
    $x$    'consultas_borrador', case when coalesce(public.vet_puede_leer(), false) then
        (select count(*) from public.vet_consultas c where c.negocio_id = v_neg and c.deleted_at is null and c.estado = 'borrador') else 0 end,
    'consultas_sin_firmar', case when v_firmar then$x$
  );
  if nuevo = d then
    raise exception 'veterinaria_atencion: no encontré dónde agregar consultas_borrador';
  end if;
  execute nuevo;
end;
$$;
