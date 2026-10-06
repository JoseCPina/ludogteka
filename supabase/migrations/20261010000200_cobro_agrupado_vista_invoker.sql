-- La vista se reemplazó sin sus opciones: vuelve a ser security_invoker (la
-- RLS es la de quien consulta, no la del dueño de la vista).
alter view public.mp_ordenes_estado set (security_invoker = true);
