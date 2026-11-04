// N125: el check-in y el check-out fuera del horario del negocio preguntan «El negocio está cerrado hoy; ¿registrar de
// todos modos?». Las auditorías y recorridos que no prueban eso (fuera-horario-dev.mjs sí) confirman y siguen, para dar
// el mismo resultado a cualquier hora.

/** Por la API: lo que se agrega al UPDATE de check-in / check-out (dentro del horario no cambia nada). */
export const CONFIRMA_FUERA_HORARIO = { checkin_fuera_horario: "confirmado", checkout_fuera_horario: "confirmado" };

/**
 * QA S62 (N162): en el check-out, una salida que cambia el total o deja saldo enseña primero cómo queda la cuenta y se
 * vuelve a apretar «Confirmar salida» ahí. Devuelve el tipo de saldo que dijo (por_cobrar, pagada, a_favor) o null.
 */
export async function confirmarRevisionSalida(page, espera = 2500) {
  const caja = page.locator("[data-revision-salida]");
  const salio = await caja.first().waitFor({ timeout: espera }).then(() => true).catch(() => false);
  if (!salio) return null;
  const tipo = await caja.first().getAttribute("data-revision-salida");
  await caja.first().locator("[data-confirmar-checkout]").click();
  return tipo;
}

/** En pantalla: después de «Confirmar check-in» o «Confirmar salida», si sale la pregunta, la confirma. */
export async function confirmarSiFueraDeHorario(page, espera = 4000) {
  // Tras la revisión de la salida, la respuesta del servidor llega después: se espera más a la pregunta.
  const reviso = await confirmarRevisionSalida(page, 1500);
  const aviso = page.locator("[data-aviso-fuera-horario]");
  const salio = await aviso.first().waitFor({ timeout: reviso ? Math.max(espera, 15000) : espera }).then(() => true).catch(() => false);
  if (salio) await page.locator("[data-confirmar-fuera-horario]").click();
  return salio;
}
