-- La página web de cada negocio, rediseñada por giro (18 de octubre de 2026).
--
-- 1. negocio_perfil guarda el diseño de su página: tema (veterinaria, estetica, guarderia, hotel), color y el
--    lugar de Google (place_id: lo único de Google que se puede conservar). Lo llena el registro desde la vista
--    previa de un prospecto (peludesk.mx/para/<slug>) y lo cambia el negocio en /admin/perfil.
-- 2. pagina_publica() entrega además el tema, el color, el place_id, el horario por día (para pedir cita en
--    línea), la clave y la duración de cada servicio, y los servicios de Veterinaria.
-- 3. maps_consultas: tipo «pagina» (las fotos y reseñas de Google en la página publicada mientras el negocio no
--    sube las suyas) con su propio tope al mes, aparte del de recolección.
-- 4. prospectos_visitas: clic en «Ver cómo lo manejarías tú» (la demo de PeluDesk desde su vista previa).

-- 1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.negocio_perfil
  add column google_place_id text check (google_place_id is null or google_place_id ~ '^[A-Za-z0-9_-]{10,300}$'),
  add column tema_web text check (tema_web is null or tema_web in ('veterinaria', 'estetica', 'guarderia', 'hotel')),
  add column color_web text check (color_web is null or color_web ~ '^#[0-9a-fA-F]{6}$');

comment on column public.negocio_perfil.google_place_id is 'Lugar de Google del negocio (de su vista previa). Solo el id: las fotos y reseñas se piden al mostrar la página.';
comment on column public.negocio_perfil.tema_web is 'Diseño de su página web por giro. Vacío: el de sus servicios activos.';
comment on column public.negocio_perfil.color_web is 'Color de su página web (#rrggbb). Vacío: el del giro.';

-- 2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.pagina_publica()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_activos text[] := public.modulos_activos();
  v_categorias text[];
  v_res jsonb;
begin
  if not ('pagina_web' = any(v_activos)) then
    return null;
  end if;
  v_categorias := array(select c from unnest(array['guarderia', 'hotel', 'estetica', 'veterinaria']) c where c = any(v_activos));
  select jsonb_build_object(
    'nombre', n.nombre,
    'ciudad', n.ciudad,
    'zona', n.zona_horaria,
    'descripcion', p.descripcion,
    'direccion', p.direccion,
    'logo_path', p.logo_path,
    'tema', p.tema_web,
    'color', p.color_web,
    'google_place_id', p.google_place_id,
    'modulos', to_jsonb(v_categorias),
    'fotos', coalesce((select jsonb_agg(f.path order by f.orden, f.created_at) from public.negocio_fotos f
                       where f.negocio_id = n.id and f.deleted_at is null), '[]'::jsonb),
    'whatsapp', (select c.telefono_recepcion from public.cupo_configuracion c
                 where c.negocio_id = n.id and c.deleted_at is null and c.vigencia_desde <= public.fecha_negocio()
                 order by c.vigencia_desde desc, c.created_at desc limit 1),
    'horario', public.horario_texto(null),
    'horario_semana', (select jsonb_agg(jsonb_build_object('dia', h.dia_semana, 'abre', to_char(h.hora_apertura, 'HH24:MI'), 'cierra', to_char(h.hora_cierre, 'HH24:MI')) order by h.dia_semana)
                       from public.horario_semana_vigente(null) h where h.hora_apertura is not null),
    'servicios', coalesce((
      select jsonb_agg(s.fila order by s.orden_cat, s.orden)
      from (
        select sv.orden,
          array_position(array['veterinaria', 'guarderia', 'hotel', 'estetica', 'bono', 'cargo'], sv.categoria) as orden_cat,
          jsonb_build_object(
            'clave', sv.clave, 'categoria', sv.categoria, 'nombre', sv.nombre, 'unidad', sv.unidad,
            'duracion', sv.duracion_minutos,
            'incluye', sv.incluye, 'no_incluye', sv.no_incluye,
            'precios', (
              select jsonb_agg(jsonb_build_object(
                'etiqueta', coalesce(tv.grupo_raza_nombre || coalesce(' · ' || tc.etiqueta, ''), tc.etiqueta),
                'precio', tv.precio) order by tv.precio)
              from public.tarifas_vigentes tv
              left join public.tamanos_categoria tc on tc.id = tv.tamano_id
              where tv.servicio_id = sv.id and not tv.no_aplica and tv.precio is not null
            )
          ) as fila
        from public.servicios sv
        where sv.negocio_id = n.id and sv.deleted_at is null and not sv.monto_libre
          and (sv.categoria = any(v_categorias)
               or (sv.categoria = 'bono' and 'bonos' = any(v_activos))
               or (sv.categoria = 'cargo' and sv.clave = 'recoleccion' and 'recoleccion' = any(v_activos)))
          and exists (select 1 from public.tarifas_vigentes tv where tv.servicio_id = sv.id and not tv.no_aplica and tv.precio is not null)
      ) s
    ), '[]'::jsonb)
  )
  into v_res
  from public.negocios n
  left join public.negocio_perfil p on p.negocio_id = n.id and p.deleted_at is null
  where n.id = public.negocio_actual() and n.activo and n.deleted_at is null;
  return v_res;
end;
$$;

-- 3 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.maps_consultas drop constraint maps_consultas_tipo_check;
alter table public.maps_consultas add constraint maps_consultas_tipo_check check (tipo in ('geocodificar', 'ruta', 'pagina'));

create or replace function public.maps_reservar_consulta(p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_mes date := date_trunc('month', public.fecha_negocio())::date;
  v_tope int;
  v_usadas int;
begin
  if v_neg is null then
    raise exception 'Falta el negocio.';
  end if;
  if not (public.is_staff() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Sin permiso para consultar Google Maps.';
  end if;
  if p_tipo not in ('geocodificar', 'ruta', 'pagina') then
    raise exception 'Tipo de consulta desconocido.';
  end if;
  -- Dos pantallas al mismo tiempo no se pasan del tope.
  perform pg_advisory_xact_lock(hashtext('maps:' || v_neg::text));
  -- La página web lleva su propio tope (300 al mes): sus visitas no se comen las cotizaciones de recolección.
  if p_tipo = 'pagina' then
    v_tope := 300;
    select count(*) into v_usadas from public.maps_consultas
    where negocio_id = v_neg and mes = v_mes and deleted_at is null and tipo = 'pagina';
  else
    v_tope := public.maps_tope_mes();
    select count(*) into v_usadas from public.maps_consultas
    where negocio_id = v_neg and mes = v_mes and deleted_at is null and tipo <> 'pagina';
  end if;
  if v_usadas >= v_tope then
    return jsonb_build_object('permitida', false, 'usadas', v_usadas, 'tope', v_tope);
  end if;
  insert into public.maps_consultas (negocio_id, tipo, mes) values (v_neg, p_tipo, v_mes);
  return jsonb_build_object('permitida', true, 'usadas', v_usadas + 1, 'tope', v_tope);
end;
$$;

-- 4 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.prospectos_visitas drop constraint prospectos_visitas_tipo_check;
alter table public.prospectos_visitas add constraint prospectos_visitas_tipo_check check (tipo in ('visita', 'clic_prueba', 'clic_whatsapp', 'clic_demo'));

create or replace function public.prospecto_registrar_visita(p_slug text, p_tipo text, p_ip_hash text, p_navegador text)
returns uuid language plpgsql set search_path = '' as $$
declare v public.prospectos;
begin
  if p_tipo not in ('visita', 'clic_prueba', 'clic_whatsapp', 'clic_demo') then raise exception 'Tipo de visita no válido.'; end if;
  select * into v from public.prospectos where slug = p_slug and deleted_at is null;
  if v.id is null then return null; end if;
  insert into public.prospectos_visitas (prospecto_id, tipo, ip_hash, navegador) values (v.id, p_tipo, p_ip_hash, left(p_navegador, 300));
  update public.prospectos set
    visitas = visitas + case when p_tipo = 'visita' then 1 else 0 end,
    primera_visita_at = coalesce(primera_visita_at, now()),
    ultima_visita_at = now(),
    clic_prueba_at = case when p_tipo = 'clic_prueba' then now() else clic_prueba_at end,
    clic_whatsapp_at = case when p_tipo = 'clic_whatsapp' then now() else clic_whatsapp_at end,
    etapa = case when etapa in ('nuevo', 'contactado') then 'caliente' else etapa end,
    contacto_pausado_at = null
  where id = v.id;
  insert into public.prospectos_eventos (prospecto_id, tipo, texto)
  values (v.id, 'visita', case p_tipo
    when 'visita' then 'Abrió su página'
    when 'clic_prueba' then 'Le dio clic a «Activar mi página gratis»'
    when 'clic_demo' then 'Le dio clic a «Ver cómo lo manejarías tú» (abrió la demo)'
    else 'Le dio clic a «Hablar por WhatsApp»' end);
  return v.id;
end;
$$;
