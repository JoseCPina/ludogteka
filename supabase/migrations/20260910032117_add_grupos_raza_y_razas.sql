-- Los precios reales de estética son por GRUPO DE RAZA, y ese concepto no
-- existía: la matriz era tamaño × pelaje, que sirve para hotel y
-- guardería pero no dice nada de que a un shih tzu se le cobre distinto
-- que a un labrador del mismo tamaño.
--
-- Dos tablas y no una, porque son dos cosas distintas que cambian a
-- ritmos distintos:
--
--   * grupos_raza — la unidad de PRECIO. Son siete, cambian cuando el
--     negocio reestructura su lista, y es lo que va a colgar de tarifas.
--   * razas — el catálogo que el CLIENTE busca. Son cientos, se le
--     agregan más con el tiempo, y cada una apunta a su grupo.
--
-- El cliente escoge su RAZA y nunca ve el grupo: "poodle" es algo que un
-- dueño sabe de su perro, "grupo 1 de precio" no. La app deriva el grupo
-- para cotizar. Meter las dos cosas en una sola tabla obligaría a que el
-- dueño escogiera entre siete cajones que no significan nada para él.
create table public.grupos_raza (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre text not null,

  -- El grupo de pelo corto es el único que se cobra por talla (grande,
  -- mediano, chico); los demás tienen un precio por grupo, sin importar
  -- el tamaño del perro. Esta bandera es lo que le dice a la app si tiene
  -- que pasarle el tamaño a resolver_precio o no — igual que
  -- servicios.depende_tamano decide la forma de la matriz de ese
  -- servicio, esto decide la forma de la matriz de este grupo.
  depende_tamano boolean not null default false,

  -- Adónde cae un mestizo o una raza que no está en el catálogo. Uno
  -- solo, garantizado por el índice único de abajo: si hubiera dos, la
  -- app tendría que elegir y elegiría mal.
  es_predeterminado boolean not null default false,

  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.grupos_raza
  for each row execute function public.set_updated_at();

create unique index grupos_raza_un_predeterminado_idx
  on public.grupos_raza (es_predeterminado) where es_predeterminado;

alter table public.grupos_raza enable row level security;

-- El cliente ve precios de estética en su pantalla de registro, así que
-- necesita leer el catálogo — mismo criterio que servicios y tarifas.
create policy grupos_raza_select_autenticados on public.grupos_raza
  for select to authenticated using (true);

create policy grupos_raza_insert_admin on public.grupos_raza
  for insert to authenticated with check (public.is_admin());

create policy grupos_raza_update_admin on public.grupos_raza
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.razas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  grupo_raza_id uuid not null references public.grupos_raza(id),

  -- Nombres alternativos con los que un dueño podría buscarla ("lulú" por
  -- pomerania, "french poodle" por poodle). La búsqueda del formulario
  -- pega contra nombre Y alias: si el dueño escribe como le dice él y no
  -- encuentra nada, escoge "No sé" y se pierde la precisión del precio.
  alias text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.razas
  for each row execute function public.set_updated_at();

create unique index razas_nombre_idx on public.razas (lower(nombre)) where deleted_at is null;
create index razas_grupo_idx on public.razas (grupo_raza_id);

alter table public.razas enable row level security;

create policy razas_select_autenticados on public.razas
  for select to authenticated using (true);

create policy razas_insert_admin on public.razas
  for insert to authenticated with check (public.is_admin());

create policy razas_update_admin on public.razas
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Los siete grupos del cartel impreso, en el orden en que están ahí.
insert into public.grupos_raza (clave, nombre, depende_tamano, es_predeterminado, orden, updated_at)
values
  ('poodle_maltes',     'Poodle, maltés y similares',                       false, false, 1, now()),
  ('pomerania',         'Pomerania',                                        false, false, 2, now()),
  ('shihtzu_similares', 'Shih tzu, schnauzer, yorkshire, cocker y similares', false, false, 3, now()),
  ('pastor_corto',      'Pastores pelo corto, husky, akita y similares',     false, false, 4, now()),
  ('pastor_largo',      'Pastores pelo largo y similares talla grande',      false, false, 5, now()),
  ('viejo_pastor',      'Viejo pastor inglés y similares talla grande',      false, false, 6, now()),
  ('pelo_corto',        'Pelo corto',                                        true,  true,  7, now());

-- El catálogo de razas. La asignación de cada raza a su grupo es una
-- lectura del "y similares" del cartel, no algo que el cartel diga raza
-- por raza: son editables desde la matriz de tarifas justo por eso, y las
-- fronterizas (chow chow, samoyedo, terranova) están anotadas abajo para
-- que el negocio las mueva si no coincide con cómo cobra.
insert into public.razas (nombre, grupo_raza_id, alias, updated_at)
select v.nombre, g.id, v.alias, now()
from (values
  -- Grupo 1: poodle, maltés y similares (pelo rizado/lanudo chico)
  ('Poodle',                  'poodle_maltes',     array['french poodle', 'caniche']),
  ('Poodle toy',              'poodle_maltes',     array['poodle mini', 'poodle miniatura']),
  ('Maltés',                  'poodle_maltes',     array['bichon maltes']),
  ('Bichón frisé',            'poodle_maltes',     array['bichon']),
  ('Havanés',                 'poodle_maltes',     array['bichon habanero']),
  ('Coton de Tuléar',         'poodle_maltes',     array[]::text[]),
  ('Bolonés',                 'poodle_maltes',     array['bichon bolones']),
  ('Bichón habanero',         'poodle_maltes',     array[]::text[]),

  -- Grupo 2: pomerania
  ('Pomerania',               'pomerania',         array['lulu', 'lulu de pomerania', 'spitz enano']),
  ('Spitz alemán',            'pomerania',         array['spitz']),
  ('Spitz japonés',           'pomerania',         array[]::text[]),

  -- Grupo 3: shih tzu, schnauzer, yorkshire, cocker y similares
  ('Shih tzu',                'shihtzu_similares', array['shitzu', 'shih-tzu']),
  ('Schnauzer miniatura',     'shihtzu_similares', array['schnauzer mini']),
  ('Schnauzer mediano',       'shihtzu_similares', array['schnauzer estandar']),
  ('Yorkshire terrier',       'shihtzu_similares', array['yorkie', 'york']),
  ('Cocker spaniel inglés',   'shihtzu_similares', array['cocker']),
  ('Cocker spaniel americano','shihtzu_similares', array[]::text[]),
  ('Lhasa apso',              'shihtzu_similares', array['lasa apso']),
  ('Pequinés',                'shihtzu_similares', array['pekines']),
  ('West highland white terrier', 'shihtzu_similares', array['westie', 'west highland']),
  ('Scottish terrier',        'shihtzu_similares', array['escoces']),
  ('Cairn terrier',           'shihtzu_similares', array[]::text[]),
  ('Fox terrier de pelo duro','shihtzu_similares', array['fox terrier']),
  ('Schnauzer gigante',       'shihtzu_similares', array[]::text[]),
  ('Shorkie',                 'shihtzu_similares', array[]::text[]),
  ('Springer spaniel',        'shihtzu_similares', array[]::text[]),

  -- Grupo 4: pastores de pelo corto, husky, akita y similares
  ('Pastor alemán',           'pastor_corto',      array['pastor aleman pelo corto', 'ovejero aleman']),
  ('Husky siberiano',         'pastor_corto',      array['husky']),
  ('Akita inu',               'pastor_corto',      array['akita']),
  ('Alaskan malamute',        'pastor_corto',      array['malamute']),
  ('Pastor belga malinois',   'pastor_corto',      array['malinois']),
  ('Pastor holandés',         'pastor_corto',      array[]::text[]),
  ('Pastor australiano',      'pastor_corto',      array['australian shepherd']),
  ('Border collie',           'pastor_corto',      array[]::text[]),

  -- Grupo 5: pastores de pelo largo y similares de talla grande
  ('Pastor alemán de pelo largo', 'pastor_largo',  array['pastor aleman pelo largo']),
  ('Collie',                  'pastor_largo',      array['collie de pelo largo', 'lassie']),
  ('Golden retriever',        'pastor_largo',      array['golden']),
  ('Boyero de Berna',         'pastor_largo',      array['bernes de la montana', 'bernes']),
  ('San Bernardo',            'pastor_largo',      array[]::text[]),
  ('Chow chow',               'pastor_largo',      array[]::text[]),
  ('Samoyedo',                'pastor_largo',      array['samoyedo siberiano']),
  ('Gran pirineo',            'pastor_largo',      array['pastor de los pirineos']),
  ('Leonberger',              'pastor_largo',      array[]::text[]),

  -- Grupo 6: viejo pastor inglés y similares de talla grande
  ('Viejo pastor inglés',     'viejo_pastor',      array['bobtail', 'old english sheepdog']),
  ('Terranova',               'viejo_pastor',      array['newfoundland']),
  ('Briard',                  'viejo_pastor',      array[]::text[]),
  ('Komondor',                'viejo_pastor',      array[]::text[]),

  -- Grupo 7: pelo corto, se cobra por talla
  ('No sé / mestizo',         'pelo_corto',        array['mestizo', 'criollo', 'no se', 'mezcla', 'cruza']),
  ('Labrador retriever',      'pelo_corto',        array['labrador']),
  ('Beagle',                  'pelo_corto',        array[]::text[]),
  ('Bóxer',                   'pelo_corto',        array['boxer']),
  ('Bulldog inglés',          'pelo_corto',        array['bulldog']),
  ('Bulldog francés',         'pelo_corto',        array['frenchie']),
  ('Chihuahua',               'pelo_corto',        array['chihuahueno']),
  ('Dálmata',                 'pelo_corto',        array['dalmata']),
  ('Doberman',                'pelo_corto',        array[]::text[]),
  ('Pug',                     'pelo_corto',        array['carlino']),
  ('Pitbull',                 'pelo_corto',        array['pit bull', 'american pitbull terrier']),
  ('Rottweiler',              'pelo_corto',        array['rotweiler']),
  ('Weimaraner',              'pelo_corto',        array[]::text[]),
  ('Gran danés',              'pelo_corto',        array['dogo aleman']),
  ('Dogo argentino',          'pelo_corto',        array[]::text[]),
  ('Xoloitzcuintle',          'pelo_corto',        array['xolo', 'perro pelon mexicano']),
  ('Salchicha',               'pelo_corto',        array['dachshund', 'teckel']),
  ('Basset hound',            'pelo_corto',        array[]::text[]),
  ('Bull terrier',            'pelo_corto',        array[]::text[]),
  ('Staffordshire terrier',   'pelo_corto',        array['staffy', 'american staffordshire']),
  ('Galgo',                   'pelo_corto',        array['greyhound', 'whippet']),
  ('Pointer',                 'pelo_corto',        array[]::text[]),
  ('Mastín napolitano',       'pelo_corto',        array['mastin']),
  ('Schnauzer cruza',         'pelo_corto',        array[]::text[]),
  ('Pastor belga groenendael','pelo_corto',        array['groenendael'])
) as v(nombre, grupo_clave, alias)
join public.grupos_raza g on g.clave = v.grupo_clave;

-- El perro apunta a su raza del catálogo. La columna `raza` de texto
-- libre se queda: los perros que ya existen la tienen escrita a mano y
-- ese dato no se tira. raza_id es lo que usa el precio; `raza` sigue
-- siendo lo que alguien tecleó, y la ficha puede mostrar las dos mientras
-- recepción normaliza a su ritmo.
alter table public.perros
  add column raza_id uuid references public.razas(id);

create index perros_raza_id_idx on public.perros (raza_id);

-- Grupo de precio de cada perro, resuelto: la raza si la tiene, y si no
-- (perro viejo con raza escrita a mano, o "no sé"), el grupo
-- predeterminado. Una vista y no una columna para que mover una raza de
-- grupo se refleje solo, sin tener que recorrer perros.
create view public.perro_grupo_raza
with (security_invoker = true)
as
select
  p.id as perro_id,
  coalesce(g.id, gp.id) as grupo_raza_id,
  coalesce(g.clave, gp.clave) as grupo_clave,
  coalesce(g.nombre, gp.nombre) as grupo_nombre,
  coalesce(g.depende_tamano, gp.depende_tamano) as depende_tamano,
  (p.raza_id is null) as por_defecto
from public.perros p
left join public.razas r on r.id = p.raza_id and r.deleted_at is null
left join public.grupos_raza g on g.id = r.grupo_raza_id and g.deleted_at is null
left join public.grupos_raza gp on gp.es_predeterminado and gp.deleted_at is null
where p.deleted_at is null;
