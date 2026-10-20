-- QA R23 (N85): los borradores ya iniciados desde una cita toman la fecha y hora de su cita (una consulta firmada
-- no se toca: es inmutable). Uno por uno y con el negocio de cada fila (los disparadores de módulo lo leen de la
-- petición), para que un negocio con Veterinaria apagada no detenga a los demás.
--
-- REVERSA: no aplica (la fecha anterior era la del momento en que se abrió el borrador, que ya no rige).
do $$
declare
  r record;
begin
  for r in
    select k.id, k.negocio_id, c.inicia_at from public.vet_consultas k
    join public.vet_citas c on c.id = k.cita_id and c.deleted_at is null
    where k.estado = 'borrador' and c.inicia_at is not null and k.atendida_at is distinct from c.inicia_at
  loop
    begin
      perform set_config('app.negocio_id', r.negocio_id::text, true);
      update public.vet_consultas set atendida_at = r.inicia_at where id = r.id;
    exception when others then
      raise notice 'No se pudo ajustar la consulta %: %', r.id, sqlerrm;
    end;
  end loop;
  perform set_config('app.negocio_id', '', true);
end $$;
