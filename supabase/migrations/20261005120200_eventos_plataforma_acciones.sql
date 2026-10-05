-- Acciones nuevas de la bitácora de la plataforma: borrar un negocio y
-- pausar o reanudar el seguimiento de pruebas.
alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check
  check (accion = any (array['crear_negocio', 'actualizar_negocio', 'agregar_admin_negocio', 'restablecer_password', 'editar_catalogo',
    'cambiar_plan', 'asignar_plan', 'editar_plan', 'resolver_propuesta_raza', 'agregar_raza',
    'eliminar_negocio', 'seguimiento_pausa']));
