-- QA S39 (N137): en un negocio con Veterinaria, el alta de mascota pregunta primero la especie (Perro, Gato, Otro) y
-- se adapta a ella. Aquí lo que la base necesita:
--   1. El catálogo de razas es por especie (`razas.especie`) y trae las razas de gato, entre ellas «Doméstico de pelo
--      corto», «Doméstico de pelo largo» y «Mestizo». El nombre de una raza es único DENTRO de su especie.
--   2. Las variantes con las que se reconoce una raza escrita a mano (normalización, propuestas, importador) siguen
--      siendo las de perro: un texto «mestizo» nunca cae en el «Mestizo» de gato.
--   3. «Razas sin grupo de precio» (Estética) solo cuenta perros: un gato no lleva grupo de precio de estética.
--   4. La especie se escoge al dar de alta: quien da de alta (admin o recepción) la guarda con el módulo Veterinaria
--      prendido, sin el permiso «Editar ficha clínica». Cambiarla después, el microchip y el folio siguen pidiéndolo.
-- Sin backfill: las razas existentes quedan como de perro (lo que eran).

-- 1. Especie en el catálogo compartido.
alter table public.razas
  add column if not exists especie text not null default 'perro' check (especie in ('perro', 'gato', 'otro'));

drop index if exists public.razas_nombre_idx;
create unique index razas_nombre_idx on public.razas (especie, lower(nombre)) where deleted_at is null;
create index if not exists razas_especie_idx on public.razas (especie) where deleted_at is null;

insert into public.razas (nombre, alias, especie, updated_at)
select v.nombre, v.alias, 'gato', now()
from (values
  ('Doméstico de pelo corto', array['europeo común', 'común europeo', 'domestico', 'doméstico', 'pelo corto', 'dpc']),
  ('Doméstico de pelo largo', array['pelo largo', 'dpl']),
  ('Mestizo', array['mestiza', 'criollo', 'criolla', 'cruza', 'callejero']),
  ('Siamés', array['siames', 'siamesa']),
  ('Persa', array['persa chinchilla']),
  ('Himalayo', array['himalaya']),
  ('Maine Coon', array['maine coon']),
  ('Bengalí', array['bengala', 'bengal']),
  ('Ragdoll', array['rag doll']),
  ('Esfinge', array['sphynx', 'sin pelo']),
  ('Británico de pelo corto', array['british shorthair', 'británico']),
  ('Exótico de pelo corto', array['exotic shorthair', 'exótico']),
  ('Azul ruso', array['russian blue']),
  ('Angora turco', array['angora']),
  ('Bosque de Noruega', array['noruego de bosque', 'norwegian forest']),
  ('Scottish fold', array['fold escocés']),
  ('Abisinio', array['abyssinian']),
  ('Sagrado de Birmania', array['birmano', 'birman'])
) as v(nombre, alias)
where not exists (
  select 1 from public.razas r where r.especie = 'gato' and lower(r.nombre) = lower(v.nombre) and r.deleted_at is null
);

-- 2. Las variantes reconocidas por texto son las de perro.
create or replace view public.razas_variantes with (security_invoker = true) as
select r.id as raza_id, r.nombre as raza_nombre, r.nombre as variante, public.normalizar_raza(r.nombre) as variante_norm, true as es_nombre
from public.razas r where r.deleted_at is null and r.especie = 'perro'
union
select r.id, r.nombre, a, public.normalizar_raza(a), false
from public.razas r, unnest(r.alias) a
where r.deleted_at is null and r.especie = 'perro' and public.normalizar_raza(a) <> '';
grant select on public.razas_variantes to authenticated, service_role;

-- 3 y 4: parches sobre el texto vigente de cada función (ya fueron parchadas antes; CR fuera).
do $$
declare
  v_def text;
  v_nuevo text;
begin
  v_def := replace(pg_get_functiondef('public.razas_sin_grupo()'::regprocedure), E'\r', '');
  v_nuevo := replace(v_def,
    'join public.razas r on r.id = p.raza_id and r.deleted_at is null',
    'join public.razas r on r.id = p.raza_id and r.deleted_at is null and r.especie = ''perro''');
  if v_nuevo = v_def then
    raise exception 'razas_sin_grupo: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;

  v_def := replace(pg_get_functiondef('public.proteger_ficha_clinica()'::regprocedure), E'\r', '');
  v_nuevo := replace(v_def,
    'if not coalesce(public.vet_puede(''editar_ficha_clinica''), false) then',
    E'-- QA S39 (N137): al dar de alta, el personal escoge la especie (sin microchip ni folio) con Veterinaria prendido.\n'
    || E'  if tg_op = ''INSERT'' and new.microchip is null and new.folio_registro is null and coalesce(public.is_staff(), false) then\n'
    || E'    return new;\n'
    || E'  end if;\n'
    || E'  if not coalesce(public.vet_puede(''editar_ficha_clinica''), false) then');
  if v_nuevo = v_def then
    raise exception 'proteger_ficha_clinica: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;
end $$;
