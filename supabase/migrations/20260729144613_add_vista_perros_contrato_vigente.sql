-- Vigencia del contrato (decisión Fase 6 Bloque C): es por PERRO, sin
-- fecha de vencimiento. Un contrato firmado (digital o papel) sigue
-- vigente indefinidamente aunque después se publique una plantilla
-- nueva — publicar no reabre lo ya firmado (Bloque A), y una serie
-- recurrente (Fase 4) no debe pedirle al dueño re-firmar en cada
-- visita. Solo deja de contar si alguien lo cancela explícitamente
-- (cancelar_contrato, con motivo obligatorio) — no hay expiración
-- automática por calendario.
--
-- Por eso "vigente" se resuelve como existencia simple: al menos un
-- contrato de este perro en estado firmado_digital/firmado_papel que
-- no haya sido cancelado. No hace falta mirar "el más reciente": si
-- estaba firmado y se cancela, cancelar_contrato cambia su propio
-- estado a 'cancelado' (no crea una fila aparte), así que un
-- contrato cancelado nunca cuenta aunque haya sido el último firmado.
--
-- security_invoker = true, mismo patrón que
-- perro_requisitos_sanitarios_estado: respeta el RLS de quien
-- consulta (staff ve todos, el dueño solo el suyo).
create view public.perros_contrato_vigente
with (security_invoker = true)
as
select
  p.id as perro_id,
  exists (
    select 1
    from public.contratos c
    where c.perro_id = p.id
      and c.estado in ('firmado_digital', 'firmado_papel')
  ) as tiene_contrato_vigente
from public.perros p
where p.deleted_at is null;
