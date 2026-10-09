-- Logo del negocio: guarda el ancho y el alto REALES del archivo subido (los
-- lee el servidor al subirlo), para vista previa y avisos en Administración.
-- Solo informativas: el render del logo nunca las usa para forzar un tamaño.
-- Columnas nuevas de una tabla que ya tiene sus dos redes y sus políticas.

alter table public.negocio_perfil
  add column if not exists logo_ancho integer check (logo_ancho is null or logo_ancho > 0),
  add column if not exists logo_alto integer check (logo_alto is null or logo_alto > 0);
