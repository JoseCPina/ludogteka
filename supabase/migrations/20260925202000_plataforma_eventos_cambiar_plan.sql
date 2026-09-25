-- La bitácora de la plataforma acepta el cambio de plan (plataforma_cambiar_plan):
-- sin esto, activar un negocio o vencerle la prueba tronaba en el registro
-- del evento (lo encontró la prueba de punta a punta de la prueba gratis).
alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check
  check (accion in ('crear_negocio', 'actualizar_negocio', 'agregar_admin_negocio', 'restablecer_password', 'editar_catalogo', 'cambiar_plan'));
