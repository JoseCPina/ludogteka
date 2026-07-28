-- created_by dejaba de llenarse en cuanto una pantalla se olvidara de
-- mandarlo explícito. Con 13+ tablas y siete fases por delante, tarde o
-- temprano se iba a olvidar justo donde la auditoría importara. Un DEFAULT
-- a nivel de columna lo hace automático: si el INSERT no manda created_by,
-- Postgres llama a auth.uid() por su cuenta; si el INSERT sí lo manda
-- explícito (un script, una importación), el valor explícito gana y el
-- default ni se evalúa. No hace falta un trigger: un DEFAULT ya tiene
-- exactamente esa semántica de "solo si no vino dado".
--
-- Límite conocido, no cubierto por este default: auth.uid() lee el JWT de
-- la request actual. Un INSERT hecho con la secret key (rol service_role,
-- sin sesión de usuario) o SQL corrido directo como postgres (migraciones,
-- SQL Editor) no tiene ese JWT, así que auth.uid() da null igual que antes
-- — el default no "inventa" un usuario donde no lo hay. Hoy el único punto
-- del código que usa el cliente admin (src/app/api/staff/invite/route.ts)
-- hace un UPDATE sobre profiles, no un INSERT, así que no lo toca. Si en el
-- futuro se agrega un INSERT vía el cliente admin actuando en nombre de un
-- staff (en vez del cliente de sesión del propio usuario), ese código va a
-- tener que mandar created_by explícito con el id del caller — el mismo
-- patrón que ya usa invite/route.ts para atribuir acciones.
alter table public.sucursales alter column created_by set default auth.uid();
alter table public.clientes alter column created_by set default auth.uid();
alter table public.profiles alter column created_by set default auth.uid();

alter table public.tamanos_categoria alter column created_by set default auth.uid();
alter table public.tipos_pelaje alter column created_by set default auth.uid();
alter table public.perros alter column created_by set default auth.uid();
alter table public.perro_historial_dueno alter column created_by set default auth.uid();
alter table public.perro_accesos_compartidos alter column created_by set default auth.uid();
alter table public.tipos_requisito_sanitario alter column created_by set default auth.uid();
alter table public.requisitos_sanitarios_aplicados alter column created_by set default auth.uid();
alter table public.pesos_registrados alter column created_by set default auth.uid();
alter table public.catalogo_alertas alter column created_by set default auth.uid();
alter table public.perro_alertas alter column created_by set default auth.uid();
alter table public.perro_alergias alter column created_by set default auth.uid();
alter table public.perro_medicamentos alter column created_by set default auth.uid();
