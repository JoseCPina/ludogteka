// N125: el check-in y el check-out fuera del horario del negocio preguntan «El negocio está cerrado hoy; ¿registrar de
// todos modos?». Las auditorías y recorridos que no prueban eso (fuera-horario-dev.mjs sí) confirman y siguen, para dar
// el mismo resultado a cualquier hora.

/** Por la API: lo que se agrega al UPDATE de check-in / check-out (dentro del horario no cambia nada). */
export const CONFIRMA_FUERA_HORARIO = { checkin_fuera_horario: "confirmado", checkout_fuera_horario: "confirmado" };

/** En pantalla: después de «Confirmar check-in» o «Confirmar salida», si sale la pregunta, la confirma. */
export async function confirmarSiFueraDeHorario(page, espera = 4000) {
  const aviso = page.locator("[data-aviso-fuera-horario]");
  const salio = await aviso.first().waitFor({ timeout: espera }).then(() => true).catch(() => false);
  if (salio) await page.locator("[data-confirmar-fuera-horario]").click();
  return salio;
}
