-- N6 (QA externa, rechequeo del 16 de octubre de 2026): en el check-out cada pertenencia se confirma a mano; si se
-- cierra la salida con alguna sin entregar, se pide un motivo y queda registrado (quién y por qué). Va en `estancias`
-- (el dueño no la lee) y no en `estancia_pertenencias`, que sí es legible por el dueño.
alter table public.estancias
  add column pertenencias_sin_entrega_motivo text,
  add column pertenencias_sin_entrega_por uuid references auth.users(id) on delete set null,
  add constraint estancias_pertenencias_motivo_check
    check (pertenencias_sin_entrega_motivo is null or char_length(btrim(pertenencias_sin_entrega_motivo)) >= 3);
