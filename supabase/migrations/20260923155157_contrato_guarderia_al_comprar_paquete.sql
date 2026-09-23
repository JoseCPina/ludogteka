-- El contrato de guardería se firma DESPUÉS del alta, al comprar un
-- paquete (day pass o mensualidad), no dentro del alta por link.
--
-- Cómo estaba: el alta de guardería/hotel generaba TODOS los contratos
-- que aplican a esas categorías y el dueño los firmaba ahí mismo. El de
-- guardería pide {{paquete_guarderia}}, {{numero_day_pass}},
-- {{vigencia_inicio}} y {{vigencia_fin}}, y en el alta el cliente
-- todavía no ha comprado nada: esos campos (y {{contacto_emergencia}},
-- que nadie resolvía) salían con las llaves crudas en el PDF firmado.
--
-- Cómo queda:
--   - Cada tipo de contrato dice CUÁNDO se genera (tipos_contrato.
--     se_genera_al): 'alta' (como hasta hoy) o 'compra_paquete'.
--   - El alta por link solo genera los de 'alta'.
--   - Al venderse un paquete de guardería se genera el contrato
--     'compra_paquete' para cada perro vivo del cliente (el paquete es del
--     cliente y lo puede usar cualquiera de sus perros), ligado a esa
--     compra: de ahí salen paquete, número de pases y vigencia.
--   - El dueño lo firma desde su portal; recepción ve quién lo debe.
--
-- Hotel se queda en el alta: todo lo que su contrato pide se conoce el
-- día del alta (no depende de ninguna compra), y así el perro llega a su
-- primera noche con el contrato firmado aunque la reserva se haya hecho
-- por teléfono días antes.

-- ── 1. Cuándo se genera cada tipo de contrato ────────────────────────
alter table public.tipos_contrato
  add column if not exists se_genera_al text not null default 'alta';

alter table public.tipos_contrato
  drop constraint if exists tipos_contrato_se_genera_al_check;
alter table public.tipos_contrato
  add constraint tipos_contrato_se_genera_al_check
  check (se_genera_al in ('alta', 'compra_paquete'));

-- Un paquete es de guardería: solo un contrato exclusivo de guardería se
-- puede colgar de la compra.
alter table public.tipos_contrato
  drop constraint if exists tipos_contrato_paquete_solo_guarderia;
alter table public.tipos_contrato
  add constraint tipos_contrato_paquete_solo_guarderia
  check (se_genera_al <> 'compra_paquete' or categorias_servicio = array['guarderia']::text[]);

comment on column public.tipos_contrato.se_genera_al is
  '''alta'': se genera y firma dentro del alta por link. ''compra_paquete'': se genera al vender un day pass o mensualidad de guardería, ligado a esa compra, y se firma desde el portal.';

-- Los contratos que ya existen y son exclusivos de guardería pasan a
-- generarse con la compra (en producción: "Contrato GUARDERÍA").
update public.tipos_contrato
set se_genera_al = 'compra_paquete'
where categorias_servicio = array['guarderia']::text[]
  and deleted_at is null;

create or replace function public.definir_momento_tipo_contrato(p_tipo_id uuid, p_se_genera_al text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categorias text[];
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin puede cambiar cuándo se genera un contrato.';
  end if;
  if p_se_genera_al is null or p_se_genera_al not in ('alta', 'compra_paquete') then
    raise exception 'Elige cuándo se genera: al darse de alta o al comprar un paquete de guardería.';
  end if;
  select categorias_servicio into v_categorias
  from public.tipos_contrato where id = p_tipo_id and deleted_at is null;
  if not found then
    raise exception 'Tipo de contrato no encontrado o archivado.';
  end if;
  if p_se_genera_al = 'compra_paquete' and v_categorias is distinct from array['guarderia']::text[] then
    raise exception 'Solo un contrato que aplica únicamente a guardería se puede generar al comprar un paquete.';
  end if;
  update public.tipos_contrato set se_genera_al = p_se_genera_al where id = p_tipo_id;
end;
$$;

revoke execute on function public.definir_momento_tipo_contrato(uuid, text) from public, anon;
grant execute on function public.definir_momento_tipo_contrato(uuid, text) to authenticated;

-- ── 2. El contrato sabe de qué compra salió, y si hay que rehacerlo ──
alter table public.contratos
  add column if not exists bono_cliente_id uuid references public.bonos_clientes(id),
  add column if not exists regenerar_motivo text,
  add column if not exists regenerar_marcado_at timestamptz;

create index if not exists contratos_bono_cliente_id_idx on public.contratos (bono_cliente_id);

comment on column public.contratos.bono_cliente_id is
  'La compra (day pass o mensualidad) de la que salió este contrato. Da paquete, número de pases y vigencia. Null en contratos del alta o generados sin paquete.';
comment on column public.contratos.regenerar_motivo is
  'Si no es null: el contrato firmado tiene un defecto (p. ej. campos sin llenar en el PDF) y recepción debe generar uno nuevo. El firmado NO se borra: queda como evidencia.';

-- ── 3. El alta solo genera los contratos de 'alta' ───────────────────
create or replace function public.tipos_contrato_de_alta(p_tipo text)
returns table (tipo_contrato_id uuid, tipo_nombre text, plantilla_id uuid)
language sql
stable
set search_path = ''
as $$
  select t.id, t.nombre, pl.id
  from public.tipos_contrato t
  join public.plantillas_contrato pl
    on pl.tipo_contrato_id = t.id and pl.activa
  where t.deleted_at is null
    and t.se_genera_al = 'alta'
    and p_tipo = 'guarderia_hotel'
    and (
      cardinality(t.categorias_servicio) = 0
      or t.categorias_servicio && array['guarderia', 'hotel']
    )
  order by t.orden, t.nombre;
$$;

-- ── 4. Campos del contrato ───────────────────────────────────────────
-- Por perro: lo de siempre + {{contacto_emergencia}} del expediente.
-- Cuerpo de 20260923152350.
create or replace function public.resolver_campos_contrato(p_perro_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'cliente_nombre', c.nombre,
    'cliente_telefono', c.telefono,
    'cliente_email', coalesce(c.email, ''),
    'cliente_rfc', coalesce(c.rfc, ''),
    'perro_nombre', p.nombre,
    'perro_raza', coalesce(p.raza, ''),
    'perro_sexo', case p.sexo when 'macho' then 'Macho' when 'hembra' then 'Hembra' else '' end,
    'perro_fecha_nacimiento', coalesce(to_char(p.fecha_nacimiento, 'DD/MM/YYYY'), 'no registrada'),
    'perro_tamano', coalesce(tc.etiqueta, 'no registrado'),
    'autorizacion_medica_notas', coalesce(nullif(btrim(p.autorizacion_medica_notas), ''), 'Sin autorización médica registrada'),
    'tope_gasto_autorizado', case
      when p.tope_gasto_autorizado is null then 'sin tope definido'
      else '$' || to_char(p.tope_gasto_autorizado, 'FM999,999,990.00')
    end,
    'consentimiento_imagen', case when c.consentimiento_imagen then 'Sí autoriza' else 'No autoriza' end,
    'servicios_disponibles', coalesce((
      select string_agg(s.nombre, ', ' order by s.orden)
      from public.servicios s
      where s.categoria in ('guarderia', 'hotel', 'estetica') and s.deleted_at is null
    ), 'consultar catálogo vigente'),
    'fecha_firma', to_char(public.fecha_negocio(), 'DD/MM/YYYY'),
    'horario_guarderia', public.horario_texto(public.fecha_negocio()),
    'contacto_emergencia', coalesce(
      nullif(concat_ws(', tel. ',
        nullif(btrim(p.contacto_emergencia_nombre), ''),
        nullif(btrim(p.contacto_emergencia_telefono), '')
      ), ''),
      'no registrado'
    )
  )
  from public.perros p
  join public.clientes c on c.id = p.cliente_id
  left join public.tamanos_categoria tc on tc.id = p.tamano_id
  where p.id = p_perro_id;
$$;

-- Por contrato: lo del perro + lo de la compra de la que salió. Es lo
-- que usan la vista previa y la firma (el PDF es de UN contrato, no de un
-- perro). security definer con la puerta explícita: staff, o el dueño
-- del contrato — nadie más, ni la llave anónima.
create or replace function public.resolver_campos_de_contrato(p_contrato_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_contrato record;
  v_bono record;
  v_campos jsonb;
begin
  select c.id, c.perro_id, c.cliente_id, c.bono_cliente_id into v_contrato
  from public.contratos c where c.id = p_contrato_id;
  if not found then
    raise exception 'Contrato no encontrado.';
  end if;

  if not (
    coalesce(public.is_staff(), false)
    or exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid() and pr.cliente_id = v_contrato.cliente_id
    )
  ) then
    raise exception 'No tienes acceso a este contrato.';
  end if;

  v_campos := public.resolver_campos_contrato(v_contrato.perro_id);

  if v_contrato.bono_cliente_id is not null then
    select s.nombre, bc.ilimitado, bc.cantidad_total, bc.fecha_compra, bc.fecha_vencimiento
      into v_bono
    from public.bonos_clientes bc
    join public.servicios s on s.id = bc.servicio_id
    where bc.id = v_contrato.bono_cliente_id;
  end if;

  if v_bono.nombre is null then
    return v_campos || jsonb_build_object(
      'paquete_guarderia', 'Sin paquete (pago por día)',
      'numero_day_pass', 'No aplica',
      'vigencia_inicio', 'No aplica',
      'vigencia_fin', 'No aplica'
    );
  end if;

  return v_campos || jsonb_build_object(
    'paquete_guarderia', v_bono.nombre,
    'numero_day_pass', case when v_bono.ilimitado
      then 'Ilimitado (mensualidad)'
      else v_bono.cantidad_total::text end,
    'vigencia_inicio', to_char(v_bono.fecha_compra, 'DD/MM/YYYY'),
    'vigencia_fin', coalesce(to_char(v_bono.fecha_vencimiento, 'DD/MM/YYYY'), 'Sin vencimiento')
  );
end;
$$;

revoke execute on function public.resolver_campos_de_contrato(uuid) from public, anon;
grant execute on function public.resolver_campos_de_contrato(uuid) to authenticated;

-- ── 5. El contrato se genera con la compra del paquete ───────────────
-- El paquete de guardería vigente más reciente de un cliente: con él se
-- liga un contrato de 'compra_paquete' que se genera a mano (o se
-- regenera) fuera del momento de la venta.
create or replace function public.paquete_guarderia_vigente(p_cliente_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select bc.id
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  join public.servicios si on si.id = s.servicio_incluido_id
  where bc.cliente_id = p_cliente_id
    and bc.deleted_at is null
    and si.categoria = 'guarderia'
    and (bc.fecha_vencimiento is null or bc.fecha_vencimiento >= public.fecha_negocio())
  order by bc.fecha_compra desc, bc.created_at desc
  limit 1;
$$;

revoke execute on function public.paquete_guarderia_vigente(uuid) from public, anon;
grant execute on function public.paquete_guarderia_vigente(uuid) to authenticated;

create or replace function public.generar_contratos_de_paquete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria_incluida text;
  v_paquete text;
  v_tipo record;
  v_perro record;
begin
  select si.categoria, s.nombre into v_categoria_incluida, v_paquete
  from public.servicios s
  left join public.servicios si on si.id = s.servicio_incluido_id
  where s.id = new.servicio_id;

  if v_categoria_incluida is distinct from 'guarderia' then
    return new;
  end if;

  for v_tipo in
    select t.id, t.nombre, pl.id as plantilla_id
    from public.tipos_contrato t
    join public.plantillas_contrato pl on pl.tipo_contrato_id = t.id and pl.activa
    where t.deleted_at is null and t.se_genera_al = 'compra_paquete'
  loop
    for v_perro in
      select p.id from public.perros p
      where p.cliente_id = new.cliente_id
        and p.deleted_at is null
        and not coalesce(p.fallecido, false)
    loop
      -- Uno pendiente de una compra anterior ya no aplica: el nuevo trae
      -- el paquete y la vigencia de esta compra. Se cancela, no se borra.
      update public.contratos c
      set estado = 'cancelado',
          motivo_cancelacion = format('Reemplazado por el contrato de la compra de %s del %s.',
            v_paquete, to_char(new.fecha_compra, 'DD/MM/YYYY'))
      from public.plantillas_contrato pl
      where pl.id = c.plantilla_id
        and pl.tipo_contrato_id = v_tipo.id
        and c.perro_id = v_perro.id
        and c.estado = 'pendiente_firma';

      insert into public.contratos (perro_id, cliente_id, plantilla_id, bono_cliente_id, created_by)
      values (v_perro.id, new.cliente_id, v_tipo.plantilla_id, new.id, auth.uid());
    end loop;
  end loop;

  return new;
end;
$$;

revoke execute on function public.generar_contratos_de_paquete() from public, anon, authenticated;

drop trigger if exists generar_contratos_de_paquete on public.bonos_clientes;
create trigger generar_contratos_de_paquete
after insert on public.bonos_clientes
for each row execute function public.generar_contratos_de_paquete();

-- ── 6. Generar a mano: el de paquete se liga a la compra vigente ─────
-- Cuerpo de 20260829232653, más el bono_cliente_id.
create or replace function public.generar_contrato(p_perro_id uuid, p_tipo_contrato_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente_id uuid;
  v_plantilla_id uuid;
  v_tipo_nombre text;
  v_se_genera_al text;
  v_id uuid;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden generar un contrato.';
  end if;

  select cliente_id into v_cliente_id from public.perros where id = p_perro_id and deleted_at is null;
  if v_cliente_id is null then
    raise exception 'Perro no encontrado.';
  end if;

  select nombre, se_genera_al into v_tipo_nombre, v_se_genera_al from public.tipos_contrato
  where id = p_tipo_contrato_id and deleted_at is null;
  if v_tipo_nombre is null then
    raise exception 'Tipo de contrato no encontrado o archivado.';
  end if;

  select id into v_plantilla_id from public.plantillas_contrato
  where tipo_contrato_id = p_tipo_contrato_id and activa = true;
  if v_plantilla_id is null then
    raise exception 'No hay una versión publicada de "%" todavía.', v_tipo_nombre;
  end if;

  if exists (
    select 1
    from public.contratos c
    join public.plantillas_contrato pl on pl.id = c.plantilla_id
    where c.perro_id = p_perro_id
      and c.estado = 'pendiente_firma'
      and pl.tipo_contrato_id = p_tipo_contrato_id
  ) then
    raise exception 'Ya hay un "%" pendiente de firma para este perro. Cancélalo antes de generar otro.', v_tipo_nombre;
  end if;

  insert into public.contratos (perro_id, cliente_id, plantilla_id, bono_cliente_id, created_by)
  values (
    p_perro_id, v_cliente_id, v_plantilla_id,
    case when v_se_genera_al = 'compra_paquete' then public.paquete_guarderia_vigente(v_cliente_id) end,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ── 7. Volver a generar un contrato marcado ──────────────────────────
create or replace function public.regenerar_contrato(p_contrato_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contrato record;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden volver a generar un contrato.';
  end if;

  select c.id, c.perro_id, c.created_at, c.regenerar_motivo, pl.tipo_contrato_id
    into v_contrato
  from public.contratos c
  join public.plantillas_contrato pl on pl.id = c.plantilla_id
  where c.id = p_contrato_id;
  if not found then
    raise exception 'Contrato no encontrado.';
  end if;
  if v_contrato.regenerar_motivo is null then
    raise exception 'Este contrato no está marcado para volver a generarse.';
  end if;
  if exists (
    select 1 from public.contratos c
    join public.plantillas_contrato pl on pl.id = c.plantilla_id
    where c.perro_id = v_contrato.perro_id
      and pl.tipo_contrato_id = v_contrato.tipo_contrato_id
      and c.created_at > v_contrato.created_at
      and c.estado <> 'cancelado'
  ) then
    raise exception 'Ya se generó un contrato nuevo para reemplazar este.';
  end if;

  return public.generar_contrato(v_contrato.perro_id, v_contrato.tipo_contrato_id);
end;
$$;

revoke execute on function public.regenerar_contrato(uuid) from public, anon;
grant execute on function public.regenerar_contrato(uuid) to authenticated;

-- ── 8. Lo que recepción tiene que atender ────────────────────────────
-- Una fila por contrato que pide algo: 'por_firmar' (pendiente, se le
-- recuerda al dueño) o 'por_regenerar' (firmado con defecto y todavía sin
-- reemplazo). security_invoker: la ve quien ya puede leer contratos.
create or replace view public.contratos_por_atender
with (security_invoker = true)
as
select
  case when c.estado = 'pendiente_firma' then 'por_firmar' else 'por_regenerar' end as situacion,
  c.id as contrato_id,
  c.perro_id,
  p.nombre as perro_nombre,
  c.cliente_id,
  cl.nombre as cliente_nombre,
  cl.telefono as cliente_telefono,
  t.nombre as tipo_nombre,
  s.nombre as paquete_nombre,
  c.created_at,
  c.fecha_firma,
  c.regenerar_motivo
from public.contratos c
join public.perros p on p.id = c.perro_id and p.deleted_at is null
join public.clientes cl on cl.id = c.cliente_id
join public.plantillas_contrato pl on pl.id = c.plantilla_id
join public.tipos_contrato t on t.id = pl.tipo_contrato_id
left join public.bonos_clientes bc on bc.id = c.bono_cliente_id
left join public.servicios s on s.id = bc.servicio_id
where c.deleted_at is null
  and (
    c.estado = 'pendiente_firma'
    or (
      c.regenerar_motivo is not null
      and not exists (
        select 1 from public.contratos c2
        join public.plantillas_contrato pl2 on pl2.id = c2.plantilla_id
        where c2.perro_id = c.perro_id
          and pl2.tipo_contrato_id = pl.tipo_contrato_id
          and c2.created_at > c.created_at
          and c2.estado <> 'cancelado'
          and c2.deleted_at is null
      )
    )
  );

-- ── 9. Marcar los firmados con campos que nunca se llenaban ──────────
-- Estos seis campos no los resolvía nadie antes de hoy
-- (horario_guarderia desde la migración anterior, los otros cinco desde
-- esta), así que TODO contrato firmado en digital con alguno de ellos en
-- su plantilla quedó con las llaves crudas en el PDF. No se borra: se
-- marca para que recepción genere uno nuevo.
update public.contratos c
set regenerar_marcado_at = now(),
    regenerar_motivo = 'Se firmó con campos sin llenar en el PDF ('
      || (
        select string_agg('{{' || m[1] || '}}', ', ' order by m[1])
        from (
          select distinct regexp_matches(pl.titulo || ' ' || pl.cuerpo,
            '\{\{(contacto_emergencia|paquete_guarderia|numero_day_pass|vigencia_inicio|vigencia_fin|horario_guarderia)\}\}', 'g') as m
        ) x
      )
      || '). Genera uno nuevo para que el dueño lo vuelva a firmar; el firmado se conserva.'
from public.plantillas_contrato pl
where pl.id = c.plantilla_id
  and c.estado = 'firmado_digital'
  and c.regenerar_motivo is null
  and c.fecha_firma < now()
  and (pl.titulo || ' ' || pl.cuerpo) ~ '\{\{(contacto_emergencia|paquete_guarderia|numero_day_pass|vigencia_inicio|vigencia_fin)\}\}';
