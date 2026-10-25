// Tramo 9 · Estancia de hotel de Firulais con un servicio extra y COBRO JUNTO de la estancia + la cuenta de la hospitalización de Michi.
import { BASE, comprobar, seccion, cuerpo, sinDesborde, hoyMx, hoyISO } from "../comun.mjs";
import { confirmarSiFueraDeHorario } from "../../lib/fuera-horario.mjs";

export async function tramo(c) {
  const S = c.S, NEG = c.e.negocioId;
  const firulais = c.e.perroDueno, cliente = c.e.clienteDueno;

  seccion("9a. Firulais cumple lo que pide el hotel (vacunas del carnet y evaluación)");
  const { data: reqs } = await S.from("tipos_requisito_sanitario").select("id, clave").eq("negocio_id", NEG).eq("obligatoria", true).is("deleted_at", null);
  const { data: yaV } = await S.from("carnet_vacunas").select("tipo_requisito_id").eq("negocio_id", NEG).eq("perro_id", firulais).is("anulada_at", null).not("tipo_requisito_id", "is", null);
  const hecho = new Set((yaV ?? []).map((x) => x.tipo_requisito_id));
  for (const r of reqs) {
    if (hecho.has(r.id)) continue;
    const { error } = await c.api.mvz.rpc("registrar_vacuna", { p_perro_id: firulais, p_biologico: `${r.clave} PRUEBA`, p_tipo_requisito_id: r.id, p_insumo_id: null, p_lote_id: null, p_lote_texto: "L-PRUEBA", p_laboratorio: null, p_fecha: hoyISO(-20), p_proxima: null, p_medico_id: c.e.medicoId, p_dosis: "1", p_notas: null, p_descontar: false });
    if (error) console.log(`     · ${r.clave}: ${error.message}`);
  }
  const ev = await c.api.recepcion.rpc("marcar_evaluacion_comportamiento", { p_perro_id: firulais, p_fecha: hoyISO(-10), p_notas: "Evaluación de prueba" });
  console.log(`     · evaluación: ${ev.error?.message ?? "ok"}`);
  const { data: pend } = await c.api.recepcion.rpc("pendientes_para_estancia", { p_perro_ids: [firulais] });
  comprobar(!(pend ?? []).some((x) => x.bloquea), `a Firulais ya no le bloquea nada (${(pend ?? []).filter((x) => x.bloquea).map((x) => x.clave).join(", ") || "libre"})`);

  seccion("9b. Recepción reserva una noche de hotel");
  const rec = await c.abrir("recepcion");
  const r = rec.p;
  if (!c.e.estanciaId) {
  await r.goto(`${BASE}/hotel/nueva`, { waitUntil: "networkidle" });
  await r.getByLabel("Buscar por perro, dueño o teléfono").fill("Firulais");
  await r.getByRole("button", { name: /Firulais/ }).first().click();
  await r.getByLabel("Firulais").first().check();
  await r.getByLabel("Entrada").first().fill(hoyMx());
  await r.getByLabel("Salida").first().fill(hoyISO(1));
  await sinDesborde(r, "nueva reserva de hotel");
  await r.getByRole("button", { name: "Crear reserva" }).click();
  await r.waitForTimeout(8000);
  const { data: est } = await S.from("estancias").select("id, reserva_id, estado").eq("negocio_id", NEG).eq("perro_id", firulais).is("deleted_at", null);
  comprobar(est?.length === 1, `la estancia de hotel quedó (${est?.[0]?.estado})`);
  if (!est?.length) { console.log((await cuerpo(r)).slice(0, 500)); await rec.c.close(); return; }
  c.guardarEstado({ estanciaId: est[0].id, reservaHotel: est[0].reserva_id });
  } else comprobar(true, "(la estancia ya estaba reservada)");

  seccion("9c. Check-in y servicio extra (paseo)");
  await r.goto(`${BASE}/hotel/checkin`, { waitUntil: "networkidle" });
  await sinDesborde(r, "lista de check-in de hotel");
  const { data: e1 } = await S.from("estancias").select("estado").eq("id", c.e.estanciaId).single();
  if (e1.estado === "reservada") {
    await r.goto(`${BASE}/reservas/estancias/${c.e.estanciaId}/checkin`, { waitUntil: "networkidle" });
    await sinDesborde(r, "check-in");
    await r.locator("#checkin-entrega-quien").selectOption("otra");
    await r.getByLabel("Nombre de la otra persona").fill("Cliente Demo (PRUEBA)");
    await r.getByRole("button", { name: "Confirmar check-in" }).click();
    await confirmarSiFueraDeHorario(r);
    await r.waitForTimeout(8000);
  }
  const { data: e2 } = await S.from("estancias").select("estado").eq("id", c.e.estanciaId).single();
  comprobar(e2.estado === "en_curso", `check-in hecho (${e2.estado})`);
  await r.goto(`${BASE}/reservas/estancias/${c.e.estanciaId}/checkin`, { waitUntil: "networkidle" });
  const { data: yaX } = await S.from("servicios_extra_aplicados").select("id").eq("negocio_id", NEG).eq("estancia_id", c.e.estanciaId).is("deleted_at", null);
  if (!yaX?.length) {
    const agregarBtn = r.getByRole("button", { name: /Agregar|servicio extra/i }).first();
    if (!(await r.getByLabel("Servicio extra").count()) && (await agregarBtn.count())) await agregarBtn.click();
    await r.getByLabel("Servicio extra").selectOption({ label: (await r.getByLabel("Servicio extra").locator("option").allInnerTexts()).find((t) => /Paseo/.test(t)) });
    await r.getByLabel("¿Qué pasó?").selectOption("hecho");
    await sinDesborde(r, "servicio extra en el check-in");
    await r.getByRole("button", { name: "Registrar y cobrar en la cuenta" }).click();
    await r.waitForTimeout(6000);
  }
  const { data: ext } = await S.from("servicios_extra_aplicados").select("estado, cargo_id").eq("negocio_id", NEG).eq("estancia_id", c.e.estanciaId).is("deleted_at", null);
  comprobar(ext?.length === 1 && ext[0].cargo_id, `el paseo ($80) quedó hecho y entró a la cuenta (${ext?.[0]?.estado})`);
  await rec.c.close();

  seccion("9d. Cobro junto: hotel + hospitalización de Michi (mismo dueño)");
  const { data: hosp } = await S.from("hospitalizaciones").select("reserva_id").eq("id", c.e.hospId).single();
  const cuentas = [c.e.reservaHotel, hosp.reserva_id];
  const rc = await c.abrir("recepcion");
  const q = rc.p;
  await q.goto(`${BASE}/caja`, { waitUntil: "networkidle" });
  await sinDesborde(q, "caja (cuentas abiertas)");
  const tc = await cuerpo(q);
  comprobar(/Cliente Demo/.test(tc) && /Cobrar todo junto|Total junto/i.test(tc), "Caja junta las cuentas de la misma persona («Total junto»)");
  await q.goto(`${BASE}/caja/cobrar-junto?cuentas=${cuentas.join(",")}`, { waitUntil: "networkidle" });
  await sinDesborde(q, "cobro junto");
  const tj = await cuerpo(q);
  console.log("     · " + tj.slice(0, 350));
  const m = /Registrar cobro de \$([\d,]+\.\d\d)/.exec(await q.getByRole("button", { name: /Registrar cobro de/ }).innerText());
  console.log("     · total a cobrar: $" + m?.[1]);
  await q.getByRole("button", { name: /Registrar cobro de/ }).click();
  await q.waitForTimeout(10000);
  const { data: grupo } = await S.from("cobros_grupo").select("id, monto_total").eq("negocio_id", NEG);
  comprobar(grupo?.length === 1, `un solo pago agrupado de $${grupo?.[0]?.monto_total}`);
  const { data: cobs } = await S.from("cobros").select("id, reserva_id, grupo_id").eq("negocio_id", NEG).in("reserva_id", cuentas);
  comprobar(cobs?.length === 2 && cobs.every((x) => x.grupo_id), "cada cuenta conserva su cobro, ligado al grupo");
  for (const r2 of cuentas) {
    const { data: t } = await c.api.recepcion.rpc("cuenta_totales_reserva", { p_reserva_id: r2 });
    const t0 = Array.isArray(t) ? t[0] : t;
    comprobar(Number(t0?.saldo) === 0, `la cuenta ${r2.slice(0, 8)} quedó en cero`);
  }
  await rc.c.close();
}
