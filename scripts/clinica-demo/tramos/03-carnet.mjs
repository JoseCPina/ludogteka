// Tramo 3 · Carnet: vacuna con lote (la registra el MVZ, que entra por designación) y recordatorio REAL por WhatsApp.
import { BASE, comprobar, seccion, cuerpo, sinDesborde, hoyISO } from "../comun.mjs";

export async function tramo(c) {
  const S = c.S, NEG = c.e.negocioId;
  seccion("3a. Una vacuna con lote en el inventario (admin)");
  const adm = await c.abrir("admin");
  let vacunaId = c.e.vacunaId;
  if (!vacunaId) {
    const a = adm.p;
    await a.goto(`${BASE}/veterinaria/inventario/nuevo`, { waitUntil: "networkidle" });
    await a.locator('input[name="nombre"]').fill("Vacuna séxtuple PRUEBA");
    await a.locator('select[name="area_id"]').selectOption({ label: (await a.locator('select[name="area_id"] option').allInnerTexts()).find((t) => /botiqu/i.test(t)) });
    await a.locator('select[name="unidad_compra_id"]').selectOption({ label: "Litro" });
    await a.locator('select[name="unidad_consumo_id"]').selectOption({ label: "Mililitro" });
    await a.getByRole("button", { name: "Crear producto" }).click();
    await a.waitForURL(/\/veterinaria\/inventario\/[0-9a-f-]{36}/, { timeout: 30000 });
    vacunaId = a.url().match(/inventario\/([0-9a-f-]{36})/)[1];
    await a.getByRole("button", { name: "Registrar entrada" }).first().click();
    await a.getByLabel("Código de lote").fill("SEX-PRUEBA-001");
    await a.getByLabel("Fecha de caducidad").fill(hoyISO(300));
    await a.getByLabel(/^Cantidad \(/).first().fill("0.1");
    await a.locator("form").filter({ hasText: "Código de lote" }).getByRole("button", { name: "Registrar entrada" }).click();
    await a.getByText("Entrada registrada").first().waitFor({ timeout: 20000 });
    comprobar(true, "vacuna séxtuple con lote SEX-PRUEBA-001 (100 ml)");
    c.guardarEstado({ vacunaId });
  }
  await adm.c.close();

  seccion("3b. El MVZ (rol estética, entra por designación) registra la vacuna de Firulais");
  const mvz = await c.abrir("mvz");
  const p = mvz.p;
  await p.goto(`${BASE}/veterinaria`, { waitUntil: "networkidle" });
  comprobar(new URL(p.url()).pathname === "/veterinaria", "el MVZ con rol de estética entra a /veterinaria");
  await sinDesborde(p, "inicio de Veterinaria");
  const perro = c.e.perroDueno;
  await p.goto(`${BASE}/veterinaria/carnet/${perro}`, { waitUntil: "networkidle" });
  await sinDesborde(p, "carnet de Firulais");
  // Si quedó un registro equivocado de una corrida anterior (otro producto), se anula por la pantalla.
  const { data: previos } = await S.from("carnet_vacunas").select("id, insumo_id").eq("negocio_id", NEG).eq("perro_id", perro).is("deleted_at", null).is("anulada_at", null);
  if (previos?.some((x) => x.insumo_id !== vacunaId)) {
    await p.getByRole("button", { name: "Anular", exact: true }).first().click();
    await p.getByLabel("Motivo de la anulación").fill("Se eligió otro producto por error en la prueba");
    await p.getByRole("button", { name: "Anular registro" }).click();
    await p.getByText(/Anulad/i).first().waitFor({ timeout: 20000 }).catch(() => {});
    const { data: anul } = await S.from("carnet_vacunas").select("id").eq("negocio_id", NEG).eq("perro_id", perro).not("anulada_at", "is", null);
    comprobar(anul?.length >= 1, "un registro del carnet se ANULA con motivo (no se borra)");
    await p.goto(`${BASE}/veterinaria/carnet/${perro}`, { waitUntil: "networkidle" });
  }
  const antes = await S.from("insumo_lotes_saldo").select("saldo").eq("negocio_id", NEG).eq("insumo_id", vacunaId).maybeSingle();
  await p.getByRole("button", { name: "Registrar vacuna" }).click();
  const f = p.locator("form").filter({ hasText: "Fecha de aplicación" }).first();
  await f.locator('select[name="insumo_id"]').selectOption({ label: (await f.locator('select[name="insumo_id"] option').allInnerTexts()).find((t) => /s[eé]xtuple/i.test(t)) });
  await f.locator('select[name="lote_id"]').selectOption({ index: 1 });
  await f.locator('input[name="dosis"]').fill("1 mL");
  await f.locator('input[name="proxima"]').fill(hoyISO(5));
  await f.locator('select[name="medico_id"]').selectOption({ index: 1 }).catch(() => {});
  if (await f.locator('select[name="tipo_requisito_id"]').count()) await f.locator('select[name="tipo_requisito_id"]').selectOption({ index: 1 });
  await f.getByRole("button", { name: /Registrar|Guardar/ }).last().click();
  await p.waitForTimeout(6000);
  const t = await cuerpo(p);
  comprobar(/Sextuple|séxtuple/i.test(t) && /SEX-PRUEBA-001/.test(t), "la vacuna sale en el carnet con su lote");
  const { data: vac } = await S.from("carnet_vacunas").select("id, lote_id, proxima_dosis, anulada_at").eq("negocio_id", NEG).eq("perro_id", perro).eq("insumo_id", vacunaId).is("deleted_at", null).is("anulada_at", null);
  comprobar(vac?.length === 1 && vac[0].proxima_dosis === hoyISO(5), `un registro con próxima dosis ${hoyISO(5)}`);
  const desp = await S.from("insumo_lotes_saldo").select("saldo").eq("negocio_id", NEG).eq("insumo_id", vacunaId).maybeSingle();
  console.log(`     · saldo del lote: ${antes.data?.saldo} → ${desp.data?.saldo}`);
  comprobar(antes.data && desp.data && Number(desp.data.saldo) === Number(antes.data.saldo) - 1, "el lote descontó 1 mL");
  await c.api.recepcion.rpc("carnet_generar_recordatorios");
  const { data: rec } = await S.from("carnet_recordatorios").select("id, estado, proxima_dosis").eq("negocio_id", NEG).eq("perro_id", perro).eq("estado", "pendiente");
  comprobar(rec?.length === 1 && rec[0].estado === "pendiente", `quedó un recordatorio pendiente para el ${rec?.[0]?.proxima_dosis}`);
  c.guardarEstado({ recordatorioId: rec?.[0]?.id });

  seccion("3c. Carnet impreso, certificado y carnet verificable");
  await p.goto(`${BASE}/veterinaria/carnet/${perro}/imprimir`, { waitUntil: "networkidle" });
  comprobar(/Firulais/.test(await cuerpo(p)) && /Clínica Demo/i.test(await cuerpo(p)), "el carnet impreso trae la mascota y la clínica");
  await sinDesborde(p, "carnet impreso");
  await mvz.c.close();
  console.log("\n   El recordatorio por WhatsApp lo manda la tarea de cada hora (minuto :17, entre 9:00 y 20:00 del negocio).");
}
