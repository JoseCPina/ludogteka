-- Citas y reservas en el portal del dueño (23 de septiembre de 2026).
--
-- Hasta hoy el portal no mostraba ni una cita ni una reserva, que es lo
-- primero que un dueño espera ver. mis_visitas() le da al portal las
-- citas de estética y las estancias de guardería y hotel de los perros que
-- el dueño ve (los suyos y los de acceso compartido, la misma regla que
-- perros_select_propio), próximas e historial.
--
-- Solo columnas no financieras: fecha, servicio, perro y estado. Las
-- tablas traen precio (citas_estetica.precio, estancias.precio_unitario) y
-- el cliente nunca ve información financiera, así que el portal no lee las
-- tablas: lee esta función, que no puede devolver un precio aunque alguien
-- lo pida.
--
-- Solo lectura: reservar y cancelar sigue siendo por WhatsApp con
-- recepción. Security definer porque arma la lista del lado de la base;
-- el filtro es el cliente_id del perfil de quien llama, y un perfil sin
-- cliente (staff o cuenta sin vincular) recibe cero filas.

create or replace function public.mis_visitas()
returns table (
  tipo text,
  id uuid,
  perro_id uuid,
  perro_nombre text,
  servicio_nombre text,
  categoria text,
  unidad text,
  inicio timestamptz,
  fecha_entrada date,
  fecha_salida date,
  horas int,
  estado text
)
language sql
stable
security definer
set search_path = ''
as $$
  with yo as (
    select pr.cliente_id
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.rol = 'cliente'
      and pr.cliente_id is not null
  ),
  mis_perros as (
    select p.id, p.nombre
    from public.perros p, yo
    where p.deleted_at is null
      and (
        p.cliente_id = yo.cliente_id
        or exists (
          select 1 from public.perro_accesos_compartidos pac
          where pac.perro_id = p.id
            and pac.deleted_at is null
            and pac.cliente_id = yo.cliente_id
        )
      )
  )
  select 'estetica', c.id, mp.id, mp.nombre, s.nombre, s.categoria, s.unidad,
    c.inicio, null::date, null::date, null::int, c.estado
  from public.citas_estetica c
  join mis_perros mp on mp.id = c.perro_id
  join public.servicios s on s.id = c.servicio_id
  where c.deleted_at is null

  union all

  select 'estancia', e.id, mp.id, mp.nombre, s.nombre, s.categoria, s.unidad,
    null::timestamptz, e.fecha_entrada, e.fecha_salida, e.horas, e.estado
  from public.estancias e
  join mis_perros mp on mp.id = e.perro_id
  join public.servicios s on s.id = e.servicio_id
  where e.deleted_at is null;
$$;

comment on function public.mis_visitas() is
  'Citas de estética y estancias de los perros del dueño que llama, sin precios. Para el portal; solo lectura.';

revoke execute on function public.mis_visitas() from public, anon;
grant execute on function public.mis_visitas() to authenticated;
