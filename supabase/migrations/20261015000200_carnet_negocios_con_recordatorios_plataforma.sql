-- Veterinaria, Fase 1 · parte 3: la lista de negocios con recordatorios de dosis.
--
-- `carnet_negocios_con_recordatorios()` la usa la tarea de envío (solo el servidor) para saber
-- QUÉ negocios tienen Veterinaria y el envío automático prendidos: recorre todos los negocios,
-- así que NO puede ser de `peludesk_definer` (que solo ve el negocio de la petición). Es de
-- postgres, solo `service_role`, y entra a la lista blanca de `auditoria_frontera()` como las
-- demás funciones de la plataforma. No devuelve nada más que los ids.
alter function public.carnet_negocios_con_recordatorios() owner to postgres;
revoke execute on function public.carnet_negocios_con_recordatorios() from public, anon, authenticated;
grant execute on function public.carnet_negocios_con_recordatorios() to service_role;

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.auditoria_frontera()'::regprocedure);
  if position('carnet_negocios_con_recordatorios' in v_def) = 0 then
    v_def := replace(v_def, $a$('seguimiento_registrar_respuesta'),$a$, $b$('seguimiento_registrar_respuesta'),
    -- Veterinaria: qué negocios mandan recordatorios de dosis (la tarea de envío, solo el servidor).
    ('carnet_negocios_con_recordatorios'),$b$);
    if position('carnet_negocios_con_recordatorios' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar carnet_negocios_con_recordatorios.';
    end if;
    execute v_def;
  end if;
end $$;
