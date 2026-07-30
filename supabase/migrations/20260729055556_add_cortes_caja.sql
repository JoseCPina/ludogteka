-- Corte de caja: el arqueo de un turno cerrado. explicacion_diferencias
-- es obligatoria (lo exige cerrar_turno, migración siguiente) en cuanto
-- CUALQUIER método salga con diferencia — "las diferencias se registran
-- con su monto y explicación, nunca se ajustan en silencio". notas_cierre
-- vive en turnos_caja (nota general de cierre); esto es específicamente
-- la explicación de la discrepancia encontrada.
create table public.cortes_caja (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null unique references public.turnos_caja(id),
  explicacion_diferencias text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.cortes_caja
  for each row execute function public.set_updated_at();

alter table public.cortes_caja enable row level security;

create policy cortes_caja_select on public.cortes_caja
  for select to authenticated
  using (
    public.is_admin()
    or turno_id in (select id from public.turnos_caja where abierto_por = auth.uid())
  );

-- Conteo CIEGO por método: lo que el cajero contó/reportó (conteo) se
-- captura antes de que la pantalla le muestre lo que el sistema esperaba
-- — ese orden vive en cerrar_turno() (la función nunca revela esperado
-- hasta que ya recibió el conteo), no aquí. esperado y diferencia los
-- resuelve el propio RPC a partir del ledger (cobros/devoluciones/
-- retiros de ese turno), nunca se capturan a mano — así nadie puede
-- "ajustar" una diferencia con solo escribir el número que cuadre.
create table public.corte_metodos (
  id uuid primary key default gen_random_uuid(),
  corte_id uuid not null references public.cortes_caja(id),
  metodo text not null check (metodo in ('efectivo', 'terminal', 'transferencia')),
  conteo numeric(10, 2) not null check (conteo >= 0),
  esperado numeric(10, 2) not null,
  diferencia numeric(10, 2) not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  unique (corte_id, metodo)
);

create trigger set_updated_at before insert or update on public.corte_metodos
  for each row execute function public.set_updated_at();

create index corte_metodos_corte_id_idx on public.corte_metodos (corte_id);

alter table public.corte_metodos enable row level security;

create policy corte_metodos_select on public.corte_metodos
  for select to authenticated
  using (
    public.is_admin()
    or corte_id in (
      select cc.id from public.cortes_caja cc
      join public.turnos_caja tc on tc.id = cc.turno_id
      where tc.abierto_por = auth.uid()
    )
  );

-- Sin política de INSERT/UPDATE para authenticated en ninguna de las dos:
-- la única puerta es cerrar_turno() (SECURITY DEFINER, migración
-- siguiente).
