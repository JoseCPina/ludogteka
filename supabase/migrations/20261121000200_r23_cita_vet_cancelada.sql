-- QA R23 (N52): una cita clínica cancelada dice quién la canceló y cuándo (fecha y hora), como una reserva.
--
-- REVERSA: drop trigger vet_citas_marcar_cancelacion on public.vet_citas; drop function public.vet_citas_marcar_cancelacion();
-- alter table public.vet_citas drop column cancelada_por, drop column cancelada_at; y volver a poner vet_agenda.
alter table public.vet_citas
  add column if not exists cancelada_por uuid references auth.users(id) on delete set null,
  add column if not exists cancelada_at timestamptz;

create or replace function public.vet_citas_marcar_cancelacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado = 'cancelada' and old.estado is distinct from 'cancelada' then
    new.cancelada_at := coalesce(new.cancelada_at, now());
    new.cancelada_por := coalesce(new.cancelada_por, auth.uid());
  end if;
  return new;
end;
$$;
revoke execute on function public.vet_citas_marcar_cancelacion() from public, anon;
grant execute on function public.vet_citas_marcar_cancelacion() to authenticated, service_role;
drop trigger if exists vet_citas_marcar_cancelacion on public.vet_citas;
create trigger vet_citas_marcar_cancelacion before update on public.vet_citas
  for each row execute function public.vet_citas_marcar_cancelacion();

do $$
declare
  v_def text;
  v_nuevo text;
begin
  select replace(pg_get_functiondef('public.vet_agenda(date, date, uuid)'::regprocedure), chr(13), '') into v_def;
  if position('cancelada_at' in v_def) = 0 then
    v_nuevo := replace(v_def, '''cancelada_motivo'', c.cancelada_motivo,',
      '''cancelada_motivo'', c.cancelada_motivo, ''cancelada_at'', c.cancelada_at, ''cancelada_por'', case when c.cancelada_por is null then null else public.nombre_de_persona(c.cancelada_por) end,');
    if v_nuevo = v_def then raise exception 'vet_agenda cambió: no se pudo agregar quién canceló.'; end if;
    execute v_nuevo;
  end if;
end $$;
