-- Qué servicios admiten un precio alternativo por pelo maltratado.
--
-- Hace falta una bandera a nivel de SERVICIO, no basta con mirar si algún
-- grupo ya tiene el precio capturado: la matriz necesita saber dónde
-- pintar el segundo campo ANTES de que exista el primer valor. Sin esto,
-- ese precio solo se podría cambiar por migración — justo lo que la regla
-- del proyecto prohíbe para los datos del negocio.
alter table public.servicios
  add column if not exists acepta_pelo_maltratado boolean not null default false;

comment on column public.servicios.acepta_pelo_maltratado is
  'Si este servicio se cobra distinto cuando el perro llega enredado. Solo el baño estético completo: el rapado le quita el pelo y el exprés no lo desenreda.';

update public.servicios
set acepta_pelo_maltratado = true
where clave = 'estetica_estetico' and deleted_at is null;
