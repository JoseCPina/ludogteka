// Tramo 6 · Hospitalización de Michi: ingreso, consentimiento firmado en pantalla, hoja de medicación, dosis que descuenta lote y monitoreo.
// (El alta va al final del tramo 7, después de aplicar la dosis del producto de Grupo I.)
import { BASE, comprobar, seccion, cuerpo, sinDesborde } from "../comun.mjs";

async function firmar(p) {
  await p.getByRole("button", { name: "Firmar en pantalla" }).click();
  const canvas = p.locator("canvas");
  await canvas.waitFor();
  await canvas.scrollIntoViewIfNeeded();
  const caja = await canvas.boundingBox();
  await p.mouse.move(caja.x + 30, caja.y + 40);
  await p.mouse.down();
  for (let i = 0; i < 12; i++) await p.mouse.move(caja.x + 30 + i * 12, caja.y + 40 + (i % 2 ? 40 : 0), { steps: 3 });
  await p.mouse.up();
  await p.getByRole("button", { name: "Confirmar firma" }).click();
  await p.getByText("Firmado", { exact: false }).first().waitFor({ timeout: 30000 });
}

export async function tramo(c) {
  const S = c.S, NEG = c.e.negocioId;
  const gato = c.e.gatoDueno;
  seccion("6a. Ingreso a hospitalización (MVZ)");
  const mvz = await c.abrir("mvz");
  const p = mvz.p;
  let hospId = c.e.hospId;
  if (!hospId) {
  await p.goto(`${BASE}/veterinaria/hospitalizacion?perro=${gato}`, { waitUntil: "networkidle" });
  await p.getByLabel("Motivo del ingreso").fill("Deshidratación y vómito (PRUEBA)");
  await p.locator('select[name="medico_id"]').first().selectOption({ index: 1 });
  await p.getByLabel("Ubicación (opcional)").fill("Jaula 2");
  await p.getByLabel("Depósito inicial (opcional)").fill("500");
  await p.getByLabel("Precio del día").fill("450");
  await sinDesborde(p, "ingreso a hospitalización");
  await p.getByRole("button", { name: "Ingresar a hospitalización" }).click();
  await p.waitForURL(/\/veterinaria\/hospitalizacion\/[0-9a-f-]{36}/, { timeout: 30000 });
  hospId = p.url().split("/").pop();
  c.guardarEstado({ hospId });
  const t0 = await cuerpo(p);
  comprobar(/Internada · día 1|Internado · día 1/.test(t0) && /Jaula 2/.test(t0), "queda internado, día 1");
  comprobar(/Total de la cuenta \$950\.00/.test(t0), "la cuenta trae el día ($450) y el depósito ($500)");
  comprobar(/Falta el consentimiento de hospitalización/.test(t0), "avisa que falta el consentimiento");
  }

  seccion("6b. Consentimiento firmado en pantalla");
  let consId = (await S.from("consentimientos").select("id").eq("negocio_id", NEG).eq("hospitalizacion_id", hospId).eq("estado", "pendiente_firma").limit(1).maybeSingle()).data?.id;
  if (consId) await p.goto(`${BASE}/veterinaria/consentimientos/${consId}`, { waitUntil: "networkidle" });
  else {
    await p.goto(`${BASE}/veterinaria/hospitalizacion/${hospId}`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Crear un consentimiento" }).click();
    await p.locator("select[name=medico_id]").last().selectOption({ index: 1 });
    await p.getByRole("button", { name: "Crear y firmar" }).click();
    await p.waitForURL(/\/veterinaria\/consentimientos\/[0-9a-f-]{36}/, { timeout: 30000 });
    consId = p.url().split("/").pop();
  }
  let t = await cuerpo(p);
  comprobar(!/\{\{/.test(t) && /Michi/.test(t) && /0000001/.test(t), "el texto sale con los campos llenos y la cédula de PRUEBA");
  await sinDesborde(p, "consentimiento");
  await firmar(p);
  await p.waitForTimeout(2000);
  const { data: f } = await S.from("consentimientos").select("estado, storage_path, hash_pdf").eq("id", consId).single();
  comprobar(f.estado === "firmado" && f.hash_pdf?.length === 64 && f.storage_path, "firmado con hash y PDF en Storage");

  seccion("6c. Hoja de medicación y dosis que descuenta lote");
  await p.goto(`${BASE}/veterinaria/hospitalizacion/${hospId}`, { waitUntil: "networkidle" });
  const { data: prob } = await S.from("insumos").select("id").eq("negocio_id", NEG).ilike("nombre", "Probiótico oral PRUEBA%").single();
  const antes = (await S.from("insumo_lotes_saldo").select("saldo").eq("negocio_id", NEG).eq("insumo_id", prob.id).single()).data.saldo;
  const { data: yaMed } = await S.from("hospitalizacion_medicacion").select("id").eq("hospitalizacion_id", hospId);
  if (!yaMed?.length) {
  await p.getByRole("button", { name: "Indicar medicación" }).first().click();
  await p.locator("select[name=insumo_id]").selectOption({ label: (await p.locator("select[name=insumo_id] option").allInnerTexts()).find((x) => /Probi/.test(x)) });
  await p.locator("input[name=dosis]").fill("2 mL");
  await p.locator("input[name=via]").fill("oral");
  await p.locator("input[name=frecuencia_horas]").fill("12");
  await p.locator("input[name=num_dosis]").fill("2");
  await p.locator("input[name=precio_dosis]").fill("60");
  await p.locator("select[name=medico_id]").last().selectOption({ index: 1 });
  await p.getByRole("button", { name: "Indicar medicación" }).last().click();
  await p.getByText("Medicación indicada").first().waitFor({ timeout: 30000 }).catch(() => {});
  }
  await p.reload({ waitUntil: "networkidle" });
  const nAplicar = await p.getByRole("button", { name: "Aplicar", exact: true }).count();
  comprobar(nAplicar === 2, `la hoja trae las dos dosis con su botón «Aplicar» (${nAplicar})`);
  await sinDesborde(p, "hoja de medicación");
  await p.getByRole("button", { name: "Aplicar", exact: true }).first().click();
  await p.locator("select[name=lote_id]").selectOption({ index: 1 });
  await p.locator("input[name=cantidad]").fill("2");
  await p.getByRole("button", { name: "Confirmar: ya se aplicó" }).click();
  await p.getByText("Dosis aplicada").first().waitFor({ timeout: 30000 }).catch(() => {});
  await p.reload({ waitUntil: "networkidle" });
  const desp = (await S.from("insumo_lotes_saldo").select("saldo").eq("negocio_id", NEG).eq("insumo_id", prob.id).single()).data.saldo;
  comprobar(Number(antes) - Number(desp) === 2, `la dosis descontó 2 mL del lote (${antes} → ${desp})`);
  comprobar(/La aplicó/.test(await cuerpo(p)) && /Total de la cuenta \$1,010\.00/.test(await cuerpo(p)), "queda con quién y cuándo, y se cobra la dosis ($60)");

  seccion("6d. Monitoreo y cargo");
  await p.getByRole("button", { name: "Registrar monitoreo" }).first().click();
  await p.locator("input[name=temperatura]").fill("38.7");
  await p.locator("input[name=peso]").fill("4.1");
  await p.getByLabel("Notas del turno").fill("Bebió agua, activo");
  await p.getByRole("button", { name: "Registrar monitoreo" }).last().click();
  await p.getByText("Monitoreo registrado").first().waitFor({ timeout: 30000 }).catch(() => {});
  await p.reload({ waitUntil: "networkidle" });
  comprobar(/38\.7 °C/.test(await cuerpo(p)) && /4\.1 kg/.test(await cuerpo(p)), "el monitoreo sale en la tabla");
  await p.getByRole("button", { name: "Agregar un procedimiento o cargo" }).click();
  await p.getByLabel("Qué se cobra").fill("Radiografía (PRUEBA)");
  await p.getByLabel("Importe").fill("450");
  await p.getByRole("button", { name: "Agregar a la cuenta" }).click();
  await p.getByText("Cargo agregado").first().waitFor({ timeout: 30000 }).catch(() => {});
  await p.reload({ waitUntil: "networkidle" });
  comprobar(/Total de la cuenta \$1,460\.00/.test(await cuerpo(p)), "el procedimiento suma a la cuenta");
  await mvz.c.close();
}
