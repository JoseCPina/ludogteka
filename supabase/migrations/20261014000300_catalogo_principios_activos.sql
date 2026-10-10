-- Veterinaria, Fase 0 · parte 4: catálogo de principios activos con sus dos
-- clasificaciones.
--
-- Un principio activo tiene DOS clasificaciones independientes:
--   · Grupo SENASICA (I, II, III o ninguno): Acuerdo del DOF del 12-jul-2004,
--     modificado el 05-mar-2012.
--   · Ley General de Salud: estupefaciente (art. 234), psicotrópico fracción
--     II, III o IV del art. 245, o ninguna.
-- más la marca «antimicrobiano». Es un catálogo COMPARTIDO (sin negocio_id)
-- y lo edita SOLO la plataforma (`plataforma_guardar_principio_activo`, con
-- su evento): no está fijo en código. Cada producto del inventario copia
-- estos valores al elegir un principio activo, pero guarda los suyos y se
-- pueden editar por producto (ver la migración del inventario).
-- `por_confirmar`: la clasificación se dejó por analogía o el Acuerdo no
-- lista el principio; alguien la tiene que confirmar. Se precargó tal como
-- la capturó el dueño de PeluDesk a partir de esas fuentes; no se contrastó
-- contra el texto oficial del DOF.

create table public.principios_activos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  grupo_senasica text check (grupo_senasica in ('I', 'II', 'III')),
  clasificacion_lgs text check (clasificacion_lgs in ('estupefaciente_234', 'psicotropico_245_II', 'psicotropico_245_III', 'psicotropico_245_IV')),
  es_antimicrobiano boolean not null default false,
  por_confirmar boolean not null default false,
  nota text,
  fuente text not null default 'Acuerdo DOF 12-jul-2004 (mod. 05-mar-2012); Ley General de Salud arts. 234 y 245',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index principios_activos_nombre on public.principios_activos (lower(nombre)) where deleted_at is null;
create trigger set_updated_at before insert or update on public.principios_activos
  for each row execute function public.set_updated_at();
alter table public.principios_activos enable row level security;
create policy principios_activos_select on public.principios_activos
  for select to authenticated, peludesk_definer using (deleted_at is null);
-- Escribe solo por las funciones de abajo (de postgres, a la lista blanca de
-- la auditoría, como las de planes): nadie directo por la API.
grant select on public.principios_activos to authenticated, peludesk_definer, service_role;

insert into public.principios_activos (nombre, grupo_senasica, clasificacion_lgs, es_antimicrobiano, por_confirmar, nota) values
  ('ketamina', 'I', 'psicotropico_245_III', false, false, null),
  ('tiletamina', 'I', null, false, false, null),
  ('zolazepam', 'I', null, false, false, null),
  ('diazepam', 'I', 'psicotropico_245_III', false, false, null),
  ('midazolam', 'I', 'psicotropico_245_III', false, false, null),
  ('lorazepam', 'I', 'psicotropico_245_III', false, false, null),
  ('pentobarbital', 'I', 'psicotropico_245_II', false, false, null),
  ('tiopental', 'I', null, false, false, null),
  ('propofol', 'I', null, false, false, null),
  ('fentanilo', 'I', 'estupefaciente_234', false, false, null),
  ('meperidina', 'I', 'estupefaciente_234', false, false, null),
  ('butorfanol', 'I', 'psicotropico_245_II', false, false, null),
  ('xilazina', 'I', null, false, false, null),
  ('medetomidina', 'I', null, false, false, null),
  ('detomidina', 'I', null, false, false, null),
  ('acepromacina', 'I', null, false, false, null),
  ('clorpromacina', 'I', null, false, false, null),
  ('isoflurano', 'I', null, false, false, null),
  ('halotano', 'I', null, false, false, null),
  ('óxido nitroso', 'I', null, false, false, null),
  ('sevoflurano', null, null, false, true, 'No aparece en la lista del Acuerdo: queda sin grupo. Confirmar.'),
  ('lidocaína', 'I', null, false, false, 'Anestésico local.'),
  ('bupivacaína', 'I', null, false, false, 'Anestésico local.'),
  ('mepivacaína', 'I', null, false, false, 'Anestésico local.'),
  ('procaína', 'I', null, false, false, 'Anestésico local.'),
  ('succinilcolina', 'I', null, false, false, null),
  ('pancuronio', 'I', null, false, false, null),
  ('testosterona', 'I', null, false, false, 'Anabólico u hormonal sexual.'),
  ('estradiol', 'I', null, false, false, 'Anabólico u hormonal sexual.'),
  ('progesterona', 'I', null, false, false, 'Anabólico u hormonal sexual.'),
  ('medroxiprogesterona', 'I', null, false, false, 'Anabólico u hormonal sexual.'),
  ('megestrol', 'I', null, false, false, 'Anabólico u hormonal sexual.'),
  ('altrenogest', 'I', null, false, false, 'Anabólico u hormonal sexual.'),
  ('dinoprost', 'I', null, false, false, 'Prostaglandina.'),
  ('cloprostenol', 'I', null, false, false, 'Prostaglandina.'),
  ('buserelina', 'I', null, false, false, null),
  ('gonadotropinas', 'I', null, false, false, 'Gonadotropinas (hCG, eCG y similares).'),
  ('naltrexona', 'I', null, false, false, null),
  ('amoxicilina', 'II', null, true, false, null),
  ('ampicilina', 'II', null, true, false, null),
  ('cefalexina', 'II', null, true, false, null),
  ('ceftiofur', 'II', null, true, false, null),
  ('doxiciclina', 'II', null, true, false, null),
  ('oxitetraciclina', 'II', null, true, false, null),
  ('enrofloxacina', 'II', null, true, false, null),
  ('ciprofloxacina', 'II', null, true, false, null),
  ('clindamicina', 'II', null, true, false, null),
  ('lincomicina', 'II', null, true, false, null),
  ('gentamicina', 'II', null, true, false, null),
  ('amikacina', 'II', null, true, false, null),
  ('trimetoprim-sulfa', 'II', null, true, false, null),
  ('metronidazol', 'II', null, true, false, null),
  ('florfenicol', 'II', null, true, false, null),
  ('marbofloxacina', 'II', null, true, true, 'No aparece en la lista: se deja en el Grupo II por analogía con las demás fluoroquinolonas. Confirmar.'),
  ('ketoconazol', 'II', null, false, false, 'Antimicótico.'),
  ('itraconazol', 'II', null, false, false, 'Antimicótico.'),
  ('meloxicam', 'II', null, false, false, 'AINE.'),
  ('carprofeno', 'II', null, false, false, 'AINE.'),
  ('ketoprofeno', 'II', null, false, false, 'AINE.'),
  ('flunixina', 'II', null, false, false, 'AINE.'),
  ('dipirona', 'II', null, false, false, 'AINE.'),
  ('dexametasona', 'II', null, false, false, 'Corticoide.'),
  ('prednisolona', 'II', null, false, false, 'Corticoide.'),
  ('antihistamínicos (en general)', 'II', null, false, false, 'Entrada genérica: agrega la molécula concreta si la manejas.'),
  ('insulina', 'II', null, false, false, null),
  ('oxitocina', 'II', null, false, false, null),
  ('ivermectina', 'II', null, false, false, null),
  ('albendazol', 'II', null, false, false, null),
  ('fenbendazol', 'II', null, false, false, null),
  ('praziquantel', 'II', null, false, false, null),
  ('vitamínicos (en general)', 'III', null, false, false, null),
  ('probióticos (en general)', 'III', null, false, false, null),
  ('antisépticos (en general)', 'III', null, false, false, null),
  ('permetrina', 'III', null, false, false, 'Antiparasitario externo de libre venta.'),
  ('fipronil', 'III', null, false, true, 'No aparece en la lista: se deja en el Grupo III por analogía. Confirmar.'),
  ('tramadol', null, 'psicotropico_245_III', false, true, 'No aparece en el Acuerdo: sin grupo. Confirmar. Psicotrópico fracción III del art. 245 de la LGS (vigente desde el 14-jul-2026).'),
  ('fenobarbital', null, 'psicotropico_245_IV', false, true, 'No aparece en el Acuerdo: sin grupo. Confirmar.'),
  ('buprenorfina', null, 'estupefaciente_234', false, true, 'No aparece en el Acuerdo: sin grupo. Confirmar.'),
  ('morfina', null, 'estupefaciente_234', false, true, 'No aparece en el Acuerdo: sin grupo. Confirmar.'),
  ('nalbufina', null, 'psicotropico_245_II', false, true, 'No aparece en el Acuerdo: sin grupo. Confirmar.'),
  ('dexmedetomidina', null, null, false, true, 'No aparece en el Acuerdo: sin grupo. Confirmar.'),
  ('gabapentina', null, null, false, true, 'No aparece en el Acuerdo: sin grupo. Confirmar.'),
  ('trazodona', null, null, false, true, 'No aparece en el Acuerdo: sin grupo. Confirmar.'),
  ('fluoxetina', null, null, false, true, 'No aparece en el Acuerdo: sin grupo. Confirmar.'),
  ('metadona', null, null, false, true, 'No aparece en el Acuerdo: sin grupo. Confirmar. Revisa también su clasificación en la LGS (no se precargó).'),
  ('codeína', null, 'estupefaciente_234', false, true, 'Estupefaciente (art. 234 LGS). No aparece en el Acuerdo: sin grupo. Confirmar.'),
  ('alprazolam', null, 'psicotropico_245_III', false, true, 'Psicotrópico fracción III (art. 245 LGS). No aparece en el Acuerdo: sin grupo. Confirmar.');

-- Alta y edición, solo la plataforma, con su evento.
create or replace function public.plataforma_guardar_principio_activo(
  p_id uuid, p_nombre text, p_grupo_senasica text, p_clasificacion_lgs text,
  p_es_antimicrobiano boolean, p_por_confirmar boolean, p_nota text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'Escribe el nombre del principio activo.';
  end if;
  if p_id is null then
    insert into public.principios_activos (nombre, grupo_senasica, clasificacion_lgs, es_antimicrobiano, por_confirmar, nota)
    values (btrim(p_nombre), nullif(p_grupo_senasica, ''), nullif(p_clasificacion_lgs, ''), coalesce(p_es_antimicrobiano, false),
            coalesce(p_por_confirmar, false), nullif(btrim(coalesce(p_nota, '')), ''))
    returning id into v_id;
  else
    update public.principios_activos
    set nombre = btrim(p_nombre), grupo_senasica = nullif(p_grupo_senasica, ''), clasificacion_lgs = nullif(p_clasificacion_lgs, ''),
        es_antimicrobiano = coalesce(p_es_antimicrobiano, false), por_confirmar = coalesce(p_por_confirmar, false),
        nota = nullif(btrim(coalesce(p_nota, '')), '')
    where id = p_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'Ese principio activo no existe.';
    end if;
  end if;
  perform public.plataforma_registrar_evento('editar_principio_activo', null, null, null,
    jsonb_build_object('principio_activo', btrim(p_nombre), 'grupo_senasica', nullif(p_grupo_senasica, ''),
                       'lgs', nullif(p_clasificacion_lgs, ''), 'antimicrobiano', coalesce(p_es_antimicrobiano, false),
                       'por_confirmar', coalesce(p_por_confirmar, false), 'alta', p_id is null));
  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un principio activo con ese nombre.';
end;
$fn$;

create or replace function public.plataforma_baja_principio_activo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_nombre text;
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  update public.principios_activos set deleted_at = now() where id = p_id and deleted_at is null returning nombre into v_nombre;
  if v_nombre is null then
    raise exception 'Ese principio activo no existe.';
  end if;
  perform public.plataforma_registrar_evento('editar_principio_activo', null, null, null,
    jsonb_build_object('principio_activo', v_nombre, 'baja', true));
end;
$fn$;

revoke execute on function public.plataforma_guardar_principio_activo(uuid, text, text, text, boolean, boolean, text) from public, anon;
revoke execute on function public.plataforma_baja_principio_activo(uuid) from public, anon;
grant execute on function public.plataforma_guardar_principio_activo(uuid, text, text, text, boolean, boolean, text) to authenticated;
grant execute on function public.plataforma_baja_principio_activo(uuid) to authenticated;

-- Tabla compartida y funciones de postgres: a las listas de la auditoría.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  if position('principios_activos' in v_def) = 0 then
    v_def := replace(v_def, $a$compartidas(nombre) as (values $a$, $b$compartidas(nombre) as (values ('principios_activos'), $b$);
    v_def := replace(v_def, $a$('bot_cuenta_por_telefono')$a$,
      $b$('bot_cuenta_por_telefono'), ('plataforma_guardar_principio_activo'), ('plataforma_baja_principio_activo')$b$);
    if position('principios_activos' in v_def) = 0 or position('plataforma_baja_principio_activo' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar el catálogo de principios activos.';
    end if;
    execute v_def;
  end if;
end $$;
