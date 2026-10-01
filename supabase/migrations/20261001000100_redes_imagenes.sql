-- Publicaciones de IMAGEN en Instagram y Facebook (la cuadrícula de PeluDesk).
-- Hasta hoy redes_publicaciones solo admitía videos (reel / muro / borrador):
-- se agrega el formato 'imagen' (foto de Instagram y foto de la página de
-- Facebook). Nada más cambia: la unicidad por (video, red), los pasos y el
-- bloqueo de la cola son los mismos.

alter table public.redes_publicaciones drop constraint if exists redes_publicaciones_formato_check;
alter table public.redes_publicaciones add constraint redes_publicaciones_formato_check
  check (formato in ('reel', 'muro', 'borrador', 'imagen'));

alter table public.redes_publicaciones drop constraint if exists redes_formato_de_red;
alter table public.redes_publicaciones add constraint redes_formato_de_red check (
  (red = 'instagram' and formato in ('reel', 'imagen')) or
  (red = 'facebook' and formato in ('reel', 'muro', 'imagen')) or
  (red = 'tiktok' and formato = 'borrador'));
