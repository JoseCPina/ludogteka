-- Campos dinámicos del contrato: una sola función que resuelve todo el
-- expediente relevante a un jsonb, para que la generación del PDF
-- (aplicación, migración/código siguiente) nunca tenga que repetir estos
-- joins ni decidir el texto de cada campo por su cuenta. Mismo principio
-- que resolver_precio/resolver_cupo_configuracion: una sola fuente de
-- verdad para un dato que se usa en más de un lugar.
--
-- Decisión de vigencia (Bloque C, documentada también en
-- docs/PROYECTO.md): el contrato es POR PERRO, no por estancia — por eso
-- estos campos se resuelven a partir de un perro_id, no de una reserva.
-- servicios_disponibles no es una reserva concreta, es la lista general
-- de lo que el negocio ofrece hoy (guardería/hotel/estética), porque el
-- contrato ampara la relación general con el negocio, no una visita.
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
    'fecha_firma', to_char(public.fecha_negocio(), 'DD/MM/YYYY')
  )
  from public.perros p
  join public.clientes c on c.id = p.cliente_id
  left join public.tamanos_categoria tc on tc.id = p.tamano_id
  where p.id = p_perro_id;
$$;

grant execute on function public.resolver_campos_contrato(uuid) to authenticated;
