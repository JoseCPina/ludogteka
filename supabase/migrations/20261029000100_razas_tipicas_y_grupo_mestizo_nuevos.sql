-- QA externa del 15 de octubre de 2026 (hallazgo B15: «al elegir Labrador la mascota queda en Mestizo»).
--
-- 1. Causa de fondo: la migración 20261009000000 quería que `crear_negocio` copiara `depende_pelaje` del
--    grupo modelo, pero su revisión («¿ya dice depende_pelaje?») se cumplía por otra cosa —la función
--    ya nombra `depende_pelaje` en el insert de servicios— y no cambió nada. Todo negocio creado desde
--    entonces nació con «Mestizo / sin raza» cobrando solo por talla (clinicademo y los tres negocios de
--    prueba de la QA). Se corrige la función y los negocios afectados que todavía NO capturan precios
--    en ese grupo; uno que ya capturó precios por talla (sin pelaje) se queda como está.
-- 2. Lo que se veía: «Labrador» está en el grupo «Mestizo / sin raza» (lo hizo así el negocio #1: su lista
--    de precios nombra seis grupos y todo lo demás se cobra por talla y pelaje). No es un error de mapeo,
--    pero la pantalla decía «es mestizo». Ahora la raza trae su talla y pelo típicos (catálogo compartido),
--    el formulario del perro los sugiere y el aviso dice «se cobra por tamaño y pelaje».

-- ── 1. crear_negocio copia la forma del grupo ───────────────────────
do $$
declare
  v_def text;
  v_viejo text := 'insert into public.grupos_raza (negocio_id, clave, nombre, depende_tamano, es_predeterminado, orden)
    values (v_id, r.clave, r.nombre, r.depende_tamano, r.es_predeterminado, r.orden)';
  v_nuevo text := 'insert into public.grupos_raza (negocio_id, clave, nombre, depende_tamano, es_predeterminado, orden, depende_pelaje, pelajes_permitidos)
    values (v_id, r.clave, r.nombre, r.depende_tamano, r.es_predeterminado, r.orden, r.depende_pelaje, r.pelajes_permitidos)';
begin
  select replace(pg_get_functiondef('public.crear_negocio'::regproc), chr(13), '') into v_def;
  if position(v_viejo in v_def) > 0 then
    execute replace(v_def, v_viejo, v_nuevo);
  elsif position('r.depende_pelaje, r.pelajes_permitidos' in v_def) = 0 then
    raise exception 'crear_negocio cambió: no se pudo copiar depende_pelaje de los grupos de raza.';
  end if;
end $$;

-- Los negocios que nacieron sin la forma del grupo y aún no capturan precios en él.
update public.grupos_raza g
   set depende_pelaje = true
 where g.clave = 'mestizo' and g.deleted_at is null and not g.depende_pelaje
   and not exists (select 1 from public.tarifas t where t.grupo_raza_id = g.id and t.deleted_at is null);

-- ── 2. Talla y pelo típicos de las razas (catálogo compartido) ───────
-- Solo donde la plataforma no ha puesto uno; las razas gigantes no llevan talla (la talla gigante no se
-- ofrece en estética) y «mestizo» no tiene una típica.
update public.razas r
   set tamano_tipico_id = coalesce(r.tamano_tipico_id, (select t.id from public.tamanos_categoria t where t.clave = v.talla)),
       pelaje_tipico_id = coalesce(r.pelaje_tipico_id, (select p.id from public.tipos_pelaje p where p.clave = v.pelo)),
       updated_at = now()
  from (values
    ('Basset hound', 'mediano', 'corto'), ('Beagle', 'mediano', 'corto'), ('Bóxer', 'grande', 'corto'),
    ('Bull terrier', 'mediano', 'corto'), ('Bulldog francés', 'chico', 'corto'), ('Bulldog inglés', 'mediano', 'corto'),
    ('Chihuahua', 'chico', 'corto'), ('Dálmata', 'grande', 'corto'), ('Doberman', 'grande', 'corto'),
    ('Dogo argentino', 'grande', 'corto'), ('Galgo', 'grande', 'corto'), ('Gran danés', null, 'corto'),
    ('Labrador retriever', 'grande', 'corto'), ('Mastín napolitano', null, 'corto'),
    ('Pastor belga groenendael', 'grande', 'largo'), ('Pitbull', 'mediano', 'corto'), ('Pointer', 'grande', 'corto'),
    ('Pug', 'chico', 'corto'), ('Rottweiler', 'grande', 'corto'), ('Salchicha', 'chico', 'corto'),
    ('Staffordshire terrier', 'mediano', 'corto'), ('Weimaraner', 'grande', 'corto'), ('Xoloitzcuintle', 'mediano', null),
    ('Akita inu', 'grande', 'corto'), ('Alaskan malamute', 'grande', 'medio'), ('Border collie', 'mediano', 'medio'),
    ('Husky siberiano', 'grande', 'medio'), ('Pastor alemán', 'grande', 'corto'), ('Pastor australiano', 'mediano', 'medio'),
    ('Pastor belga malinois', 'grande', 'corto'), ('Pastor holandés', 'grande', 'corto'),
    ('Boyero de Berna', 'grande', 'largo'), ('Chow chow', 'mediano', 'largo'), ('Collie', 'grande', 'largo'),
    ('Golden retriever', 'grande', 'largo'), ('Gran pirineo', null, 'largo'), ('Leonberger', null, 'largo'),
    ('Pastor alemán de pelo largo', 'grande', 'largo'), ('Samoyedo', 'grande', 'largo'), ('San Bernardo', null, 'largo'),
    ('Pomerania', 'chico', 'largo'), ('Spitz alemán', 'mediano', 'largo'), ('Spitz japonés', 'chico', 'largo'),
    ('Bichón frisé', 'chico', 'rizado'), ('Bichón habanero', 'chico', 'largo'), ('Bolonés', 'chico', 'largo'),
    ('Coton de Tuléar', 'chico', 'largo'), ('Havanés', 'chico', 'largo'), ('Maltés', 'chico', 'largo'),
    ('Poodle', 'mediano', 'rizado'), ('Poodle toy', 'chico', 'rizado'),
    ('Cairn terrier', 'chico', 'medio'), ('Cocker spaniel americano', 'mediano', 'largo'), ('Cocker spaniel inglés', 'mediano', 'largo'),
    ('Fox terrier de pelo duro', 'mediano', 'medio'), ('Lhasa apso', 'chico', 'largo'), ('Pequinés', 'chico', 'largo'),
    ('Schnauzer gigante', 'grande', 'medio'), ('Schnauzer mediano', 'mediano', 'medio'), ('Schnauzer miniatura', 'chico', 'medio'),
    ('Scottish terrier', 'chico', 'medio'), ('Shih tzu', 'chico', 'largo'), ('Shorkie', 'chico', 'largo'),
    ('Springer spaniel', 'mediano', 'largo'), ('West highland white terrier', 'chico', 'medio'), ('Yorkshire terrier', 'chico', 'largo'),
    ('Briard', 'grande', 'largo'), ('Komondor', null, 'largo'), ('Terranova', null, 'largo'), ('Viejo pastor inglés', 'grande', 'largo')
  ) as v(nombre, talla, pelo)
 where r.nombre = v.nombre and r.deleted_at is null;
