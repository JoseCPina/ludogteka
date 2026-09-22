-- Los servicios de estética de Fase 3 se retiran. Quedan los TRES del
-- cartel: Baño estético completo, Baño estético rapado y Baño exprés.
--
-- Lo que pasó: al modelar el cartel (20260910190123) se capturó la matriz
-- de los tres servicios nuevos y se dejó a los siete viejos vivos, sin
-- una sola tarifa. La comprobación de "ni una celda vacía" de esa
-- migración contaba solo tarifas con grupo_raza_id, así que los siete
-- —que cotizan por talla y pelaje, sin grupo— quedaron fuera del conteo
-- y del barrido. Y /estetica/nueva los seguía ofreciendo: recepción veía
-- diez opciones y siete tronaban al guardar con "No hay tarifa capturada".
--
-- Verificado en producción antes de escribir esto (2026-09-21): cero
-- citas de estética, cero tarifas vivas de estos siete. No hay nada que
-- referencie a estos servicios allá; en desarrollo hay residuo de pruebas
-- y por eso el candado de abajo distingue citas que todavía pueden
-- cambiar de citas ya cerradas.

-- ── 1. Candado ────────────────────────────────────────────────────────
-- Una cita que todavía puede cambiar (reservada, confirmada, en curso)
-- vuelve a pasar por validar_cita_estetica al editarse, y ese trigger
-- exige que el servicio esté vivo. Dar de baja el servicio con una de
-- esas colgando la dejaría ineditable. Las finalizadas y canceladas no
-- se tocan más, así que pueden quedarse apuntando a un servicio dado de
-- baja: es justo el historial que la baja lógica existe para conservar.
do $$
declare
  v_vivas int;
begin
  select count(*) into v_vivas
  from public.citas_estetica c
  join public.servicios s on s.id = c.servicio_id
  where s.clave in (
    'estetica_bano', 'estetica_corte', 'estetica_deslanado', 'estetica_unas',
    'estetica_oidos', 'estetica_combo_bano_corte', 'estetica_combo_completo'
  )
    and c.deleted_at is null
    and c.estado in ('reservada', 'confirmada', 'en_curso');

  if v_vivas > 0 then
    raise exception 'Hay % cita(s) de estética abiertas con un servicio de Fase 3. Ciérralas o cámbialas de servicio antes de retirarlos.', v_vivas;
  end if;
end;
$$;

-- ── 2. Baja lógica, tarifas primero ───────────────────────────────────
-- Mismo patrón que la baja de estetica_pelo_maltratado: nunca DELETE.
update public.tarifas t
set deleted_at = now()
from public.servicios s
where s.id = t.servicio_id
  and s.clave in (
    'estetica_bano', 'estetica_corte', 'estetica_deslanado', 'estetica_unas',
    'estetica_oidos', 'estetica_combo_bano_corte', 'estetica_combo_completo'
  )
  and t.deleted_at is null;

update public.servicios
set deleted_at = now()
where clave in (
    'estetica_bano', 'estetica_corte', 'estetica_deslanado', 'estetica_unas',
    'estetica_oidos', 'estetica_combo_bano_corte', 'estetica_combo_completo'
  )
  and deleted_at is null;

-- ── 3. La causa: qué servicio se puede cotizar, dicho por la base ─────
-- Un servicio es cotizable si tiene al menos UN precio vigente con el que
-- cobrar. Un servicio sin ninguna tarifa, o con todas sus celdas en
-- "no aplica", no se le puede ofrecer a nadie: la cita truena al guardar
-- y el dueño se entera en el mostrador.
--
-- Es a propósito el criterio mínimo y no "matriz completa": la regla del
-- proyecto desde 30c089a es que una celda SIN TARIFA se sigue ofreciendo
-- (y el panel de admin la reporta) mientras que NO APLICA se oculta —
-- ocultar por un hueco haría desaparecer una talla en silencio. Un
-- servicio con huecos sigue aquí; uno sin nada con qué cobrar, no.
--
-- La forma completa de la matriz (qué celdas debería tener cada
-- servicio) sigue viviendo en un solo lugar, src/lib/tarifas/matriz.ts,
-- que es lo que dibuja la matriz y cuenta los huecos del panel de admin.
-- Duplicarla aquí en SQL daría dos fuentes que se separan con el tiempo.
create view public.servicios_cotizables
with (security_invoker = true)
as
select s.id, s.clave, s.nombre, s.categoria, s.orden, s.duracion_minutos
from public.servicios s
where s.deleted_at is null
  and exists (
    select 1
    from public.tarifas_vigentes tv
    where tv.servicio_id = s.id
      and not tv.no_aplica
  );

comment on view public.servicios_cotizables is
  'Servicios vivos con al menos un precio vigente que no sea "no aplica". Toda pantalla que ofrezca un servicio para agendar o reservar lee de aquí, no de servicios: lo que no está aquí truena al guardar.';

-- ── 4. La comprobación que faltaba, sobre TODO servicio de estética ───
-- Tenga o no grupo de raza: la pregunta es "¿se puede cobrar?", y eso
-- lo contesta la vista de arriba para cualquier forma de matriz. Si un
-- servicio de estética vivo no es cotizable, esta migración se cae y no
-- deja el catálogo con un servicio ofrecible que no se puede cobrar —
-- que es el estado que este cambio viene a eliminar.
do $$
declare
  v_no_cotizables text;
begin
  select string_agg(s.clave, ', ' order by s.orden) into v_no_cotizables
  from public.servicios s
  where s.categoria = 'estetica'
    and s.deleted_at is null
    and not exists (select 1 from public.servicios_cotizables c where c.id = s.id);

  if v_no_cotizables is not null then
    raise exception 'Servicios de estética vivos sin ningún precio con el que cobrar: %', v_no_cotizables;
  end if;
end;
$$;
