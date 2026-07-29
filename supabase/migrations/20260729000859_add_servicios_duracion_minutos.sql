-- Hueco real de Fase 3: el catálogo nunca guardó cuánto dura una cita de
-- estética, solo el precio. Fase 4 lo necesita para el calendario de
-- citas (bloquear el horario de un empleado, punto 3 de las preguntas
-- respondidas). Nullable a nivel de columna, pero obligatorio para
-- categoria = 'estetica' vía check — mismo patrón que los campos
-- exclusivos de bono en Fase 3.
alter table public.servicios
  add column duracion_minutos int;

-- Valores supuestos, sin confirmar con el negocio — igual que la
-- vigencia_dias del bono en el seed de Fase 3. Ajustar cuando el negocio
-- los confirme.
update public.servicios set duracion_minutos = 60 where clave = 'estetica_bano';
update public.servicios set duracion_minutos = 90 where clave = 'estetica_corte';
update public.servicios set duracion_minutos = 60 where clave = 'estetica_deslanado';
update public.servicios set duracion_minutos = 15 where clave = 'estetica_unas';
update public.servicios set duracion_minutos = 15 where clave = 'estetica_oidos';
update public.servicios set duracion_minutos = 120 where clave = 'estetica_combo_bano_corte';
update public.servicios set duracion_minutos = 150 where clave = 'estetica_combo_completo';

alter table public.servicios
  add constraint servicios_duracion_solo_estetica check (
    (categoria = 'estetica' and duracion_minutos is not null and duracion_minutos > 0)
    or
    (categoria <> 'estetica' and duracion_minutos is null)
  );
