-- Fase 9 Bloque B: el registro de cada administración real ("¿ya le
-- tocó su pastilla de las 2pm hoy?"), que Fase 2 dejó a propósito para
-- este momento — perro_medicamentos.id se mantuvo estable desde
-- entonces exactamente para esto.
--
-- Ledger append-only, mismo criterio que bitacora_entradas/
-- movimientos_inventario: una dosis mal registrada se corrige con una
-- fila nueva, nunca editando la anterior — es un registro clínico, no
-- un estado que se pueda reescribir después.
--
-- Mismo alcance de escritura que perro_medicamentos (Fase 2): solo
-- admin/recepción — es dato clínico prescrito, no observación operativa
-- como la bitácora. Si el negocio pide que estética también pueda
-- registrar una dosis, es el mismo ajuste que ya quedó anotado como
-- pendiente de confirmar en perro_medicamentos.
--
-- omitida: a veces la dosis NO se da (el perro no estaba, se negó, el
-- dueño ya se lo dio antes de dejarlo) — hace falta poder registrar eso
-- explícitamente, no dejar un hueco silencioso que después se lea como
-- "se le olvidó a alguien". Si se omite, el motivo es obligatorio.
create table public.medicamentos_administrados (
  id uuid primary key default gen_random_uuid(),
  perro_medicamento_id uuid not null references public.perro_medicamentos(id),
  administrado_at timestamptz not null default now(),
  omitida boolean not null default false,
  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check (not omitida or (notas is not null and btrim(notas) <> ''))
);

create trigger set_updated_at before insert or update on public.medicamentos_administrados
  for each row execute function public.set_updated_at();

create index medicamentos_administrados_perro_medicamento_id_idx
  on public.medicamentos_administrados (perro_medicamento_id);

alter table public.medicamentos_administrados enable row level security;

create policy medicamentos_administrados_select_staff on public.medicamentos_administrados
  for select to authenticated
  using (public.is_staff());

-- Mismo criterio que perro_medicamentos_select_propio: el dueño sí ve
-- esto ("vacunas, peso y medicamentos sí los puede leer el dueño",
-- Fase 2) — transparencia de que a su perro sí se le está dando lo que
-- le prescribieron.
create policy medicamentos_administrados_select_propio on public.medicamentos_administrados
  for select to authenticated
  using (
    exists (
      select 1
      from public.perro_medicamentos pm
      join public.perros p on p.id = pm.perro_id
      where pm.id = medicamentos_administrados.perro_medicamento_id
        and (
          p.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
          or exists (
            select 1 from public.perro_accesos_compartidos pac
            where pac.perro_id = p.id
              and pac.deleted_at is null
              and pac.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
          )
        )
    )
  );

create policy medicamentos_administrados_insert_staff on public.medicamentos_administrados
  for insert to authenticated
  with check (public.current_rol() in ('admin', 'recepcion'));
