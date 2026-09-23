-- El dueño puede adelantar el trámite sanitario desde el portal: sube la
-- foto de su carnet o comprobante con el tipo y la fecha de aplicación.
-- Queda como PROPUESTO, no como registro válido: no entra en
-- requisitos_sanitarios_aplicados (y por lo tanto no mueve la vista
-- perro_requisitos_sanitarios_estado ni levanta el bloqueo de reserva)
-- hasta que recepción lo confirme contra el documento. La regla de Fase 2
-- —solo admin/recepción registran aplicaciones— se conserva intacta: lo
-- que cambia es que ahora el dueño puede dejarles el comprobante listo.
--
-- Recepción los ve en una bandeja, con la foto y los datos que capturó el
-- dueño, y confirma o rechaza con motivo. Al confirmar, la aplicación
-- real se registra con la vigencia del catálogo (el trigger
-- fijar_vigencia_aplicada la congela igual que en un registro de
-- mostrador) y reutiliza la misma foto.
create table public.requisitos_sanitarios_propuestos (
  id uuid primary key default gen_random_uuid(),
  perro_id uuid not null references public.perros(id),
  tipo_requisito_id uuid not null references public.tipos_requisito_sanitario(id),
  fecha_aplicacion date not null,
  -- Vacuna: veterinario y clínica. Desparasitación: producto. Opcional,
  -- igual que en el registro de mostrador.
  detalle text,
  -- Sin foto no hay propuesta: es lo que recepción va a revisar.
  -- {cliente_id}/{perro_id}/requisitos-propuestos/{id}/comprobante.jpg
  comprobante_path text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmado', 'rechazado')),
  motivo_rechazo text,
  revisado_por uuid references auth.users(id) on delete set null,
  revisado_at timestamptz,
  -- La aplicación real que salió de esta propuesta, cuando se confirmó.
  requisito_aplicado_id uuid references public.requisitos_sanitarios_aplicados(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  -- Un rechazo siempre dice por qué; una confirmación siempre apunta a la
  -- aplicación que creó; lo pendiente no tiene ninguna de las dos.
  constraint requisitos_sanitarios_propuestos_coherente check (
    (estado = 'pendiente' and motivo_rechazo is null and requisito_aplicado_id is null and revisado_at is null)
    or (estado = 'rechazado' and motivo_rechazo is not null and requisito_aplicado_id is null and revisado_at is not null)
    or (estado = 'confirmado' and requisito_aplicado_id is not null and revisado_at is not null)
  )
);

comment on table public.requisitos_sanitarios_propuestos is
  'Comprobantes de vacuna/desparasitación que el dueño sube desde el portal. Propuesta, no registro: no cuenta para el estado sanitario ni levanta bloqueos hasta que recepción la confirme (revisar_requisito_propuesto).';

create trigger set_updated_at before insert or update on public.requisitos_sanitarios_propuestos
  for each row execute function public.set_updated_at();

-- Una sola propuesta pendiente por perro y tipo: mandar dos fotos del
-- mismo carnet solo duplica trabajo en la bandeja.
create unique index requisitos_sanitarios_propuestos_pendiente_unico
  on public.requisitos_sanitarios_propuestos (perro_id, tipo_requisito_id)
  where estado = 'pendiente' and deleted_at is null;

create index requisitos_sanitarios_propuestos_estado_idx
  on public.requisitos_sanitarios_propuestos (estado, created_at)
  where deleted_at is null;

alter table public.requisitos_sanitarios_propuestos enable row level security;

create policy requisitos_sanitarios_propuestos_select_staff on public.requisitos_sanitarios_propuestos
  for select to authenticated
  using (public.is_staff());

-- El dueño (o quien tenga acceso compartido) ve lo que se propuso para su
-- perro: le sirve para saber si ya lo revisaron y por qué se rechazó.
create policy requisitos_sanitarios_propuestos_select_propio on public.requisitos_sanitarios_propuestos
  for select to authenticated
  using (
    exists (
      select 1 from public.perros p
      where p.id = requisitos_sanitarios_propuestos.perro_id
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

-- Solo el dueño PRINCIPAL propone (un acceso compartido lee, no actúa —
-- mismo límite que la firma de contratos), y solo como pendiente: el
-- estado lo cambia recepción, nunca quien lo mandó.
create policy requisitos_sanitarios_propuestos_insert_propio on public.requisitos_sanitarios_propuestos
  for insert to authenticated
  with check (
    estado = 'pendiente'
    and created_by = auth.uid()
    and exists (
      select 1 from public.perros p
      where p.id = requisitos_sanitarios_propuestos.perro_id
        and p.deleted_at is null
        and p.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    )
  );

-- Recepción cambia el estado solo por la RPC de abajo; esta política es
-- para que esa RPC (y un admin) puedan escribir. El dueño no tiene UPDATE.
create policy requisitos_sanitarios_propuestos_update_staff on public.requisitos_sanitarios_propuestos
  for update to authenticated
  using (public.current_rol() in ('admin', 'recepcion'))
  with check (public.current_rol() in ('admin', 'recepcion'));

-- Confirmar o rechazar, en una transacción: confirmar inserta la
-- aplicación real y liga la propuesta; rechazar exige motivo. Lo que
-- capturó el dueño se registra tal cual — si algo no cuadra con el carnet,
-- se rechaza diciendo qué, y el dueño manda otro.
create or replace function public.revisar_requisito_propuesto(
  p_id uuid,
  p_confirmar boolean,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prop public.requisitos_sanitarios_propuestos%rowtype;
  v_aplicado_id uuid;
  v_vencimiento date;
  v_revisor text;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden revisar comprobantes.';
  end if;

  select * into v_prop
  from public.requisitos_sanitarios_propuestos
  where id = p_id and deleted_at is null
  for update;

  if not found then
    raise exception 'Ese comprobante no existe.';
  end if;
  if v_prop.estado <> 'pendiente' then
    raise exception 'Ese comprobante ya se revisó.';
  end if;

  select coalesce(nombre_completo, 'recepción') into v_revisor
  from public.profiles where id = auth.uid();

  if p_confirmar then
    insert into public.requisitos_sanitarios_aplicados (
      perro_id, tipo_requisito_id, fecha_aplicacion, detalle, comprobante_path, notas, created_by
    )
    values (
      v_prop.perro_id,
      v_prop.tipo_requisito_id,
      v_prop.fecha_aplicacion,
      v_prop.detalle,
      v_prop.comprobante_path,
      'Comprobante enviado por el dueño desde el portal el '
        || to_char(v_prop.created_at at time zone 'America/Mexico_City', 'DD/MM/YYYY')
        || '; confirmado contra el documento por ' || v_revisor || '.',
      auth.uid()
    )
    returning id, fecha_vencimiento into v_aplicado_id, v_vencimiento;

    update public.requisitos_sanitarios_propuestos
    set estado = 'confirmado',
        requisito_aplicado_id = v_aplicado_id,
        revisado_por = auth.uid(),
        revisado_at = now()
    where id = p_id;

    return jsonb_build_object(
      'estado', 'confirmado',
      'requisito_aplicado_id', v_aplicado_id,
      'fecha_vencimiento', v_vencimiento
    );
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Para rechazar un comprobante hay que decir por qué: el dueño lo va a leer.';
  end if;

  update public.requisitos_sanitarios_propuestos
  set estado = 'rechazado',
      motivo_rechazo = btrim(p_motivo),
      revisado_por = auth.uid(),
      revisado_at = now()
  where id = p_id;

  return jsonb_build_object('estado', 'rechazado');
end;
$$;

revoke execute on function public.revisar_requisito_propuesto(uuid, boolean, text) from public;
revoke execute on function public.revisar_requisito_propuesto(uuid, boolean, text) from anon;
grant execute on function public.revisar_requisito_propuesto(uuid, boolean, text) to authenticated;

-- La foto la sube el servidor de la app con la secret key después de
-- comprobar que quien la manda es el dueño principal del perro (misma
-- forma que la foto del alta por link): el dueño no gana ninguna
-- política de escritura sobre el bucket. Para LEERLA ya alcanza
-- perros_archivos_select_propio (valida el {perro_id} de la ruta contra la
-- propiedad real) y el staff la ve con perros_archivos_select_staff, así
-- que la misma ruta sirve tal cual cuando la propuesta se convierte en
-- aplicación. No hay nada que agregar en storage.
