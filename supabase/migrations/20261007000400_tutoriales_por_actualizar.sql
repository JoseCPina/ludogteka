-- Videos «por actualizar» (7 de octubre de 2026): un video cuya pantalla o
-- artículo cambió queda marcado de forma PERSISTENTE (con el motivo y desde
-- cuándo) hasta que se regrabe con éxito. Lo marca el despliegue
-- (`npm run desplegar`, con afectados.mjs); lo ve /plataforma/tutoriales y
-- `npm run tutoriales -- --listar`; regrabar con éxito lo limpia.
-- El video sigue publicado y sirviéndose mientras tanto.

alter table public.tutoriales add column por_actualizar_motivo text;
alter table public.tutoriales add column por_actualizar_desde timestamptz;
alter table public.tutoriales add constraint tutoriales_por_actualizar_par
  check ((por_actualizar_motivo is null) = (por_actualizar_desde is null));

alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check
  check (accion in ('crear_negocio', 'actualizar_negocio', 'agregar_admin_negocio', 'restablecer_password', 'editar_catalogo',
                    'cambiar_plan', 'asignar_plan', 'editar_plan', 'resolver_propuesta_raza', 'agregar_raza', 'eliminar_negocio', 'seguimiento_pausa',
                    'cargar_tarifas_estetica', 'sincronizar_tutoriales', 'tutorial_youtube', 'marcar_tutoriales'));

-- Marca videos por actualizar: [{numero, motivo}]. Conserva el «desde» más
-- viejo y junta los motivos distintos (sin repetir).
create or replace function public.plataforma_tutoriales_marcar(p_marcas jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb;
  n int := 0;
  v_motivo text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce((select public.es_admin_plataforma()), false) then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_marcas) <> 'array' then
    raise exception 'Las marcas van en una lista.';
  end if;
  for m in select * from jsonb_array_elements(p_marcas) loop
    v_motivo := left(btrim(coalesce(m ->> 'motivo', 'Cambió algo que enseña este video')), 300);
    update public.tutoriales set
      por_actualizar_desde = coalesce(por_actualizar_desde, now()),
      por_actualizar_motivo = case
        when por_actualizar_motivo is null then v_motivo
        when position(v_motivo in por_actualizar_motivo) > 0 then por_actualizar_motivo
        else left(por_actualizar_motivo || ' · ' || v_motivo, 600)
      end
    where numero = m ->> 'numero' and deleted_at is null;
    if found then n := n + 1; end if;
  end loop;
  insert into public.plataforma_eventos (accion, detalle, created_by)
  values ('marcar_tutoriales', jsonb_build_object('marcados', n, 'via', case when auth.role() = 'service_role' then 'servicio' else 'sesion' end), auth.uid());
  return n;
end;
$$;
revoke execute on function public.plataforma_tutoriales_marcar(jsonb) from public, anon;
grant execute on function public.plataforma_tutoriales_marcar(jsonb) to authenticated, service_role;

-- Regrabar con éxito limpia la marca.
create or replace function public.plataforma_tutorial_publicar(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el corredor de tutoriales.' using errcode = '42501';
  end if;
  update public.tutoriales set
    descripcion = coalesce(p->>'descripcion', descripcion),
    duracion_s = coalesce(nullif(p->>'duracion_s', '')::int, duracion_s),
    video_path = coalesce(p->>'video_path', video_path),
    poster_path = coalesce(p->>'poster_path', poster_path),
    vtt_path = coalesce(p->>'vtt_path', vtt_path),
    master_path = coalesce(p->>'master_path', master_path),
    master_donde = coalesce(p->>'master_donde', master_donde),
    con_voz = coalesce((p->>'con_voz')::boolean, con_voz),
    commit_app = coalesce(p->>'commit_app', commit_app),
    estado = coalesce(p->>'estado', estado),
    publicado = coalesce((p->>'publicado')::boolean, publicado),
    version = case when p ? 'video_path' then version + 1 else version end,
    -- Regrabado con éxito: ya no está por actualizar.
    por_actualizar_motivo = case when p ? 'video_path' then null else por_actualizar_motivo end,
    por_actualizar_desde = case when p ? 'video_path' then null else por_actualizar_desde end
  where numero = p->>'numero' and deleted_at is null;
  if not found then
    raise exception 'No existe el tutorial %.', p->>'numero';
  end if;
end;
$$;
-- Lista blanca de la auditoría (función de postgres, de la plataforma).
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position('plataforma_tutoriales_marcar' in v_def) = 0 then
    v_def := replace(v_def, $a$('avisos_marcar')$a$, $b$('avisos_marcar'), ('plataforma_tutoriales_marcar')$b$);
    if position('plataforma_tutoriales_marcar' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar plataforma_tutoriales_marcar.';
    end if;
    execute v_def;
  end if;
end $$;
