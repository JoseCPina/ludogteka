-- Fase 9 Bloque A: bitácora diaria — fotos y notas del día a día del
-- perro, visibles para el dueño en su portal. Ledger append-only, mismo
-- criterio que movimientos_inventario/movimientos_bono: una nota mal
-- escrita se corrige con una entrada nueva, nunca editando la anterior
-- — importante sobre todo para 'incidencia', donde el historial no debe
-- poder reescribirse después.
--
-- Los TRES roles de staff escriben (no solo admin/recepción): es
-- observación operativa del día a día (quién estuvo con el perro, qué
-- pasó), mismo criterio que peso/alertas/alergias en Fase 2 y
-- consumo/merma de inventario en Fase 7 — no es un dato clínico
-- prescrito como vacunas o medicamentos, que sí se quedan solo
-- admin/recepción.
--
-- estancia_id es opcional: la mayoría de las entradas van a estar
-- ligadas a una estancia de guardería/hotel en curso, pero también debe
-- poder registrarse una nota suelta (ej. una incidencia durante una
-- cita de estética que no tiene estancia propia).
create table public.bitacora_entradas (
  id uuid primary key default gen_random_uuid(),
  perro_id uuid not null references public.perros(id),
  estancia_id uuid references public.estancias(id),
  fecha date not null default public.fecha_negocio(),
  tipo text not null default 'actualizacion' check (tipo in ('actualizacion', 'incidencia')),
  nota text,
  foto_path text,

  -- Aviso por WhatsApp: mejor esfuerzo, no confirmación de entrega — un
  -- link wa.me abre WhatsApp con el mensaje ya escrito, pero quien lo
  -- manda es el staff con su propio clic de "Enviar". Estas dos
  -- columnas registran que SE INTENTÓ avisar, con quién y cuándo, no
  -- que el dueño ya lo vio.
  notificado_whatsapp_at timestamptz,
  notificado_por uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check (nota is not null or foto_path is not null),
  check (tipo <> 'incidencia' or nota is not null)
);

create trigger set_updated_at before insert or update on public.bitacora_entradas
  for each row execute function public.set_updated_at();

create index bitacora_entradas_perro_id_idx on public.bitacora_entradas (perro_id);

alter table public.bitacora_entradas enable row level security;

create policy bitacora_entradas_select_staff on public.bitacora_entradas
  for select to authenticated
  using (public.is_staff());

create policy bitacora_entradas_select_propio on public.bitacora_entradas
  for select to authenticated
  using (
    exists (
      select 1 from public.perros p
      where p.id = bitacora_entradas.perro_id
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

create policy bitacora_entradas_insert_staff on public.bitacora_entradas
  for insert to authenticated
  with check (public.is_staff());

-- Sin política de UPDATE para authenticated: notificado_whatsapp_at /
-- notificado_por solo se llenan vía marcar_bitacora_notificada()
-- (SECURITY DEFINER, abajo) — nunca un UPDATE directo desde la
-- pantalla, ni siquiera para esas dos columnas.
create or replace function public.marcar_bitacora_notificada(p_entrada_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Solo personal del negocio puede marcar un aviso enviado.';
  end if;

  update public.bitacora_entradas
  set notificado_whatsapp_at = now(), notificado_por = auth.uid()
  where id = p_entrada_id;

  if not found then
    raise exception 'Entrada de bitácora no encontrada.';
  end if;
end;
$$;

revoke execute on function public.marcar_bitacora_notificada(uuid) from public;
grant execute on function public.marcar_bitacora_notificada(uuid) to authenticated;

-- Storage: las fotos de bitácora comparten el bucket perros-archivos
-- (misma regla de privacidad que perfil/requisitos/contrato), en
-- {cliente_id}/{perro_id}/bitacora/{entrada_id}.jpg. La política de
-- INSERT existente (perros_archivos_insert_staff) es solo
-- admin/recepción — insuficiente aquí, así que se agrega una política
-- nueva específica para la subcarpeta bitacora/ que sí incluye
-- estética, sin tocar ni aflojar la política existente de
-- perfil/requisitos.
create policy perros_archivos_insert_bitacora on storage.objects
for insert to authenticated
with check (
  bucket_id = 'perros-archivos'
  and (storage.foldername(name))[3] = 'bitacora'
  and public.is_staff()
  and exists (
    select 1 from public.perros p
    where p.id::text = (storage.foldername(name))[2]
  )
);
