-- PeluDesk, paso 5.
--
-- 1. Restablecer contraseña: la cuenta es de la PERSONA, y la misma
--    persona puede ser cliente (o empleada) de otro negocio. Si recepción
--    de un negocio pudiera cambiarle la contraseña, entraría con esa cuenta
--    al otro negocio: un negocio alcanzando algo de otro. Se niega cuando la
--    persona tiene membresía viva en cualquier otro negocio.
-- 2. El contenido de la landing de Ludogteka (precios de escaparate,
--    textos, WhatsApp, dirección, horarios) pasa del código
--    (src/lib/landing/negocio.ts) a negocios.landing, idéntico a como
--    estaba. Es el contenido que ya se publicaba, no un dato nuevo del
--    negocio: por eso va aquí y no por la UI.

-- ¿Esta persona tiene membresía viva en un negocio que NO es el de la
-- petición? Solo sí/no. De postgres (ve todas las membresías) y solo la
-- pueden llamar las funciones del rol definer y el servidor.
create or replace function public.persona_en_otro_negocio(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membresias m
    where m.profile_id = p_profile_id
      and m.deleted_at is null
      and m.negocio_id is distinct from public.negocio_actual()
  );
$$;
revoke execute on function public.persona_en_otro_negocio(uuid) from public, anon, authenticated;
grant execute on function public.persona_en_otro_negocio(uuid) to peludesk_definer, service_role;

create or replace function public.cuenta_de_cliente_para_restablecer(p_cliente_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden restablecer una contraseña.';
  end if;

  select m.profile_id into v_id
  from public.membresias m
  where m.cliente_id = p_cliente_id
    and m.negocio_id = public.negocio_actual()
    and m.rol = 'cliente'
    and m.deleted_at is null
  limit 1;

  if v_id is null then
    raise exception 'Ese cliente todavía no tiene cuenta. Mándale un link de alta para que la cree.';
  end if;

  if public.persona_en_otro_negocio(v_id) then
    raise exception 'Este cliente usa la misma cuenta en otro negocio de PeluDesk, así que su contraseña no se puede cambiar desde aquí. Que la cambie él desde su portal, o que la restablezca soporte de PeluDesk.';
  end if;
  return v_id;
end;
$$;
alter function public.cuenta_de_cliente_para_restablecer(uuid) owner to peludesk_definer;

update public.negocios
set landing = $landing${
 "tema": "ludogteka",
 "url_publica": "https://www.ludogteka.mx",
 "telefono_visible": "444 234 1355",
 "telefono_wa": "524442341355",
 "telefono_schema": "+52 444 234 1355",
 "mensajes": {
  "general": "Hola, Ludogteka. Quiero información sobre sus servicios para mi perro.",
  "guarderia": "Hola, Ludogteka. Quiero reservar guardería para mi perro.",
  "hotel": "Hola, Ludogteka. Quiero apartar hotel para mi perro. Las fechas son:",
  "estetica": "Hola, Ludogteka. Quiero agendar estética para mi perro. Su raza es:",
  "recoleccion": "Hola, Ludogteka. Quiero cotizar recolección a domicilio. Mi colonia y el día que la necesito:",
  "requisitos": "Hola, Ludogteka. Quiero agendar la evaluación de comportamiento de mi perro.",
  "portal_citas": "Hola, Ludogteka. Quiero agendar o cambiar una cita de mi perro.",
  "contrato_error": "Hola, Ludogteka. No pude abrir mi contrato en la app."
 },
 "direccion": {
  "calle": "Calz. de Guadalupe 1050",
  "colonia": "Tepeyac",
  "cp": "78384",
  "ciudad": "San Luis Potosí",
  "estado": "S.L.P."
 },
 "direccion_referencia": "Sobre Calzada de Guadalupe, cerca de la FENAPO.",
 "horario": [
  {
   "dias": "Lunes a viernes",
   "horas": "9:00 a 19:00",
   "abre": "09:00",
   "cierra": "19:00",
   "schema": [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday"
   ]
  },
  {
   "dias": "Sábado",
   "horas": "10:00 a 14:00",
   "abre": "10:00",
   "cierra": "14:00",
   "schema": [
    "Saturday"
   ]
  }
 ],
 "horario_cerrado": "Domingo",
 "horario_nota": "Con cita. El hotel no recibe ni entrega perros los domingos.",
 "precio_km_recoleccion": 12,
 "recoleccion_reglas": [
  "De lunes a viernes.",
  "Se agenda con 24 horas de anticipación.",
  "Para estética, la recolección es solo los martes."
 ],
 "zonas_cobertura": [],
 "guarderia": {
  "ocasionalHora": 35,
  "diaCompleto": 350,
  "diaCompletoSabado": 140,
  "mensualidad": 1950,
  "pases": [
   {
    "pases": 10,
    "precio": 1150,
    "vigenciaDias": 20
   },
   {
    "pases": 15,
    "precio": 1380,
    "vigenciaDias": 30
   },
   {
    "pases": 20,
    "precio": 1610,
    "vigenciaDias": 40
   }
  ]
 },
 "hotel": [
  {
   "talla": "Chica y mediana",
   "precio": 270
  },
  {
   "talla": "Grande y extra grande",
   "precio": 300
  }
 ],
 "estetica": {
  "incluye": [
   "Baño",
   "Cepillado, deslanado o corte de pelo",
   "Corte de uñas",
   "Limpieza de orejas y dientes",
   "Corte higiénico",
   "Hidratación de nariz y huellitas"
  ],
  "rapado_diferencia": "Igual que el estético, con corte rapado.",
  "expres_incluye": "Solo baño con shampoo y secado. No incluye cepillado ni ningún otro servicio.",
  "grupos": [
   {
    "nombre": "Poodle, maltés y similares",
    "bano": 390,
    "rapado": 320,
    "expres": 190
   },
   {
    "nombre": "Pomerania",
    "bano": 390,
    "expres": 190
   },
   {
    "nombre": "Shih tzu, schnauzer, yorkshire, cocker y similares",
    "bano": 390,
    "rapado": 320,
    "expres": 190
   },
   {
    "nombre": "Pastores de pelo corto, husky, akita y similares",
    "bano": 590,
    "expres": 370
   },
   {
    "nombre": "Pastores de pelo largo, talla grande",
    "bano": 650,
    "expres": 370
   },
   {
    "nombre": "Viejo pastor inglés y similares, talla grande",
    "bano": 790,
    "rapado": 590,
    "expres": 450
   }
  ],
  "por_talla": [
   {
    "talla": "Chico",
    "bano": 250,
    "expres": 150
   },
   {
    "talla": "Mediano",
    "bano": 350,
    "expres": 190
   },
   {
    "talla": "Grande",
    "bano": 490,
    "expres": 230
   }
  ],
  "pelo_maltratado": 450
 },
 "requisitos": [
  {
   "texto": "Evaluación previa de comportamiento",
   "tipo": "si"
  },
  {
   "texto": "Cartilla de vacunación vigente",
   "tipo": "si"
  },
  {
   "texto": "Bordetella (vigencia de 6 meses)",
   "tipo": "si"
  },
  {
   "texto": "Desparasitación cada 3 meses",
   "tipo": "si"
  },
  {
   "texto": "No recibimos perras en celo ni gestantes",
   "tipo": "no"
  },
  {
   "texto": "No recibimos perros agresivos",
   "tipo": "no"
  }
 ],
 "textos": {
  "etiqueta_hero": "Monitoreo 24 horas · San Luis Potosí",
  "lema": "Guardería, hotel y estética canina en San Luis Potosí.",
  "banda": [
   "Precaución, perritos a bordo",
   "Guardería",
   "Hotel",
   "Estética",
   "Recolección a domicilio",
   "Monitoreo 24 horas"
  ]
 },
 "seo": {
  "titulo": "Ludogteka | Guardería, hotel y estética canina en San Luis Potosí",
  "descripcion": "Guardería de lunes a sábado desde $35 la hora, hotel por noche y estética canina en SLP. Monitoreo 24 horas. Escríbenos por WhatsApp: 444 234 1355.",
  "og_titulo": "Ludogteka: guardería, hotel y estética canina",
  "og_descripcion": "Tu perro juega, descansa y sale guapo. Monitoreo 24 horas en San Luis Potosí.",
  "imagen": "/opengraph-image.jpg"
 }
}$landing$::jsonb
where id = '10000000-0000-4000-8000-000000000001';

create or replace function public.auditoria_frontera()
returns table (tipo text, nombre text, detalle text)
language sql
stable
security definer
set search_path = ''
as $$
  with lista_blanca(nombre) as (values
    ('current_rol'), ('es_miembro'), ('mi_cliente_id'), ('rol_en_negocio'), ('tiene_permiso'), ('mis_permisos'),
    ('persona_en_negocio'), ('zona_negocio'), ('negocio_por_host'), ('mis_negocios'), ('is_admin'), ('is_staff'),
    ('mi_empleado_id'), ('puede_ver_empleado'), ('cuentas_para_empleado'), ('email_de_login_por_telefono'),
    ('existe_usuario_por_email'), ('listar_cuentas'), ('listar_cuentas_sin_vincular'), ('listar_cuentas_vinculadas'),
    ('listar_personal'), ('listar_personal_estetica'), ('handle_new_user'), ('negocio_de_archivo_perro'),
    ('es_dueno_de_archivo_perro'), ('proteger_membresia'), ('crear_negocio'), ('agregar_admin_negocio'),
    ('auditoria_frontera'), ('proteger_columnas_sensibles_profile'), ('asignar_rol_staff'),
    ('usuario_por_email'), ('negocio_publico'), ('email_de_persona_por_telefono'),
    ('persona_en_otro_negocio')
  ),
  compartidas(nombre) as (values ('razas'), ('tamanos_categoria'), ('tipos_pelaje'), ('unidades_medida'), ('profiles'), ('negocios'))
  select 'funcion_definer_postgres', p.proname::text, pg_get_function_identity_arguments(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
    and p.proname not in (select nombre from lista_blanca)
  union all
  select 'tabla_sin_negocio', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not in (select nombre from compartidas)
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
  union all
  select 'tabla_sin_politica_negocio', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
    and c.relname <> 'negocios'
    and (
      not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname
                  and pp.permissive = 'RESTRICTIVE' and pp.qual like '%negocio_actual()%' and pp.qual like '%es_miembro()%')
      or not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname
                     and 'peludesk_definer' = any(pp.roles) and pp.qual like '%negocio_actual()%')
      or not c.relrowsecurity
    )
  union all
  select 'vista_sin_security_invoker', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce('security_invoker=true' = any(c.reloptions), false)
  union all
  select 'politica_storage_sin_negocio', pp.policyname::text, coalesce(pp.qual, pp.with_check)
  from pg_policies pp
  where pp.schemaname = 'storage' and pp.tablename = 'objects'
    and coalesce(pp.qual, '') || coalesce(pp.with_check, '') ~ '(is_staff\(\)|current_rol\(\)|is_admin\(\))';
$$;
revoke execute on function public.auditoria_frontera() from public, anon, authenticated;
grant execute on function public.auditoria_frontera() to service_role;
