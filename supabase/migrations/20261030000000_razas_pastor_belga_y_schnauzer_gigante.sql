-- Decisión de precios de estética del dueño de Ludogteka (15 de octubre de 2026):
--   · Pastor belga groenendael: se cobra como talla MEDIANA, pelo MEDIO.
--   · Schnauzer gigante: se cobra como talla MEDIANA, pelo LARGO.
-- Los dos por la matriz talla × pelaje del grupo «Mestizo / sin raza».
--
-- 1. Catálogo compartido: la talla y el pelo típicos que el alta sugiere.
-- 2. Grupo de precio: SOLO Ludogteka (negocio #1). Es el negocio modelo de `crear_negocio`
--    (PELUDESK_NEGOCIO_MODELO_ID o, sin ella, Ludogteka), así que lo que quede aquí es lo que copian los
--    negocios nuevos; ningún otro negocio existente se toca.
-- 3. «Pastor belga malinois» NO se cambia: Ludogteka tiene mascotas con esa raza y moverla de grupo les
--    cambiaría el precio; queda pendiente de confirmar con el dueño.
-- Se conserva la historia: la fila anterior de `razas_grupo` se da de baja, no se borra. Una raza con
-- mascotas vivas en Ludogteka no cambia de grupo (se avisa).

update public.razas r
   set tamano_tipico_id = (select t.id from public.tamanos_categoria t where t.clave = v.talla),
       pelaje_tipico_id = (select p.id from public.tipos_pelaje p where p.clave = v.pelo),
       updated_at = now()
  from (values ('Pastor belga groenendael', 'mediano', 'medio'), ('Schnauzer gigante', 'mediano', 'largo')) as v(nombre, talla, pelo)
 where r.nombre = v.nombre and r.deleted_at is null;

do $$
declare
  v_neg constant uuid := '10000000-0000-4000-8000-000000000001';
  v_mestizo uuid;
  r record;
begin
  select id into v_mestizo from public.grupos_raza
   where negocio_id = v_neg and clave = 'mestizo' and deleted_at is null;
  if v_mestizo is null then
    return; -- sin negocio #1 en esta base (entornos vacíos): nada que mover.
  end if;

  for r in
    select ra.id, ra.nombre from public.razas ra
     where ra.deleted_at is null and ra.nombre in ('Pastor belga groenendael', 'Schnauzer gigante')
  loop
    if exists (select 1 from public.razas_grupo
                where negocio_id = v_neg and raza_id = r.id and grupo_raza_id = v_mestizo and deleted_at is null) then
      continue;
    end if;
    if exists (select 1 from public.perros where negocio_id = v_neg and raza_id = r.id and deleted_at is null) then
      raise notice 'No se movió % de grupo: Ludogteka tiene mascotas con esa raza.', r.nombre;
      continue;
    end if;
    update public.razas_grupo set deleted_at = now(), updated_at = now()
     where negocio_id = v_neg and raza_id = r.id and deleted_at is null;
    insert into public.razas_grupo (negocio_id, raza_id, grupo_raza_id) values (v_neg, r.id, v_mestizo);
  end loop;
end $$;
