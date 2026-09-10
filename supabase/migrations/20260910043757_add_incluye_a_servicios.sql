-- Qué trae un servicio, en palabras del negocio.
--
-- Nace de una necesidad concreta del alta por link de estética: al dueño
-- se le va a enseñar un precio estimado antes de que llegue, y un número
-- suelto invita a comparar contra el baño de $150 de la esquina. Lo que
-- justifica el precio es lo que incluye — baño, cepillado, uñas, oídos,
-- limpieza dental, corte higiénico, hidratación — y eso hoy no existe en
-- ningún lado: está en el cartel impreso y en lo que recepción alcanza a
-- decir por teléfono.
--
-- Va en `servicios` y no incrustado en la pantalla del alta porque es un
-- dato del negocio que cambia cuando el negocio quiere, no cuando alguien
-- toque el código. Se edita desde la pantalla del servicio, como todo lo
-- demás.
alter table public.servicios
  add column incluye text[] not null default '{}';

comment on column public.servicios.incluye is
  'Lo que trae el servicio, un renglón por concepto. Se le muestra al cliente junto al precio estimado.';

-- El baño estético del cartel, dictado por el dueño. Los demás servicios
-- se quedan vacíos: que el negocio decida qué listar en cada uno es una
-- captura suya, no algo que una migración deba inventar. Un `incluye`
-- vacío simplemente no pinta nada.
update public.servicios
set incluye = array[
  'Baño',
  'Cepillado, deslanado y corte',
  'Corte de uñas',
  'Limpieza de oídos',
  'Limpieza dental',
  'Corte higiénico',
  'Hidratación de nariz y almohadillas'
]
where clave in ('estetica_estetico', 'estetica_pelo_maltratado')
  and deleted_at is null;
