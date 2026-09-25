-- PeluDesk: planes de negocio, prueba gratis y SOLO LECTURA en la base.
--
-- · negocios.plan: 'activo' (el de siempre, Ludogteka), 'prueba' (30 días
--   desde el registro en peludesk.mx; `prueba_termina_at`) o 'demo' (el
--   negocio de muestra que exploran los prospectos). Plan y fin de prueba
--   solo los cambia la plataforma (validar_negocio).
-- · membresias.solo_lectura: las cuentas del demo que se abren a los
--   prospectos. Solo la plataforma lo cambia (proteger_membresia).
-- · negocio_escribible(): falso si la prueba del negocio ya venció, si el
--   negocio está suspendido o si la cuenta es de solo lectura. Se aplica con
--   una política RESTRICTIVE de INSERT, UPDATE y DELETE en CADA tabla de
--   negocio, para quien llega por la API (authenticated) y para las
--   funciones del rol definer: no depende de que una pantalla se acuerde.
--   Leer sigue igual. La secret key y las funciones de la plataforma (de
--   postgres) no pasan por aquí.
-- · Las dos funciones que escribían al LEER (gastos por atender genera los
--   esperados; abrir un link de alta lo marca usado) solo escriben si se
--   puede.
-- · Registro de pruebas: registros_prueba (teléfono, IP) con límites, y
--   registrar_negocio_prueba() que da de alta el negocio, su admin y su
--   fecha de fin. Solo el servidor.

alter table public.negocios
  add column plan text not null default 'activo' check (plan in ('activo', 'prueba', 'demo')),
  add column prueba_termina_at timestamptz;

alter table public.membresias add column solo_lectura boolean not null default false;

CREATE OR REPLACE FUNCTION public.validar_negocio()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform now() at time zone new.zona_horaria;
  new.dominio := nullif(lower(btrim(coalesce(new.dominio, ''))), '');
  new.url_publica := nullif(lower(btrim(coalesce(new.url_publica, ''))), '');
  new.slug := lower(btrim(new.slug));
  -- Subdominios de PeluDesk que no son negocios (src/lib/negocio/host.ts).
  if new.slug in ('www', 'app', 'api', 'admin', 'mail', 'static', 'plataforma', 'soporte', 'demo', 'registro', 'ayuda', 'blog', 'precios') then
    raise exception 'La dirección «%» está reservada para PeluDesk.', new.slug;
  end if;
  if tg_op = 'UPDATE'
     and (new.slug is distinct from old.slug or new.dominio is distinct from old.dominio
          or new.url_publica is distinct from old.url_publica or new.activo is distinct from old.activo
          or new.plan is distinct from old.plan or new.prueba_termina_at is distinct from old.prueba_termina_at)
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'El slug, el dominio, la dirección pública y el estado de un negocio solo los cambia la plataforma.';
  end if;
  return new;
exception
  when invalid_parameter_value then
    raise exception 'La zona horaria «%» no existe.', new.zona_horaria;
end;
$function$;

create or replace function public.negocio_escribible_en(p_negocio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
      select n.activo and n.deleted_at is null
             and not (n.plan = 'prueba' and n.prueba_termina_at is not null and n.prueba_termina_at < now())
      from public.negocios n
      where n.id = p_negocio_id
    ), false)
    and not exists (
      select 1 from public.membresias m
      where m.profile_id = auth.uid() and m.negocio_id = p_negocio_id
        and m.deleted_at is null and m.solo_lectura
    );
$$;
revoke execute on function public.negocio_escribible_en(uuid) from public, anon;
grant execute on function public.negocio_escribible_en(uuid) to authenticated, service_role, peludesk_definer;

create or replace function public.negocio_escribible()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.negocio_escribible_en(public.negocio_actual());
$$;
revoke execute on function public.negocio_escribible() from public, anon;
grant execute on function public.negocio_escribible() to authenticated, service_role, peludesk_definer;

-- Solo lectura en cada tabla de negocio (73 tablas).
create policy adelantos_escritura_ins on public.adelantos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy adelantos_escritura_upd on public.adelantos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy adelantos_escritura_del on public.adelantos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy areas_inventario_escritura_ins on public.areas_inventario as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy areas_inventario_escritura_upd on public.areas_inventario as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy areas_inventario_escritura_del on public.areas_inventario as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy asistencia_correcciones_escritura_ins on public.asistencia_correcciones as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy asistencia_correcciones_escritura_upd on public.asistencia_correcciones as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy asistencia_correcciones_escritura_del on public.asistencia_correcciones as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy asistencias_escritura_ins on public.asistencias as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy asistencias_escritura_upd on public.asistencias as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy asistencias_escritura_del on public.asistencias as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy ausencias_escritura_ins on public.ausencias as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy ausencias_escritura_upd on public.ausencias as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy ausencias_escritura_del on public.ausencias as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy bitacora_entradas_escritura_ins on public.bitacora_entradas as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy bitacora_entradas_escritura_upd on public.bitacora_entradas as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy bitacora_entradas_escritura_del on public.bitacora_entradas as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy bonos_clientes_escritura_ins on public.bonos_clientes as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy bonos_clientes_escritura_upd on public.bonos_clientes as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy bonos_clientes_escritura_del on public.bonos_clientes as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy cargos_aplicados_escritura_ins on public.cargos_aplicados as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy cargos_aplicados_escritura_upd on public.cargos_aplicados as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy cargos_aplicados_escritura_del on public.cargos_aplicados as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy catalogo_alertas_escritura_ins on public.catalogo_alertas as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy catalogo_alertas_escritura_upd on public.catalogo_alertas as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy catalogo_alertas_escritura_del on public.catalogo_alertas as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy catalogo_descuentos_escritura_ins on public.catalogo_descuentos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy catalogo_descuentos_escritura_upd on public.catalogo_descuentos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy catalogo_descuentos_escritura_del on public.catalogo_descuentos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy categorias_gasto_escritura_ins on public.categorias_gasto as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy categorias_gasto_escritura_upd on public.categorias_gasto as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy categorias_gasto_escritura_del on public.categorias_gasto as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy categorias_insumo_escritura_ins on public.categorias_insumo as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy categorias_insumo_escritura_upd on public.categorias_insumo as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy categorias_insumo_escritura_del on public.categorias_insumo as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy citas_estetica_escritura_ins on public.citas_estetica as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy citas_estetica_escritura_upd on public.citas_estetica as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy citas_estetica_escritura_del on public.citas_estetica as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy clientes_escritura_ins on public.clientes as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy clientes_escritura_upd on public.clientes as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy clientes_escritura_del on public.clientes as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy cobro_metodos_escritura_ins on public.cobro_metodos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy cobro_metodos_escritura_upd on public.cobro_metodos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy cobro_metodos_escritura_del on public.cobro_metodos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy cobros_escritura_ins on public.cobros as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy cobros_escritura_upd on public.cobros as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy cobros_escritura_del on public.cobros as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy comisiones_servicio_escritura_ins on public.comisiones_servicio as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy comisiones_servicio_escritura_upd on public.comisiones_servicio as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy comisiones_servicio_escritura_del on public.comisiones_servicio as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy compras_insumos_escritura_ins on public.compras_insumos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy compras_insumos_escritura_upd on public.compras_insumos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy compras_insumos_escritura_del on public.compras_insumos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy configuracion_descuentos_escritura_ins on public.configuracion_descuentos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy configuracion_descuentos_escritura_upd on public.configuracion_descuentos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy configuracion_descuentos_escritura_del on public.configuracion_descuentos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy contratos_escritura_ins on public.contratos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy contratos_escritura_upd on public.contratos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy contratos_escritura_del on public.contratos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy corte_metodos_escritura_ins on public.corte_metodos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy corte_metodos_escritura_upd on public.corte_metodos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy corte_metodos_escritura_del on public.corte_metodos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy cortes_caja_escritura_ins on public.cortes_caja as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy cortes_caja_escritura_upd on public.cortes_caja as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy cortes_caja_escritura_del on public.cortes_caja as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy cupo_configuracion_escritura_ins on public.cupo_configuracion as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy cupo_configuracion_escritura_upd on public.cupo_configuracion as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy cupo_configuracion_escritura_del on public.cupo_configuracion as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy descuentos_aplicados_escritura_ins on public.descuentos_aplicados as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy descuentos_aplicados_escritura_upd on public.descuentos_aplicados as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy descuentos_aplicados_escritura_del on public.descuentos_aplicados as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy devolucion_metodos_escritura_ins on public.devolucion_metodos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy devolucion_metodos_escritura_upd on public.devolucion_metodos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy devolucion_metodos_escritura_del on public.devolucion_metodos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy devoluciones_escritura_ins on public.devoluciones as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy devoluciones_escritura_upd on public.devoluciones as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy devoluciones_escritura_del on public.devoluciones as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy empleados_escritura_ins on public.empleados as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy empleados_escritura_upd on public.empleados as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy empleados_escritura_del on public.empleados as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy empleados_horario_escritura_ins on public.empleados_horario as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy empleados_horario_escritura_upd on public.empleados_horario as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy empleados_horario_escritura_del on public.empleados_horario as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy equipo_eventos_escritura_ins on public.equipo_eventos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy equipo_eventos_escritura_upd on public.equipo_eventos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy equipo_eventos_escritura_del on public.equipo_eventos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy equipos_escritura_ins on public.equipos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy equipos_escritura_upd on public.equipos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy equipos_escritura_del on public.equipos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy esquemas_pago_escritura_ins on public.esquemas_pago as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy esquemas_pago_escritura_upd on public.esquemas_pago as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy esquemas_pago_escritura_del on public.esquemas_pago as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy estancia_pertenencias_escritura_ins on public.estancia_pertenencias as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy estancia_pertenencias_escritura_upd on public.estancia_pertenencias as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy estancia_pertenencias_escritura_del on public.estancia_pertenencias as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy estancias_escritura_ins on public.estancias as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy estancias_escritura_upd on public.estancias as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy estancias_escritura_del on public.estancias as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy gastos_escritura_ins on public.gastos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy gastos_escritura_upd on public.gastos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy gastos_escritura_del on public.gastos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy gastos_recurrentes_escritura_ins on public.gastos_recurrentes as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy gastos_recurrentes_escritura_upd on public.gastos_recurrentes as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy gastos_recurrentes_escritura_del on public.gastos_recurrentes as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy grupos_raza_escritura_ins on public.grupos_raza as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy grupos_raza_escritura_upd on public.grupos_raza as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy grupos_raza_escritura_del on public.grupos_raza as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy horario_semana_escritura_ins on public.horario_semana as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy horario_semana_escritura_upd on public.horario_semana as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy horario_semana_escritura_del on public.horario_semana as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy insumos_escritura_ins on public.insumos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy insumos_escritura_upd on public.insumos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy insumos_escritura_del on public.insumos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy insumos_costos_escritura_ins on public.insumos_costos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy insumos_costos_escritura_upd on public.insumos_costos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy insumos_costos_escritura_del on public.insumos_costos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy invitaciones_cliente_escritura_ins on public.invitaciones_cliente as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy invitaciones_cliente_escritura_upd on public.invitaciones_cliente as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy invitaciones_cliente_escritura_del on public.invitaciones_cliente as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy medicamentos_administrados_escritura_ins on public.medicamentos_administrados as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy medicamentos_administrados_escritura_upd on public.medicamentos_administrados as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy medicamentos_administrados_escritura_del on public.medicamentos_administrados as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy membresias_escritura_ins on public.membresias as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy membresias_escritura_upd on public.membresias as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy membresias_escritura_del on public.membresias as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy movimientos_bono_escritura_ins on public.movimientos_bono as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy movimientos_bono_escritura_upd on public.movimientos_bono as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy movimientos_bono_escritura_del on public.movimientos_bono as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy movimientos_caja_escritura_ins on public.movimientos_caja as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy movimientos_caja_escritura_upd on public.movimientos_caja as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy movimientos_caja_escritura_del on public.movimientos_caja as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy movimientos_inventario_escritura_ins on public.movimientos_inventario as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy movimientos_inventario_escritura_upd on public.movimientos_inventario as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy movimientos_inventario_escritura_del on public.movimientos_inventario as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy mp_ordenes_escritura_ins on public.mp_ordenes as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy mp_ordenes_escritura_upd on public.mp_ordenes as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy mp_ordenes_escritura_del on public.mp_ordenes as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy nomina_pagos_escritura_ins on public.nomina_pagos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy nomina_pagos_escritura_upd on public.nomina_pagos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy nomina_pagos_escritura_del on public.nomina_pagos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy permisos_staff_escritura_ins on public.permisos_staff as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy permisos_staff_escritura_upd on public.permisos_staff as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy permisos_staff_escritura_del on public.permisos_staff as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy perro_accesos_compartidos_escritura_ins on public.perro_accesos_compartidos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy perro_accesos_compartidos_escritura_upd on public.perro_accesos_compartidos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy perro_accesos_compartidos_escritura_del on public.perro_accesos_compartidos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy perro_alergias_escritura_ins on public.perro_alergias as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy perro_alergias_escritura_upd on public.perro_alergias as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy perro_alergias_escritura_del on public.perro_alergias as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy perro_alertas_escritura_ins on public.perro_alertas as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy perro_alertas_escritura_upd on public.perro_alertas as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy perro_alertas_escritura_del on public.perro_alertas as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy perro_historial_dueno_escritura_ins on public.perro_historial_dueno as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy perro_historial_dueno_escritura_upd on public.perro_historial_dueno as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy perro_historial_dueno_escritura_del on public.perro_historial_dueno as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy perro_medicamentos_escritura_ins on public.perro_medicamentos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy perro_medicamentos_escritura_upd on public.perro_medicamentos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy perro_medicamentos_escritura_del on public.perro_medicamentos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy perros_escritura_ins on public.perros as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy perros_escritura_upd on public.perros as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy perros_escritura_del on public.perros as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy pesos_registrados_escritura_ins on public.pesos_registrados as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy pesos_registrados_escritura_upd on public.pesos_registrados as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy pesos_registrados_escritura_del on public.pesos_registrados as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy plantillas_contrato_escritura_ins on public.plantillas_contrato as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy plantillas_contrato_escritura_upd on public.plantillas_contrato as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy plantillas_contrato_escritura_del on public.plantillas_contrato as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy proveedores_escritura_ins on public.proveedores as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy proveedores_escritura_upd on public.proveedores as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy proveedores_escritura_del on public.proveedores as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy razas_grupo_escritura_ins on public.razas_grupo as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy razas_grupo_escritura_upd on public.razas_grupo as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy razas_grupo_escritura_del on public.razas_grupo as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy recetas_consumo_escritura_ins on public.recetas_consumo as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy recetas_consumo_escritura_upd on public.recetas_consumo as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy recetas_consumo_escritura_del on public.recetas_consumo as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy requisitos_sanitarios_aplicados_escritura_ins on public.requisitos_sanitarios_aplicados as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy requisitos_sanitarios_aplicados_escritura_upd on public.requisitos_sanitarios_aplicados as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy requisitos_sanitarios_aplicados_escritura_del on public.requisitos_sanitarios_aplicados as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy requisitos_sanitarios_propuestos_escritura_ins on public.requisitos_sanitarios_propuestos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy requisitos_sanitarios_propuestos_escritura_upd on public.requisitos_sanitarios_propuestos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy requisitos_sanitarios_propuestos_escritura_del on public.requisitos_sanitarios_propuestos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy reservas_escritura_ins on public.reservas as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy reservas_escritura_upd on public.reservas as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy reservas_escritura_del on public.reservas as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy series_pausas_escritura_ins on public.series_pausas as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy series_pausas_escritura_upd on public.series_pausas as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy series_pausas_escritura_del on public.series_pausas as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy series_recurrentes_escritura_ins on public.series_recurrentes as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy series_recurrentes_escritura_upd on public.series_recurrentes as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy series_recurrentes_escritura_del on public.series_recurrentes as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy servicios_escritura_ins on public.servicios as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy servicios_escritura_upd on public.servicios as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy servicios_escritura_del on public.servicios as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy sucursales_escritura_ins on public.sucursales as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy sucursales_escritura_upd on public.sucursales as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy sucursales_escritura_del on public.sucursales as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy tarifas_escritura_ins on public.tarifas as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy tarifas_escritura_upd on public.tarifas as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy tarifas_escritura_del on public.tarifas as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy tarifas_dia_semana_escritura_ins on public.tarifas_dia_semana as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy tarifas_dia_semana_escritura_upd on public.tarifas_dia_semana as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy tarifas_dia_semana_escritura_del on public.tarifas_dia_semana as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy tipos_contrato_escritura_ins on public.tipos_contrato as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy tipos_contrato_escritura_upd on public.tipos_contrato as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy tipos_contrato_escritura_del on public.tipos_contrato as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy tipos_requisito_sanitario_escritura_ins on public.tipos_requisito_sanitario as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy tipos_requisito_sanitario_escritura_upd on public.tipos_requisito_sanitario as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy tipos_requisito_sanitario_escritura_del on public.tipos_requisito_sanitario as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy turnos_caja_escritura_ins on public.turnos_caja as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy turnos_caja_escritura_upd on public.turnos_caja as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy turnos_caja_escritura_del on public.turnos_caja as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy vacaciones_movimientos_escritura_ins on public.vacaciones_movimientos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy vacaciones_movimientos_escritura_upd on public.vacaciones_movimientos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy vacaciones_movimientos_escritura_del on public.vacaciones_movimientos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));
create policy vinculacion_eventos_escritura_ins on public.vinculacion_eventos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.negocio_escribible()));
create policy vinculacion_eventos_escritura_upd on public.vinculacion_eventos as restrictive for update to authenticated, peludesk_definer
  using ((select public.negocio_escribible())) with check ((select public.negocio_escribible()));
create policy vinculacion_eventos_escritura_del on public.vinculacion_eventos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.negocio_escribible()));

-- Y en los archivos de los perros (lo demás de Storage solo lo escribe el
-- servidor con la secret key).
create policy perros_archivos_escritura_ins on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'perros-archivos' or public.negocio_escribible_en(public.negocio_de_archivo_perro(name)));
create policy perros_archivos_escritura_upd on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'perros-archivos' or public.negocio_escribible_en(public.negocio_de_archivo_perro(name)));
create policy perros_archivos_escritura_del on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'perros-archivos' or public.negocio_escribible_en(public.negocio_de_archivo_perro(name)));

CREATE OR REPLACE FUNCTION public.gastos_por_atender()
 RETURNS TABLE(id uuid, concepto text, categoria text, monto_estimado numeric, vencimiento date, dias integer, vencido boolean, recurrente_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.tiene_permiso('gastos') then
    raise exception 'Solo un admin, o quien tenga el permiso «Gastos», ve los gastos por pagar.';
  end if;
  -- Genera los esperados de las plantillas solo si el negocio admite
  -- escritura: en solo lectura (demo, prueba vencida) la lista se lee tal
  -- cual está.
  if public.negocio_escribible() then
    perform public.generar_gastos_esperados();
  end if;
  return query
  select g.id, g.concepto, c.nombre, g.monto_estimado, g.vencimiento,
    abs(g.vencimiento - public.fecha_negocio())::int,
    g.vencimiento < public.fecha_negocio(),
    g.recurrente_id
  from public.gastos g
  join public.categorias_gasto c on c.id = g.categoria_id
  where g.estado = 'pendiente' and g.deleted_at is null
    and g.vencimiento <= public.fecha_negocio() + 7
  order by g.vencimiento;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_invitacion_si_completa(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_invitacion public.invitaciones_cliente%rowtype;
  v_pendientes jsonb;
begin
  select * into v_invitacion
  from public.invitaciones_cliente
  where token = p_token and deleted_at is null;

  if not found then
    raise exception 'Este link no existe.' using errcode = 'P0001';
  end if;

  if v_invitacion.cliente_id is null or v_invitacion.alta_completada_at is null then
    return jsonb_build_object('completa', false, 'en_curso', false, 'contratos_pendientes', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', cp.id,
      'perro_id', cp.perro_id,
      'perro_nombre', cp.perro_nombre,
      'tipo_nombre', cp.tipo_nombre
    )), '[]'::jsonb)
    into v_pendientes
  from public.contratos_pendientes_de_alta(v_invitacion.cliente_id, v_invitacion.tipo) cp;

  -- Sin `for update` y solo si el negocio admite escritura: en PostgreSQL
  -- un SELECT ... FOR UPDATE también pasa por las políticas de UPDATE, y en
  -- solo lectura el link parecería no existir. Marcarlo usado es idempotente.
  if jsonb_array_length(v_pendientes) = 0
     and v_invitacion.usada_at is null
     and v_invitacion.cancelada_at is null
     and public.negocio_escribible() then
    update public.invitaciones_cliente
    set usada_at = now()
    where id = v_invitacion.id;
    v_invitacion.usada_at := now();
  end if;

  return jsonb_build_object(
    'completa', v_invitacion.usada_at is not null,
    'en_curso', v_invitacion.usada_at is null,
    'contratos_pendientes', v_pendientes
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.proteger_membresia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or coalesce(current_setting('app.asignacion_rol_interna', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.solo_lectura is distinct from old.solo_lectura then
    raise exception 'Solo la plataforma cambia si una cuenta es de solo lectura.';
  end if;
  if tg_op = 'UPDATE' and new.rol is distinct from old.rol and not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin puede cambiar el rol.';
  end if;
  if tg_op = 'UPDATE' and new.profile_id = auth.uid() and new.rol is distinct from old.rol then
    raise exception 'Nadie se cambia el rol a sí mismo.';
  end if;
  if tg_op = 'UPDATE' and new.cliente_id is distinct from old.cliente_id
     and not (public.current_rol() in ('admin', 'recepcion'))
     and coalesce(current_setting('app.vinculacion_interna', true), '') <> 'on' then
    raise exception 'Solo admin o recepción pueden vincular o desvincular un cliente.';
  end if;
  if tg_op = 'UPDATE' and (new.profile_id is distinct from old.profile_id or new.negocio_id is distinct from old.negocio_id) then
    raise exception 'Una membresía no cambia de persona ni de negocio.';
  end if;
  return new;
end;
$function$;

-- ── Registro de pruebas (peludesk.mx) ──
create table public.registros_prueba (
  id uuid primary key default gen_random_uuid(),
  telefono text not null,
  ip text,
  negocio_id uuid references public.negocios(id),
  persona_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.registros_prueba
  for each row execute function public.set_updated_at();
create index registros_prueba_telefono on public.registros_prueba (telefono);
create index registros_prueba_ip on public.registros_prueba (ip, created_at);
alter table public.registros_prueba enable row level security;
create policy registros_prueba_select on public.registros_prueba for select to authenticated
  using (public.es_admin_plataforma());
create policy registros_prueba_sin_escritura on public.registros_prueba for insert to authenticated
  with check (false);

-- ¿Se puede registrar otra prueba? NULL = sí; si no, por qué. Un teléfono,
-- una prueba (nunca más de una); una IP, 3 registros por día.
create or replace function public.puede_registrar_prueba(p_telefono text, p_ip text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.registros_prueba r where r.telefono = p_telefono and r.deleted_at is null)
      then 'Ese teléfono ya tiene un negocio en PeluDesk. Entra con él, o escríbenos si necesitas ayuda.'
    when p_ip is not null and (select count(*) from public.registros_prueba r
                               where r.ip = p_ip and r.created_at > now() - interval '1 day') >= 3
      then 'Se registraron varios negocios desde esta conexión hoy. Intenta mañana o escríbenos.'
  end;
$$;
revoke execute on function public.puede_registrar_prueba(text, text) from public, anon, authenticated;
grant execute on function public.puede_registrar_prueba(text, text) to service_role;

-- La primera dirección corta libre a partir de una base: la base, luego
-- base-2, base-3… (nunca una reservada ni una tomada).
create or replace function public.slug_libre(p_base text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base text := trim(both '-' from regexp_replace(lower(coalesce(p_base, '')), '[^a-z0-9]+', '-', 'g'));
  v text;
  i int := 1;
begin
  v_base := left(v_base, 36);
  v_base := trim(both '-' from v_base);
  if length(v_base) < 3 then v_base := 'negocio'; end if;
  loop
    v := case when i = 1 then v_base else v_base || '-' || i end;
    exit when v not in ('www', 'app', 'api', 'admin', 'mail', 'static', 'plataforma', 'soporte', 'demo', 'registro', 'ayuda', 'blog', 'precios')
          and not exists (select 1 from public.negocios n where n.slug = v);
    i := i + 1;
  end loop;
  return v;
end;
$$;
revoke execute on function public.slug_libre(text) from public, anon, authenticated;
grant execute on function public.slug_libre(text) to service_role;

-- Alta de un negocio en prueba: el negocio (configuración inicial copiada
-- del modelo), su admin y su fin de prueba. Solo el servidor, después de
-- crear la cuenta de la persona.
create or replace function public.registrar_negocio_prueba(
  p_nombre text, p_ciudad text, p_telefono text, p_ip text, p_persona_id uuid, p_modelo uuid, p_dias int default 30
)
returns table (negocio_id uuid, slug text, prueba_termina_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text;
  v_slug text;
  v_id uuid;
  v_fin timestamptz := now() + make_interval(days => p_dias);
begin
  if coalesce(auth.role(), '') <> 'service_role' and nullif(current_setting('request.jwt.claims', true), '') is not null then
    raise exception 'Solo el servidor registra pruebas.';
  end if;
  v_motivo := public.puede_registrar_prueba(p_telefono, p_ip);
  if v_motivo is not null then
    raise exception '%', v_motivo;
  end if;
  v_slug := public.slug_libre(p_nombre);
  v_id := public.crear_negocio(v_slug, btrim(p_nombre), 'America/Mexico_City', nullif(btrim(coalesce(p_ciudad, '')), ''), null, p_modelo);
  update public.negocios set plan = 'prueba', prueba_termina_at = v_fin where id = v_id;
  perform public.agregar_admin_negocio(v_id, p_persona_id);
  insert into public.registros_prueba (telefono, ip, negocio_id, persona_id) values (p_telefono, p_ip, v_id, p_persona_id);
  return query select v_id, v_slug, v_fin;
end;
$$;
revoke execute on function public.registrar_negocio_prueba(text, text, text, text, uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.registrar_negocio_prueba(text, text, text, text, uuid, uuid, int) to service_role;

-- ── La plataforma ve el plan, el fin de prueba y cuánto se usa ──
drop function public.plataforma_negocios();
create function public.plataforma_negocios()
returns table (id uuid, slug text, nombre text, dominio text, url_publica text, zona_horaria text, ciudad text,
               activo boolean, marca jsonb, created_at timestamptz, admins text[], clientes bigint,
               plan text, prueba_termina_at timestamptz, perros bigint, reservas bigint, cobros bigint,
               ultima_actividad timestamptz, ultimo_acceso timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  return query
    select n.id, n.slug, n.nombre, n.dominio, n.url_publica, n.zona_horaria, n.ciudad, n.activo, n.marca, n.created_at,
      array(select u.email::text from public.membresias m join auth.users u on u.id = m.profile_id
            where m.negocio_id = n.id and m.rol = 'admin' and m.deleted_at is null order by m.created_at),
      (select count(*) from public.clientes c where c.negocio_id = n.id and c.deleted_at is null),
      n.plan, n.prueba_termina_at,
      (select count(*) from public.perros p where p.negocio_id = n.id and p.deleted_at is null),
      (select count(*) from public.reservas r where r.negocio_id = n.id and r.deleted_at is null),
      (select count(*) from public.cobros c where c.negocio_id = n.id),
      greatest(
        (select max(c.created_at) from public.clientes c where c.negocio_id = n.id),
        (select max(r.created_at) from public.reservas r where r.negocio_id = n.id),
        (select max(c.created_at) from public.cobros c where c.negocio_id = n.id),
        (select max(t.created_at) from public.tarifas t where t.negocio_id = n.id)
      ),
      (select max(u.last_sign_in_at) from public.membresias m join auth.users u on u.id = m.profile_id
        where m.negocio_id = n.id and m.rol <> 'cliente' and m.deleted_at is null)
    from public.negocios n
    where n.deleted_at is null
    order by n.created_at;
end;
$$;
revoke execute on function public.plataforma_negocios() from public, anon;
grant execute on function public.plataforma_negocios() to authenticated;

-- negocio_publico: el plan y el fin de prueba (para el aviso de solo
-- lectura y el de días restantes). Nada más.
drop function public.negocio_publico();
create function public.negocio_publico()
returns table (id uuid, slug text, nombre text, dominio text, zona_horaria text, ciudad text, marca jsonb, landing jsonb,
               plan text, prueba_termina_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.slug, n.nombre, n.dominio, n.zona_horaria, n.ciudad, n.marca, n.landing, n.plan, n.prueba_termina_at
  from public.negocios n
  where n.id = public.negocio_actual() and n.activo and n.deleted_at is null;
$$;
grant execute on function public.negocio_publico() to anon, authenticated, service_role;

create or replace function public.auditoria_frontera()
returns table (tipo text, nombre text, detalle text)
language sql
stable
security definer
set search_path = ''
as $$
  with lista_blanca(nombre) as (values
    ('current_rol'), ('es_miembro'), ('mi_cliente_id'), ('rol_en_negocio'), ('tiene_permiso'), ('mis_permisos'),
    ('persona_en_negocio'), ('zona_negocio'), ('negocio_por_host'), ('mis_negocios'), ('is_admin'), ('is_staff'),
    ('mi_empleado_id'), ('puede_ver_empleado'), ('cuentas_para_empleado'), ('email_de_login_por_telefono'),
    ('existe_usuario_por_email'), ('listar_cuentas'), ('listar_cuentas_sin_vincular'), ('listar_cuentas_vinculadas'),
    ('listar_personal'), ('listar_personal_estetica'), ('handle_new_user'), ('negocio_de_archivo_perro'),
    ('es_dueno_de_archivo_perro'), ('proteger_membresia'), ('crear_negocio'), ('agregar_admin_negocio'),
    ('auditoria_frontera'), ('proteger_columnas_sensibles_profile'), ('asignar_rol_staff'),
    ('usuario_por_email'), ('negocio_publico'), ('email_de_persona_por_telefono'),
    ('persona_en_otro_negocio'), ('es_admin_plataforma'), ('agregar_admin_plataforma'),
    ('plataforma_negocios'), ('plataforma_buscar_personas'), ('plataforma_registrar_evento'),
    ('plataforma_actualizar_negocio'), ('membresia_no_plataforma'), ('plataforma_buscar_personas_por_id'), ('negocio_escribible'), ('negocio_escribible_en'),
    ('slug_libre'), ('registrar_negocio_prueba'), ('puede_registrar_prueba')
  ),
  compartidas(nombre) as (values ('razas'), ('tamanos_categoria'), ('tipos_pelaje'), ('unidades_medida'), ('profiles'), ('negocios'), ('plataforma_admins'), ('plataforma_eventos'), ('registros_prueba'))
  select 'funcion_definer_postgres', p.proname::text, pg_get_function_identity_arguments(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
    and p.proname not in (select nombre from lista_blanca)
  union all
  select 'tabla_sin_negocio', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not in (select nombre from compartidas)
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
  union all
  select 'tabla_sin_politica_negocio', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
    and c.relname not in (select nombre from compartidas)
    and (
      not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname
                  and pp.permissive = 'RESTRICTIVE' and pp.qual like '%negocio_actual()%' and pp.qual like '%es_miembro()%')
      or not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname
                     and 'peludesk_definer' = any(pp.roles) and pp.qual like '%negocio_actual()%')
      or not c.relrowsecurity
    )
  union all
  select 'vista_sin_security_invoker', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce('security_invoker=true' = any(c.reloptions), false)
  union all
  select 'politica_storage_sin_negocio', pp.policyname::text, coalesce(pp.qual, pp.with_check)
  from pg_policies pp
  where pp.schemaname = 'storage' and pp.tablename = 'objects'
    and coalesce(pp.qual, '') || coalesce(pp.with_check, '') ~ '(is_staff\(\)|current_rol\(\)|is_admin\(\))'
  union all
  -- Una función que llama a otra que ya no existe truena hasta que alguien
  -- la ejerce (así quedó handle_user_email_confirmed en el paso 2).
  select 'llamada_a_funcion_inexistente', r.proname::text, r.ref
  from (
    select distinct p.proname, (regexp_matches(pg_get_functiondef(p.oid), 'public[.]([a-z_0-9]+)[ ]*[(]', 'g'))[1] as ref
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  ) r
  where not exists (select 1 from pg_proc p2 where p2.proname = r.ref)
    and not exists (select 1 from pg_class c where c.relname = r.ref and c.relnamespace = 'public'::regnamespace);
$$;
revoke execute on function public.auditoria_frontera() from public, anon, authenticated;
grant execute on function public.auditoria_frontera() to service_role;
