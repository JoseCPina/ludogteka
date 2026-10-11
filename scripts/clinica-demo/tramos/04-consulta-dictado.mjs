// Tramo 4 · Cita clínica, consulta con dictado REAL (Scribe + Claude), firma y adenda.
import { BASE, comprobar, seccion, cuerpo, sinDesborde, hoyMx } from "../comun.mjs";

export async function tramo(c) {
  const S = c.S, NEG = c.e.negocioId;
  const perro = c.e.perroDueno;
  const hoy = hoyMx();
  seccion("4a. Recepción agenda la cita clínica de Firulais con el MVZ");
  const rec = await c.abrir("recepcion");
  const r = rec.p;
  await r.goto(`${BASE}/veterinaria/agenda/nueva?perro=${perro}&fecha=${hoy}`, { waitUntil: "networkidle" });
  await sinDesborde(r, "formulario de cita clínica");
  await r.locator('select[name="tipo"]').selectOption("consulta");
  await r.locator('select[name="medico_id"]').selectOption({ index: 0 });
  await r.locator('input[name="fecha"]').fill(hoy);
  await r.locator('input[name="hora"]').fill("20:30");
  await r.locator('textarea[name="motivo"]').fill("Vómito desde ayer");
  await r.getByRole("button", { name: "Agendar cita" }).click();
  await r.waitForURL(/\/veterinaria\/agenda\?fecha=/, { timeout: 30000 });
  comprobar(/Firulais/.test(await cuerpo(r)), "la cita sale en la agenda clínica");
  await sinDesborde(r, "agenda clínica");
  await rec.c.close();

  seccion("4b. El MVZ inicia la consulta y la dicta (micrófono falso con un dictado en español)");
  const mvz = await c.abrir("mvz", { permisos: ["microphone"] });
  const p = mvz.p;
  await p.goto(`${BASE}/veterinaria/agenda?fecha=${hoy}`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Iniciar consulta" }).first().click();
  await p.waitForURL(/\/veterinaria\/consulta\//, { timeout: 30000 });
  const consultaId = p.url().split("/").pop();
  c.guardarEstado({ consultaId });
  await sinDesborde(p, "consulta (borrador)");
  await p.getByRole("button", { name: "Dictar", exact: true }).waitFor({ timeout: 30000 });
  await p.getByRole("button", { name: "Dictar", exact: true }).click();
  comprobar(/ElevenLabs/.test(await cuerpo(p)) && /Anthropic/.test(await cuerpo(p)), "antes de grabar avisa a qué servicios va el audio");
  await p.getByLabel(/Ya le avisé al dueño/).check();
  await p.getByRole("button", { name: "Empezar a grabar" }).click();
  await p.getByRole("timer").waitFor({ timeout: 15000 });
  await p.waitForTimeout(33000);
  await p.getByRole("button", { name: "Detener y transcribir" }).click();
  const hecho = await p.getByText("Borrador hecho con IA").waitFor({ timeout: 180000 }).then(() => true).catch(() => false);
  const t = await cuerpo(p);
  comprobar(hecho, `Scribe y Claude arman el borrador en producción (${hecho ? "ok" : t.slice(0, 200)})`);
  if (hecho) {
    const tn = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    comprobar(/vomito/.test(tn) && /dieta blanda/.test(tn), "el borrador conserva lo dictado");
    comprobar(/39[.,]5/.test(t), "con los signos vitales dictados");
    await sinDesborde(p, "borrador del dictado");
    await p.getByRole("button", { name: "Pasar al expediente" }).click();
    await p.getByText("Pasado al expediente").waitFor({ timeout: 20000 });
    await p.waitForTimeout(4000);
  }
  const { data: dict } = await S.from("vet_dictados").select("estado, minutos_cobrados, audio_path, audio_borrado_at").eq("negocio_id", NEG).eq("consulta_id", consultaId);
  comprobar(dict?.length === 1 && dict[0].estado === "listo" && !dict[0].audio_path && dict[0].audio_borrado_at, `un dictado en el registro de uso: ${dict?.[0]?.minutos_cobrados} min y el audio borrado`);

  seccion("4c. Diagnóstico del catálogo, firma con cédula y adenda");
  const { data: antes } = await S.from("vet_consultas").select("diagnosticos, estado").eq("id", consultaId).single();
  if (!(antes.diagnosticos ?? []).length) {
    await p.getByLabel("Buscar diagnóstico").fill("gastroenteritis");
    await p.locator("ul li button").filter({ hasText: /gastro/i }).first().click({ timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(3000);
  }
  await p.getByRole("button", { name: "Firmar la consulta" }).click();
  await p.getByText(/Firmada por|Firmada/).first().waitFor({ timeout: 30000 }).catch(() => {});
  const { data: firmada } = await S.from("vet_consultas").select("estado, firma_hash, firma_cedula, firmada_at").eq("id", consultaId).single();
  comprobar(firmada?.estado === "firmada" && firmada.firma_hash && /PRUEBA/.test(firmada.firma_cedula ?? ""), `firmada con la cédula de PRUEBA y su huella (${firmada?.estado})`);
  await sinDesborde(p, "consulta firmada");
  await p.getByLabel("Adenda").fill("Adenda de prueba: el dueño reporta que ya comió un poco.");
  await p.getByRole("button", { name: "Firmar adenda" }).click();
  await p.getByText("Adenda agregada").first().waitFor({ timeout: 20000 }).catch(() => {});
  const { count } = await S.from("vet_consulta_adendas").select("id", { count: "exact", head: true }).eq("negocio_id", NEG).eq("consulta_id", consultaId);
  comprobar(count === 1, "la adenda quedó firmada aparte");
  const intento = await c.api.mvz.from("vet_consultas").select("id").limit(1);
  comprobar(!(intento.data ?? []).length, "la API no deja leer las consultas directo (solo por funciones con permiso)");
  await mvz.c.close();
}
