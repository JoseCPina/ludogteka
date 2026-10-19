-- QA S15 (19 de octubre de 2026): cancelar una reserva de guardería u hotel pide un motivo OPCIONAL, igual que una
-- cita de estética, y queda en la bitácora: quién, cuándo y por qué. La cancelación sigue siendo el UPDATE de siempre
-- a `estado = 'cancelada'` (sus disparadores devuelven el pase y liberan el cupo); el motivo viaja en la misma fila y
-- el registro de ediciones (registro_ediciones, de la migración 20261114000000) lo anota junto con el cambio de estado.

alter table public.estancias
  add column if not exists motivo_cancelacion text,
  add column if not exists cancelada_por uuid references auth.users(id) on delete set null,
  add column if not exists cancelada_at timestamptz;

alter table public.estancias
  drop constraint if exists estancias_motivo_cancelacion_largo;
alter table public.estancias
  add constraint estancias_motivo_cancelacion_largo check (motivo_cancelacion is null or char_length(motivo_cancelacion) <= 500);

-- Quién y cuándo los pone la base, nunca la pantalla. Un motivo solo se guarda junto con la cancelación.
create or replace function public.estancias_marcar_cancelacion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado = 'cancelada' and old.estado is distinct from 'cancelada' then
    new.cancelada_at := now();
    new.cancelada_por := coalesce(auth.uid(), new.cancelada_por);
    new.motivo_cancelacion := nullif(btrim(coalesce(new.motivo_cancelacion, '')), '');
  elsif new.estado is distinct from 'cancelada' then
    new.motivo_cancelacion := old.motivo_cancelacion;
    new.cancelada_at := old.cancelada_at;
    new.cancelada_por := old.cancelada_por;
  else
    -- Ya estaba cancelada: lo de la cancelación no se reescribe.
    new.motivo_cancelacion := old.motivo_cancelacion;
    new.cancelada_at := old.cancelada_at;
    new.cancelada_por := old.cancelada_por;
  end if;
  return new;
end;
$$;

revoke execute on function public.estancias_marcar_cancelacion() from public, anon;
grant execute on function public.estancias_marcar_cancelacion() to authenticated, service_role;

drop trigger if exists estancias_marcar_cancelacion on public.estancias;
create trigger estancias_marcar_cancelacion
  before update of estado, motivo_cancelacion, cancelada_at, cancelada_por on public.estancias
  for each row execute function public.estancias_marcar_cancelacion();
