// Tramo 8 · Teleconsulta. Con DAILY_API_KEY: sala real, liga por WhatsApp, entrada desde el celular y dictado durante la llamada.
// Sin la llave (hoy): se comprueba que la cita se agenda, que no se inventa una sala y que el mensaje dice qué falta.
import { BASE, comprobar, seccion, cuerpo, sinDesborde, hoyMx } from "../comun.mjs";

export async function tramo(c) {
  const S = c.S, NEG = c.e.negocioId;
  seccion("8. Teleconsulta (agendar y preparar la sala)");
  const rec = await c.abrir("recepcion");
  const r = rec.p;
  await r.goto(`${BASE}/veterinaria/agenda/nueva?perro=${c.e.gatoDueno}&fecha=${hoyMx()}`, { waitUntil: "networkidle" });
  await r.locator('select[name="tipo"]').waitFor({ timeout: 30000 });
  comprobar((await r.locator('select[name="tipo"] option[value="teleconsulta"]').count()) === 1, "«Teleconsulta» es un tipo de cita");
  await r.locator('select[name="tipo"]').selectOption("teleconsulta");
  await r.locator('select[name="medico_id"]').selectOption({ index: 0 });
  await r.locator('input[name="fecha"]').fill(hoyMx());
  await r.locator('input[name="hora"]').fill("18:30");
  await r.locator('textarea[name="motivo"]').fill("Seguimiento por video (PRUEBA)");
  await r.waitForTimeout(2500);
  await r.getByRole("button", { name: "Agendar cita" }).click();
  await r.waitForURL(/\/veterinaria\/teleconsulta\/[0-9a-f-]{36}/, { timeout: 40000 });
  const citaId = r.url().match(/teleconsulta\/([0-9a-f-]{36})/)[1];
  c.guardarEstado({ citaTele: citaId });
  await sinDesborde(r, "pantalla de la teleconsulta");
  const { data: sala } = await S.from("vet_telemedicina").select("proveedor").eq("negocio_id", NEG).eq("cita_id", citaId).maybeSingle();
  if (process.env.DAILY_API_KEY || sala) {
    comprobar(sala?.proveedor === "daily", "la sala es de Daily");
  } else {
    const t = await cuerpo(r);
    comprobar(/no pudimos crear la sala/i.test(t), "sin la llave de Daily, la cita queda agendada y la pantalla avisa que no se pudo crear la sala");
    await r.getByRole("button", { name: "Preparar la sala" }).click();
    await r.waitForTimeout(5000);
    const t2 = await cuerpo(r);
    comprobar(/falta la llave|no está configurada|todavía no está configurada/i.test(t2), `el mensaje dice qué falta (${(t2.match(/La videollamada[^.]*\./)?.[0] ?? t2.slice(-160))})`);
    comprobar(!sala, "no se inventó ninguna sala falsa en producción");
    console.log("     · NO PROBADO (falta DAILY_API_KEY): sala real, liga por WhatsApp (plantilla aprobada), entrada desde el celular y dictado en llamada.");
  }
  await rec.c.close();
}
