-- PeluDesk, paso 10: cierre, con el código multi-negocio ya en producción.
--
-- 1. negocio_actual() vuelve a fallar cerrado: sin negocio explícito
--    (app.negocio_id o el encabezado x-negocio-id), NULL y no se ve nada.
--    El paso 9 lo hacía caer en Ludogteka solo para cubrir los minutos del
--    despliegue en que corría el código de antes.
-- 2. Las columnas de antes de PeluDesk que guardaban datos de UN negocio en
--    tablas que son de la persona o de la plataforma se vacían:
--      profiles.cliente_id, profiles.sucursal_id  → la membresía de cada
--        negocio (membresias.cliente_id); una persona de dos negocios
--        dejaba ver el id de su expediente del otro.
--      profiles.rol → 'cliente' para todos; el rol de verdad es el de la
--        membresía, y el de la columna decía en qué negocio es admin.
--      razas.grupo_raza_id → razas_grupo (por negocio); la columna dejaba
--        ver a todos los grupos de Ludogteka.
--    Las columnas se quedan (vacías y con candado) para no romper nada que
--    las nombre; borrarlas es limpieza aparte.

create or replace function public.negocio_actual()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then x::uuid
  end
  from (
    select coalesce(
      nullif(current_setting('app.negocio_id', true), ''),
      nullif(current_setting('request.headers', true), '')::json ->> 'x-negocio-id'
    ) as x
  ) s;
$$;
comment on function public.negocio_actual() is
  'El negocio de la petición (encabezado x-negocio-id que pone el servidor, o app.negocio_id). NULL = ninguno: no se ve nada.';

alter table public.profiles disable trigger proteger_columnas_sensibles;
update public.profiles
set cliente_id = null, sucursal_id = null, rol = 'cliente'
where cliente_id is not null or sucursal_id is not null or rol <> 'cliente';
alter table public.profiles enable trigger proteger_columnas_sensibles;

alter table public.profiles
  add constraint profiles_legado_vacio check (cliente_id is null and sucursal_id is null and rol = 'cliente');
comment on column public.profiles.rol is 'LEGADO (antes de PeluDesk), siempre ''cliente''. El rol es membresias.rol en cada negocio.';
comment on column public.profiles.cliente_id is 'LEGADO (antes de PeluDesk), siempre NULL. El expediente es membresias.cliente_id en cada negocio.';
comment on column public.profiles.sucursal_id is 'LEGADO (antes de PeluDesk), siempre NULL.';

alter table public.razas alter column grupo_raza_id drop not null;
update public.razas set grupo_raza_id = null where grupo_raza_id is not null;
alter table public.razas add constraint razas_grupo_legado_vacio check (grupo_raza_id is null);
