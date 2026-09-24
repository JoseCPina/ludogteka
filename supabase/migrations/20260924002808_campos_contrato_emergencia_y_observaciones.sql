-- Campos del contrato que la plantilla pedía y nadie llenaba
-- (24 de septiembre de 2026).
--
-- El contrato firmado de Ronith salió con "Contacto de emergencia: ____",
-- "Teléfono: ____" y "Observaciones de ingreso / inventario: ____" en blanco
-- aunque el expediente tiene esos datos: la plantilla los trae como rayitas
-- con etiqueta, no como variables. El render (src/lib/contratos/plantilla.ts)
-- ahora llena las rayitas cuya etiqueta reconoce; aquí se agregan los datos
-- que faltaban para eso: nombre y teléfono del contacto de emergencia por
-- separado, y observaciones de ingreso armadas del expediente.
--
-- Copia exacta de resolver_campos_contrato (20260923155157) más tres campos.

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
    ),
    -- Por separado, para los renglones "Contacto de emergencia: ____" y
    -- "Teléfono: ____" de la plantilla.
    'contacto_emergencia_nombre', coalesce(nullif(btrim(p.contacto_emergencia_nombre), ''), 'no registrado'),
    'contacto_emergencia_telefono', coalesce(nullif(btrim(p.contacto_emergencia_telefono), ''), 'no registrado'),
    -- "Observaciones de ingreso": lo que el expediente ya sabe del perro y
    -- conviene que conste al firmar (alimentación, temperamento, alergias).
    'observaciones_ingreso', coalesce(
      nullif(concat_ws(' · ',
        'Alimentación: ' || nullif(btrim(p.alimentacion_notas), ''),
        'Temperamento: ' || nullif(btrim(p.temperamento_notas), ''),
        'Alergias: ' || (
          select string_agg(a.alergeno || coalesce(' (' || a.gravedad || ')', ''), ', ' order by a.created_at)
          from public.perro_alergias a
          where a.perro_id = p.id and a.deleted_at is null
        )
      ), ''),
      'Sin observaciones registradas'
    )
  )
  from public.perros p
  join public.clientes c on c.id = p.cliente_id
  left join public.tamanos_categoria tc on tc.id = p.tamano_id
  where p.id = p_perro_id;
$$;
