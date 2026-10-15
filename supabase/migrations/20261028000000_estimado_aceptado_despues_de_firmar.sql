-- Un estimado ligado a una consulta que ya se firmó y ya mandó sus cargos a Caja: al aceptarlo, lo que el estimado cubre
-- (procedimientos, medicamentos y servicios) NO se cobra dos veces. Antes el hueco era que la consulta ya había pasado
-- esos conceptos a la cuenta y el estimado los volvía a cargar.
--  * El estimado entra a LA MISMA cuenta que los cargos de la consulta (si no se canceló), no a una nueva.
--  * Cada cargo de la consulta cuyo tipo cubre una línea del estimado se cancela en la cuenta (queda su motivo y se ve
--    en la cuenta cancelada) y su línea de la consulta pasa a «cubierto por estimado».
--  * Todo queda en vet_estimado_compensaciones: qué cargo, de qué línea, cuánto, quién y si la cuenta ya tenía cobros
--    (entonces hay saldo a favor y se devuelve en Caja con la devolución de siempre). «Cobrar aparte» de la consulta se respeta.
-- Mismo mapa que antes de firmar: procedimiento→procedimiento, medicamento→insumo, consulta y vacuna→servicio.
-- REVERSA: restaurar vet_estimado_aceptar_interno de 20261016000300; la tabla puede quedarse.

create table public.vet_estimado_compensaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  estimado_id uuid not null references public.vet_estimados(id),
  consulta_id uuid not null references public.vet_consultas(id),
  consulta_cargo_id uuid not null references public.vet_consulta_cargos(id),
  cargo_id uuid not null references public.cargos_aplicados(id),
  reserva_id uuid not null references public.reservas(id),
  tipo text not null,
  concepto text not null,
  importe numeric(12,2) not null check (importe >= 0),
  cuenta_con_cobros boolean not null default false,
  motivo text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index vet_estimado_compensaciones_negocio_idx on public.vet_estimado_compensaciones (negocio_id);
create index vet_estimado_compensaciones_estimado_idx on public.vet_estimado_compensaciones (estimado_id);
create unique index vet_estimado_compensaciones_cargo_uq on public.vet_estimado_compensaciones (consulta_cargo_id) where deleted_at is null;
create trigger set_updated_at before insert or update on public.vet_estimado_compensaciones for each row execute function public.set_updated_at();
alter table public.vet_estimado_compensaciones enable row level security;
create policy vet_estimado_compensaciones_negocio on public.vet_estimado_compensaciones as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy vet_estimado_compensaciones_negocio_definer on public.vet_estimado_compensaciones for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual())) with check (negocio_id = (select public.negocio_actual()));
create policy vet_estimado_compensaciones_escritura_ins on public.vet_estimado_compensaciones as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy vet_estimado_compensaciones_escritura_upd on public.vet_estimado_compensaciones as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy vet_estimado_compensaciones_escritura_del on public.vet_estimado_compensaciones as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
-- Tabla clínica: no se lee por la API (las pantallas la piden por funciones que comprueban el permiso).
create policy vet_estimado_compensaciones_select on public.vet_estimado_compensaciones for select to authenticated using (false);
revoke all on public.vet_estimado_compensaciones from anon, authenticated;
grant select on public.vet_estimado_compensaciones to authenticated;
grant select, insert, update, delete on public.vet_estimado_compensaciones to peludesk_definer;
create trigger exigir_modulo before insert or update on public.vet_estimado_compensaciones for each row execute function public.exigir_modulo_tabla('veterinaria');

create or replace function public.vet_estimado_aceptar_interno(
  p_id uuid, p_via text, p_nombre text, p_firma text, p_ip text, p_ua text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
  v_perro record;
  v_reserva uuid;
  v_l record;
  v_x record;
  v_cargo uuid;
  v_importe numeric;
  v_n int := 0;
  v_comp int := 0;
  v_comp_total numeric := 0;
  v_con_cobros boolean := false;
  v_firmada boolean := false;
begin
  select e.* into v_e from public.vet_estimados e where e.id = p_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null for update;
  if v_e.id is null then
    raise exception 'Ese estimado no existe.';
  end if;
  if v_e.estado not in ('borrador', 'enviado') then
    raise exception 'Ese estimado ya no se puede aceptar (está %).', v_e.estado;
  end if;
  if v_e.vigente_hasta < public.fecha_negocio() then
    raise exception 'La vigencia de este estimado ya pasó.';
  end if;
  select p.nombre, p.cliente_id into v_perro from public.perros p where p.id = v_e.perro_id;
  -- Una consulta ya firmada que mandó cargos a Caja: el estimado entra a esa misma cuenta.
  if v_e.consulta_id is not null then
    select (c.estado = 'firmada') into v_firmada from public.vet_consultas c where c.id = v_e.consulta_id and c.negocio_id = public.negocio_actual();
    if coalesce(v_firmada, false) then
      select ca.reserva_id into v_reserva
        from public.vet_consulta_cargos x join public.cargos_aplicados ca on ca.id = x.cargo_id
       where x.consulta_id = v_e.consulta_id and x.estado in ('cobrado', 'cubierto') and x.deleted_at is null
         and not exists (select 1 from public.cuentas_canceladas cc where cc.reserva_id = ca.reserva_id)
       order by x.created_at limit 1;
    end if;
  end if;
  -- La cuenta: la de su hospitalización si está internada; si no, una cuenta nueva para el estimado.
  if v_reserva is null then
    select h.reserva_id into v_reserva from public.hospitalizaciones h
     where h.perro_id = v_e.perro_id and h.estado = 'ingresado' and h.deleted_at is null and h.negocio_id = public.negocio_actual() limit 1;
  end if;
  if v_reserva is null then
    insert into public.reservas (cliente_id, notas) values (v_e.cliente_id, 'Estimado: ' || v_e.titulo || ' — ' || v_perro.nombre) returning id into v_reserva;
  end if;
  for v_l in select * from public.vet_estimado_lineas l where l.estimado_id = p_id and l.deleted_at is null order by l.orden loop
    v_importe := round(v_l.cantidad * v_l.precio_min, 2);
    if v_importe > 0 then
      insert into public.cargos_aplicados (reserva_id, perro_id, servicio_id, cantidad, precio, descripcion)
      values (v_reserva, v_e.perro_id, public.vet_servicio_cargo_estimado(v_l.tipo), 1, v_importe,
              case when v_l.cantidad = 1 then v_l.descripcion else trim(trailing '.' from trim(trailing '0' from v_l.cantidad::text)) || ' × ' || v_l.descripcion end)
      returning id into v_cargo;
      update public.vet_estimado_lineas set cargo_id = v_cargo where id = v_l.id;
      v_n := v_n + 1;
    end if;
  end loop;
  -- Compensación: lo que la consulta ya cobró y el estimado cubre se cancela en la cuenta (con registro de qué se compensó).
  if coalesce(v_firmada, false) then
    for v_x in
      select x.id, x.tipo, x.concepto, x.cargo_id, ca.reserva_id, ca.cancelado, round(ca.precio * ca.cantidad, 2) as importe
        from public.vet_consulta_cargos x join public.cargos_aplicados ca on ca.id = x.cargo_id
       where x.consulta_id = v_e.consulta_id and x.estado = 'cobrado' and not x.cobrar_aparte and x.deleted_at is null
         and exists (select 1 from public.vet_estimado_lineas l
                      where l.estimado_id = p_id and l.deleted_at is null and round(l.cantidad * l.precio_min, 2) > 0
                        and l.tipo = case x.tipo when 'procedimiento' then 'procedimiento' when 'medicamento' then 'insumo' else 'servicio' end)
    loop
      v_con_cobros := exists (select 1 from public.cobros b where b.reserva_id = v_x.reserva_id and b.deleted_at is null);
      if not v_x.cancelado then
        update public.cargos_aplicados
           set cancelado = true, motivo_cancelacion = 'Cubierto por el estimado «' || v_e.titulo || '» aceptado después de firmar la consulta'
         where id = v_x.cargo_id;
      end if;
      update public.vet_consulta_cargos set estado = 'cubierto', cubierto_por = 'estimado', updated_at = now() where id = v_x.id;
      insert into public.vet_estimado_compensaciones (estimado_id, consulta_id, consulta_cargo_id, cargo_id, reserva_id, tipo, concepto, importe, cuenta_con_cobros, motivo)
      values (p_id, v_e.consulta_id, v_x.id, v_x.cargo_id, v_x.reserva_id, v_x.tipo, v_x.concepto, v_x.importe, v_con_cobros,
              'Ya estaba cubierto por el estimado aceptado después de firmar la consulta');
      v_comp := v_comp + 1;
      v_comp_total := v_comp_total + v_x.importe;
    end loop;
  end if;
  update public.vet_estimados set
    estado = 'aceptado', aceptado_at = now(), aceptado_via = p_via, aceptado_nombre = btrim(p_nombre), firma_png = nullif(p_firma, ''),
    aceptado_ip = p_ip, aceptado_ua = left(p_ua, 300), aceptado_por = case when p_via = 'mostrador' then auth.uid() else null end,
    reserva_id = v_reserva, hash_contenido = coalesce(hash_contenido, public.vet_estimado_hash(p_id))
   where id = p_id;
  return jsonb_build_object('id', p_id, 'reserva_id', v_reserva, 'cargos', v_n, 'compensados', v_comp, 'compensado_total', v_comp_total,
                            'cuenta_con_cobros', v_con_cobros);
end;
$$;
