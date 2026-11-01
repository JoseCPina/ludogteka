-- QA S53 (N157, 31 de octubre de 2026): la consulta no enseñaba sus recetas. La receta N.º 24 de la clínica de
-- prueba quedó bien ligada (vet_recetas.consulta_id = la consulta firmada 3ad8de17), pero la pantalla de la consulta
-- nunca las leía: solo tenía «Emitir receta». La corrección de QA S25 (N114) puso las recetas en la línea de tiempo
-- del EXPEDIENTE (vet_linea_tiempo, por mascota), no en la consulta, y vet_recetas no se lee directo (su política de
-- SELECT es `false`: solo por funciones). Esta función da las recetas de UNA consulta, con la misma regla de lectura
-- que la lista de recetas (vet_recetas_puede_leer).
create or replace function public.vet_recetas_de_consulta(p_consulta uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_recetas_puede_leer() then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'numero', r.numero,
        'estado', r.estado,
        'fecha_emision', r.fecha_emision,
        'medico', coalesce(r.snapshot->'medico'->>'nombre', ''),
        'medicamentos', coalesce((select string_agg(l.producto, ', ' order by l.orden) from public.vet_receta_lineas l where l.receta_id = r.id and l.deleted_at is null), '')
      ) order by r.numero)
    from public.vet_recetas r
    where r.consulta_id = p_consulta and r.negocio_id = public.negocio_actual() and r.deleted_at is null
  ), '[]'::jsonb);
end;
$$;
alter function public.vet_recetas_de_consulta(uuid) owner to peludesk_definer;
revoke execute on function public.vet_recetas_de_consulta(uuid) from public, anon;
grant execute on function public.vet_recetas_de_consulta(uuid) to authenticated, service_role;

-- El candado de la receta emitida (vet_receta_inmutable) sigue igual, con UNA excepción: una receta que quedó SIN
-- consulta se puede ligar a la suya (consulta_id de null a una consulta de la misma mascota y el mismo negocio), una
-- sola vez. Nunca se cambia de consulta ni se desliga. Es lo que necesita la reparación de producción
-- (scripts/plataforma/recetas-sin-consulta-prod.mjs): tres recetas emitidas desde el borrador de su consulta antes de
-- que existiera «Emitir receta» desde un borrador (QA S49) quedaron sueltas.
create or replace function public.vet_receta_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_libres text[] := array['estado', 'anulada_at', 'anulada_por', 'anulada_motivo', 'token_hash', 'enviada_at', 'archivada_at', 'archivada_por', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Una receta no se borra: se anula con motivo.' using errcode = '42501';
  end if;
  -- Mientras se emite (aún sin hash) se completan su hash, su conservación y su foto.
  if old.hash_contenido is null then
    v_libres := v_libres || array['hash_contenido', 'conservar_hasta', 'snapshot'];
  end if;
  -- Ligar a su consulta una receta que quedó sin ella (QA S53, N157): solo de null a una consulta de la misma mascota.
  if old.consulta_id is null and new.consulta_id is not null then
    if not exists (select 1 from public.vet_consultas c where c.id = new.consulta_id and c.perro_id = new.perro_id and c.negocio_id = new.negocio_id and c.deleted_at is null) then
      raise exception 'Esa consulta no es de la mascota de la receta.' using errcode = '42501';
    end if;
    v_libres := v_libres || array['consulta_id'];
  end if;
  if (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
    raise exception 'Una receta emitida no se edita: anúlala con motivo y emite otra.' using errcode = '42501';
  end if;
  if old.estado = 'anulada' and (new.estado <> 'anulada' or new.anulada_motivo is distinct from old.anulada_motivo) then
    raise exception 'Una receta anulada no se reactiva.' using errcode = '42501';
  end if;
  return new;
end;
$$;
