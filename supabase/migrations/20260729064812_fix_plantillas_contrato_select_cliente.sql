-- Bug real, encontrado probando la firma con un cliente de verdad: la
-- política de SELECT de plantillas_contrato era solo para staff
-- (is_staff()), así que un cliente veía su propio contrato pero el join
-- embebido a plantillas_contrato(titulo, cuerpo) le regresaba null — la
-- firma hubiera fallado siempre para un dueño real ("No pudimos leer la
-- plantilla de este contrato"), porque firmar_contrato_digital() usa el
-- mismo cliente con sesión, sujeto al mismo RLS.
--
-- El texto de la plantilla no es información sensible del negocio (a
-- diferencia de, por ejemplo, perro_alertas) — el propio dueño necesita
-- leerla para saber qué está firmando. Mismo criterio que servicios/
-- tarifas: "el cliente sí ve esto, no es lo que hay que proteger".
drop policy plantillas_contrato_select_staff on public.plantillas_contrato;

create policy plantillas_contrato_select_autenticados on public.plantillas_contrato
  for select to authenticated
  using (true);
