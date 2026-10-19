// Tramo 7 · Receta simple Grupo II (original + 2 copias), espejo SITPV del Grupo I con uso hospitalario y parcialidades,
// el candado de salida, la dosis de Grupo I en la hospitalización, libro de control, reporte mensual y alta.
import fs from "node:fs";
import { BASE, comprobar, seccion, cuerpo, sinDesborde, tmp, hoyMx } from "../comun.mjs";

export async function tramo(c) {
  const S = c.S, NEG = c.e.negocioId;
  const perro = c.e.perroDueno;
  const { data: ket } = await S.from("insumos").select("id").eq("negocio_id", NEG).ilike("nombre", "Ketamina%").single();
  const { data: lotes } = await S.from("insumo_lotes").select("id").eq("negocio_id", NEG).eq("insumo_id", ket.id);

  seccion("7a. Receta simple de Grupo II (Enrofloxacina) a nombre del MVZ");
  const mvz = await c.abrir("mvz");
  const p = mvz.p;
  if (c.e.recetaId) { comprobar(true, "(la receta ya se había emitido en una corrida anterior)"); } else {
  await p.goto(`${BASE}/veterinaria/recetas/nueva?perro=${perro}&consulta=${c.e.consultaId}`, { waitUntil: "networkidle" });
  await sinDesborde(p, "nueva receta");
  const sel = p.locator("select").first();
  await sel.selectOption({ label: (await sel.locator("option").allInnerTexts()).find((t) => /Enrofloxacina/.test(t)) });
  await p.locator('input[name="dosis-0"]').fill("1 tableta");
  await p.locator('input[name="dn-0"]').fill("1");
  await p.locator('input[name="via-0"]').fill("oral");
  await p.locator('input[name="frec-0"]').fill("cada 12 horas");
  await p.locator('input[name="fh-0"]').fill("12");
  await p.locator('input[name="dur-0"]').fill("7");
  await p.locator('input[name="diagnostico"]').fill("Gastroenteritis aguda (PRUEBA)");
  await p.getByRole("button", { name: "Emitir receta" }).click();
  await p.waitForURL(/\/veterinaria\/recetas\/[0-9a-f-]{36}$/, { timeout: 40000 }).catch(() => {});
  const recetaId = p.url().match(/recetas\/([0-9a-f-]{36})/)?.[1];
  comprobar(recetaId, "la receta se emite");
  if (recetaId) {
    const t = await cuerpo(p);
    comprobar(/ORIGINAL/.test(t) && /COPIA 1/.test(t) && /COPIA 2/.test(t) && !/COPIA 3/.test(t), "sale el ORIGINAL y 2 copias");
    comprobar(/0000001/.test(t) && /Enrofloxacina/.test(t) && /14/.test(t), "con la cédula de PRUEBA, el medicamento y la cantidad calculada (14)");
    await sinDesborde(p, "receta");
    try {
      const pdf = await p.pdf({ format: "Letter" });
      fs.writeFileSync(tmp("receta-clinica-demo.pdf"), pdf);
      comprobar(pdf.slice(0, 5).toString() === "%PDF-" && pdf.length > 5000, `la receta se imprime a PDF (${pdf.length} bytes)`);
    } catch (e) { console.log(`     · no se pudo generar el PDF desde el navegador sin cabeza: ${e.message.slice(0, 80)}`); }
    c.guardarEstado({ recetaId });
  }
  }
  await mvz.c.close();

  seccion("7b. El admin asigna un bloque de folios del SITPV al MVZ");
  const adm = await c.abrir("admin");
  const a = adm.p;
  await a.goto(`${BASE}/veterinaria/medicos`, { waitUntil: "networkidle" });
  await sinDesborde(a, "médicos");
  if (!/9000 a 9020/.test(await cuerpo(a))) {
    await a.getByRole("button", { name: "Asignar folios" }).first().click();
    await a.getByLabel("Primer folio").fill("9000");
    await a.getByLabel("Último folio").fill("9020");
    await a.getByRole("button", { name: "Asignar bloque" }).click();
    await a.waitForTimeout(6000);
    await a.reload({ waitUntil: "networkidle" });
  }
  comprobar(/9000 a 9020/.test(await cuerpo(a)) && /21 disponibles|20 disponibles/.test(await cuerpo(a)), "un bloque de folios de PRUEBA (9000–9020) asignado");
  await adm.c.close();

  seccion("7c. Espejo del SITPV del Grupo I, de uso hospitalario y en parcialidades");
  const m2 = await c.abrir("mvz");
  const q = m2.p;
  await q.goto(`${BASE}/veterinaria/recetas/sitpv/nuevo?uso=hospitalario`, { waitUntil: "networkidle" });
  await sinDesborde(q, "espejo SITPV");
  const { data: yaEsp } = await S.from("vet_sitpv_recetas").select("id").eq("negocio_id", NEG).is("deleted_at", null);
  let espejoId = yaEsp?.[0]?.id;
  if (!espejoId) {
    await q.locator('select[name="insumo_id"]').selectOption({ index: 0 });
    await q.locator('input[name="registro_senasica"]').fill("Q-0000-000 PRUEBA");
    await q.locator('select[name="lote_id"]').selectOption({ label: (await q.locator('select[name="lote_id"] option').allInnerTexts()).find((t) => /KET-PRUEBA/.test(t)) });
    await q.locator('input[name="cantidad_total"]').fill("50");
    await q.locator('input[name="dosis"]').fill("5 mg/kg");
    await q.locator('input[name="intervalo"]').fill("dosis única");
    await q.locator('input[name="duracion"]').fill("1 día");
    await q.locator('input[name="comprobante_compra"]').fill("FAC-PRUEBA-001");
    await q.getByRole("button", { name: "Registrar", exact: true }).click();
    await q.waitForURL(/\/veterinaria\/recetas\/sitpv\/[0-9a-f-]{36}$/, { timeout: 40000 }).catch(() => {});
    espejoId = q.url().match(/sitpv\/([0-9a-f-]{36})/)?.[1];
  }
  comprobar(espejoId, "el espejo se registra con su folio");
  if (espejoId) {
    await q.goto(`${BASE}/veterinaria/recetas/sitpv/${espejoId}`, { waitUntil: "networkidle" });
    const t = await cuerpo(q);
    comprobar(/USO HOSPITALARIO/i.test(t) && /parcialidades/i.test(t) && /9000/.test(t), "las observaciones dicen USO HOSPITALARIO y parcialidades; folio 9000");
    comprobar(/CPA/.test(t) && /PRUEBA-CPA-001/.test(t), "lleva el CPA de PRUEBA del médico");
    await sinDesborde(q, "detalle del espejo");
    c.guardarEstado({ espejoId });
  }

  seccion("7d. El candado: el Grupo I no sale sin receta");
  const sinDoc = await c.api.admin.rpc("registrar_lote_salida", { p_lote_id: lotes[0].id, p_cantidad_consumo: 5, p_tipo: "surtido", p_motivo: null, p_folio_receta: "inventado" });
  comprobar(!!sinDoc.error && /controlado/i.test(sinDoc.error.message), `una salida directa del lote con un folio inventado se rechaza (${sinDoc.error?.message?.slice(0, 100) ?? "¡la aceptó!"})`);
  const mov = await S.from("movimientos_inventario").insert({ negocio_id: NEG, insumo_id: ket.id, tipo: "salida_consumo", cantidad_base: 5000 });
  comprobar(!!mov.error && /controlado/i.test(mov.error.message), `un consumo directo de inventario (como el de una venta o una receta de servicio) también (${mov.error?.message?.slice(0, 100) ?? "¡lo aceptó!"})`);
  const { data: mostr } = await S.from("insumos").select("se_vende").eq("id", ket.id).single();
  console.log(`     · Ketamina se_vende=${mostr?.se_vende}: en Venta rápida no se puede ofrecer al público`);

  seccion("7e. La dosis de Grupo I en la hospitalización pide el folio del SITPV");
  await q.goto(`${BASE}/veterinaria/hospitalizacion/${c.e.hospId}`, { waitUntil: "networkidle" });
  const { data: yaK } = await S.from("hospitalizacion_medicacion").select("id").eq("hospitalizacion_id", c.e.hospId).eq("insumo_id", ket.id);
  if (!yaK?.length) {
    await q.getByRole("button", { name: "Indicar medicación" }).first().click();
    await q.locator("select[name=insumo_id]").selectOption({ label: (await q.locator("select[name=insumo_id] option").allInnerTexts()).find((x) => /Ketamina/.test(x)) });
    await q.locator("input[name=dosis]").fill("0.5 mL");
    await q.locator("input[name=via]").fill("IM");
    await q.locator("input[name=num_dosis]").fill("1");
    await q.locator("select[name=medico_id]").last().selectOption({ index: 1 });
    await q.getByRole("button", { name: "Indicar medicación" }).last().click();
    await q.getByText("Medicación indicada").first().waitFor({ timeout: 30000 }).catch(() => {});
  }
  await q.reload({ waitUntil: "networkidle" });
  const fila = q.locator("li, div").filter({ hasText: "Ketamina" }).filter({ has: q.getByRole("button", { name: "Aplicar", exact: true }) }).last();
  await fila.getByRole("button", { name: "Aplicar", exact: true }).click();
  await q.locator("select[name=lote_id]").selectOption({ index: 1 });
  await q.locator("input[name=cantidad]").fill("0.5");
  await q.getByRole("button", { name: "Confirmar: ya se aplicó" }).click();
  await q.waitForTimeout(6000);
  const tBloq = await cuerpo(q);
  comprobar(/Grupo I|folio/i.test(tBloq) && !/Dosis aplicada/.test(tBloq), "sin elegir folio la aplicación se bloquea y dice por qué");
  await q.locator("select[name=espejo_id]").selectOption({ index: 1 });
  await q.getByRole("button", { name: "Confirmar: ya se aplicó" }).click();
  await q.getByText("Dosis aplicada").first().waitFor({ timeout: 30000 }).catch(() => {});
  await q.waitForTimeout(4000);
  const { data: saldo } = await S.from("insumo_lotes_saldo").select("saldo").eq("negocio_id", NEG).eq("insumo_id", ket.id).single();
  comprobar(Number(saldo.saldo) === 499.5, `con el folio, descuenta del lote (${saldo.saldo} ml)`);

  seccion("7f. Libro de control y reporte mensual");
  const adm2 = await c.abrir("admin");
  const l = adm2.p;
  await l.goto(`${BASE}/veterinaria/libro-control`, { waitUntil: "networkidle" });
  const tl = await cuerpo(l);
  comprobar(/Ketamina/.test(tl) && /USO HOSPITALARIO|Michi/i.test(tl) && /9000/.test(tl), "el libro trae la salida de ketamina con el folio 9000 y el paciente");
  await sinDesborde(l, "libro de control");
  const xl = await l.request.get(`${BASE}/api/veterinaria/libro-control/excel?desde=${hoyMx()}&hasta=${hoyMx()}`);
  comprobar(xl.ok() && (await xl.body()).length > 2000, `el Excel del libro se descarga (${xl.status()})`);
  await l.goto(`${BASE}/veterinaria/recetas/sitpv/reporte`, { waitUntil: "networkidle" });
  comprobar(/reporte/i.test(await cuerpo(l)), "el reporte mensual abre (el mes en curso no se puede marcar como reportado hasta que termine)");
  await sinDesborde(l, "reporte mensual SITPV");
  await adm2.c.close();

  seccion("7g. Alta de la hospitalización");
  await q.goto(`${BASE}/veterinaria/hospitalizacion/${c.e.hospId}`, { waitUntil: "networkidle" });
  await q.getByLabel("Resumen del alta").fill("Sale estable, dieta blanda cinco días (PRUEBA).");
  await q.getByRole("button", { name: "Dar de alta" }).click();
  await q.getByText("Alta registrada").first().waitFor({ timeout: 30000 }).catch(() => {});
  await q.reload({ waitUntil: "networkidle" });
  const ta = await cuerpo(q);
  comprobar(/Dada de alta|Dado de alta/.test(ta) && /Sale estable/.test(ta), "el alta cierra la hospitalización");
  comprobar((await q.getByRole("button", { name: "Dar de alta" }).count()) === 0, "y ya no hay botones para operar");
  await m2.c.close();
}
