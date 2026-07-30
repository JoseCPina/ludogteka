-- Bug real, encontrado probando la apertura de turno con JWT real:
-- abierto_por no tenía default auth.uid() (a diferencia de created_by,
-- que sí lo trae desde la creación de la tabla) — toda apertura desde la
-- pantalla, que no manda abierto_por explícito, tronaba con "null value
-- in column abierto_por violates not-null constraint". Mismo tipo de
-- descuido que ya pasó con created_by en servicios/tarifas (Fase 3/4):
-- el checklist de CLAUDE.md cubre created_by, pero abierto_por es
-- conceptualmente lo mismo con otro nombre y se escapó igual.
alter table public.turnos_caja
  alter column abierto_por set default auth.uid();
