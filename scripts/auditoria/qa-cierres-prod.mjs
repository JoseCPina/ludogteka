// Cuánto tarda cada cierre en PRODUCCIÓN, en negocios de QA, como celular con red lenta (400 ms de latencia, ~400
// kbps): desde que se aprieta el botón hasta que la pantalla enseña el resultado, y cuánto de eso fue la petición de la
// acción del servidor (y cuántos KB devolvió: una acción que vuelve a pintar páginas responde con todo su contenido).
//
//   node scripts/auditoria/qa-cierres-prod.mjs [--rapida] [--veces 2] [--solo cierre,checkin,checkout,firmar]
//
// · cierre   · prueba-qa-onboarding-estetica-s16: «Confirmar cierre» de una cita «PRUEBA QA cierres» en curso.
// · checkin  · prueba-qa-onboarding-hotel-s16: «Confirmar check-in» de una estancia de hotel de «PRUEBA QA S38 Perro Hotel».
// · checkout · la misma estancia: «Confirmar salida» (finaliza la estancia).
// · firmar   · prueba-qa-onboarding-vet-s16: «Sí, firmar» de una consulta nueva de «PRUEBA QA S39 Gato Vet».
//
// Lo que crea se cierra al terminar: la cuenta de la cita, la de la estancia y la de la consulta se cancelan («Error de
// captura»); la consulta firmada se queda (una consulta firmada no se borra).
// Sesiones por enlace mágico (scripts/lib/prod.mjs); las llaves se leen al vuelo y nunca se imprimen.
import { comoPersona, negocioPrueba } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { confirmarSiFueraDeHorario } from "../lib/fuera-horario.mjs";

const RAPIDA = process.argv.includes("--rapida");
const VECES = Number(process.argv.includes("--veces") ? process.argv[process.argv.indexOf("--veces") + 1] : 2);
const SOLO = process.argv.includes("--solo") ? process.argv[process.argv.indexOf("--solo") + 1].split(",") : null;
const toca = (n) => !SOLO || SOLO.includes(n);
const MARCA = "PRUEBA QA cierres";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const filas = [];
const cuentas = [];
const citas = [];

const nav = await abrirNavegador();

async function pantalla(NEG, rol) {
  const s = await NEG.sesion(rol);
  const c = await nav.newContext(RAPIDA ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await c.addCookies(s.cookies);
  const p = await c.newPage();
  p.setDefaultNavigationTimeout(120000);
  if (!RAPIDA) {
    const cdp = await c.newCDPSession(p);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 25 * 1024 });
  }
  // Cada petición de acción del servidor: cuánto tardó y cuánto pesó la respuesta.
  const acciones = [];
  p.on("requestfinished", async (r) => {
    if (r.method() !== "POST" || !r.headers()["next-action"]) return;
    const t = r.timing();
    const cuerpo = await r.response().then((x) => x?.body()).catch(() => null);
    acciones.push({ ms: Math.round(t.responseEnd), kb: cuerpo ? Math.round(cuerpo.length / 102.4) / 10 : null });
  });
  return { c, p, acciones, api: comoPersona(s.token, NEG.negocio.id) };
}

async function abrir(p, url) {
  await p.goto(url, { waitUntil: "domcontentloaded" });
  await p.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
}

/** Aprieta y espera a que `listo()` sea cierto. Devuelve los ms (null si a los 60 s no). */
async function medir(boton, listo) {
  const t0 = Date.now();
  await boton.click();
  while (Date.now() - t0 < 60000) {
    if (await listo()) return Date.now() - t0;
    await espera(100);
  }
  return null;
}

const describir = (nombre, k, ms, acciones, extra = "") => {
  const a = acciones.map((x) => `${x.ms} ms${x.kb == null ? "" : `, ${x.kb} KB`}`).join(" + ");
  filas.push(`${nombre} #${k + 1}: ${ms == null ? "SIGUE esperando a los 60 s" : `${ms} ms`} (acción del servidor: ${a || "—"})${extra}`);
};

try {
  if (toca("cierre")) {
    const EST = await negocioPrueba("prueba-qa-onboarding-estetica-s16");
    const s = await EST.sesion("admin");
    const api = comoPersona(s.token, EST.negocio.id);
    const { data: perro } = await EST.N.from("perros").select("id").eq("negocio_id", EST.negocio.id).eq("nombre", "PRUEBA QA S41 Perro Est").is("deleted_at", null).single();
    const { data: ultima } = await EST.N.from("citas_estetica").select("servicio_id, empleado_id").eq("perro_id", perro.id).order("created_at", { ascending: false }).limit(1).single();
    for (let k = 0; k < VECES; k++) {
      // Hoy, de madrugada y distinta en cada vuelta (no choca con otra cita de QA), y en curso como la deja «Iniciar cita».
      const { data: reservaId, error: e1 } = await api.rpc("crear_reserva_para_cita", { p_perro_id: perro.id });
      if (e1) throw new Error(`crear_reserva_para_cita: ${e1.message}`);
      cuentas.push({ api, reservaId });
      const hoy = (await api.rpc("fecha_negocio")).data;
      // De madrugada, a una hora al azar: si choca con otra cita de QA se prueba otra.
      let cita = null, e2 = null;
      for (let intento = 0; intento < 30 && !cita; intento++) {
        const hora = `0${Math.floor(Math.random() * 6)}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`;
        const inicio = new Date(`${hoy}T${hora}:00-06:00`).toISOString();
        ({ data: cita, error: e2 } = await api.from("citas_estetica").insert({ reserva_id: reservaId, perro_id: perro.id, servicio_id: ultima.servicio_id, empleado_id: ultima.empleado_id, inicio }).select("id").single());
      }
      if (!cita) throw new Error(`cita: ${e2?.message}`);
      citas.push({ api, N: EST.N, id: cita.id });
      const { error: e3 } = await api.from("citas_estetica").update({ estado: "en_curso", entregado_por_nombre: MARCA }).eq("id", cita.id);
      if (e3) throw new Error(`en curso: ${e3.message}`);

      const { c, p, acciones } = await pantalla(EST, "admin");
      await abrir(p, `${EST.base}/estetica/${cita.id}`);
      const finalizar = p.getByRole("button", { name: "Finalizar cita" });
      await finalizar.waitFor({ timeout: 60000 });
      // Con la red lenta el código tarda en llegar: se aprieta hasta que el botón responde.
      const recoge = p.locator("#cita-recoge-nombre");
      const t = Date.now();
      while (!(await p.locator("[data-confirmar-cierre]").count()) && Date.now() - t < 90000) {
        await finalizar.click().catch(() => {});
        await espera(1000);
      }
      if (await recoge.count()) {
        await recoge.fill(MARCA);
        await p.locator("[data-quien-recoge] button").first().click();
      }
      acciones.length = 0;
      const ms = await medir(p.locator("[data-confirmar-cierre]"), async () => !(await p.locator("[data-confirmar-cierre]").count()) && !(await p.getByRole("button", { name: "Finalizar cita" }).count()));
      const enBase = (await EST.N.from("citas_estetica").select("estado").eq("id", cita.id).single()).data?.estado;
      describir("Estética · «Confirmar cierre»", k, ms, acciones, `; base: ${enBase}`);
      await c.close();
    }
  }

  if (toca("checkin") || toca("checkout")) {
    const HOT = await negocioPrueba("prueba-qa-onboarding-hotel-s16");
    const s = await HOT.sesion("admin");
    const api = comoPersona(s.token, HOT.negocio.id);
    const { data: perro } = await HOT.N.from("perros").select("id, cliente_id").eq("negocio_id", HOT.negocio.id).eq("nombre", "PRUEBA QA S38 Perro Hotel").is("deleted_at", null).single();
    const { data: hotel } = await HOT.N.from("servicios").select("id").eq("negocio_id", HOT.negocio.id).eq("categoria", "hotel").eq("unidad", "noche").is("deleted_at", null).limit(1).single();
    const hoy = (await api.rpc("fecha_negocio")).data;
    const manana = new Date(new Date(`${hoy}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
    for (let k = 0; k < VECES; k++) {
      const { data: reserva, error: e1 } = await api.from("reservas").insert({ cliente_id: perro.cliente_id }).select("id").single();
      if (e1) throw new Error(`reserva: ${e1.message}`);
      cuentas.push({ api, reservaId: reserva.id });
      const { data: est, error: e2 } = await api.from("estancias").insert({
        reserva_id: reserva.id, perro_id: perro.id, servicio_id: hotel.id, fecha_entrada: hoy, fecha_salida: manana, dia_cerrado_confirmado: "confirmado",
        bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: MARCA, bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: MARCA,
      }).select("id").single();
      if (e2) throw new Error(`estancia: ${e2.message}`);

      const { c, p, acciones } = await pantalla(HOT, "admin");
      await abrir(p, `${HOT.base}/reservas/estancias/${est.id}/checkin`);
      if (toca("checkin")) {
        await p.locator("#checkin-entrega-quien").selectOption({ index: 1 });
        acciones.length = 0;
        const registrado = async () => (await p.getByText("Check-in registrado").count()) > 0;
        const ms = await medir(p.locator("[data-confirmar-checkin]"), async () => (await registrado()) || (await p.locator("[data-aviso-fuera-horario], [data-confirmar-sobrecupo]").count()) > 0);
        // Fuera de horario o sobrecupo: la pantalla pregunta (primer paso) y se mide aparte la confirmación (segundo).
        let ms2 = null;
        if (!(await registrado()) && ms != null) {
          const t1 = Date.now();
          if (!(await confirmarSiFueraDeHorario(p, 500)) && (await p.locator("[data-confirmar-sobrecupo]").count())) await p.locator("[data-confirmar-sobrecupo]").click();
          while (!(await registrado()) && Date.now() - t1 < 60000) await espera(100);
          ms2 = Date.now() - t1;
        }
        const enBase = (await HOT.N.from("estancias").select("estado").eq("id", est.id).single()).data?.estado;
        describir("Hotel · «Confirmar check-in»", k, ms, acciones, `${ms2 == null ? "" : `; fuera de horario: la pregunta en ${ms} ms y «Registrar de todos modos» en ${ms2} ms`}; base: ${enBase}`);
      } else {
        const { error } = await api.from("estancias").update({ estado: "en_curso", entregado_por_nombre: MARCA, checkin_fuera_horario: "confirmado" }).eq("id", est.id);
        if (error) throw new Error(`check-in: ${error.message}`);
      }

      if (toca("checkout")) {
        await abrir(p, `${HOT.base}/reservas/estancias/${est.id}/checkout`);
        await p.locator("#checkout-recoge-nombre").fill(MARCA);
        await p.getByRole("button", { name: "Sí, es el dueño" }).click();
        if (await p.locator("[data-entregue-todo]").count()) await p.locator("[data-entregue-todo]").click();
        acciones.length = 0;
        const salida = async () => (await p.getByText(/Salida registrada/).count()) > 0;
        const ms = await medir(p.getByRole("button", { name: "Confirmar salida" }), async () => (await salida()) || (await p.locator("[data-aviso-fuera-horario]").count()) > 0);
        let ms2 = null;
        if (!(await salida()) && ms != null) {
          const t1 = Date.now();
          await confirmarSiFueraDeHorario(p, 500);
          while (!(await salida()) && Date.now() - t1 < 60000) await espera(100);
          ms2 = Date.now() - t1;
        }
        const enBase = (await HOT.N.from("estancias").select("estado").eq("id", est.id).single()).data?.estado;
        describir("Hotel · «Confirmar salida» (finaliza la estancia)", k, ms, acciones, `${ms2 == null ? "" : `; fuera de horario: la pregunta en ${ms} ms y «Registrar de todos modos» en ${ms2} ms`}; base: ${enBase}`);
      }
      await c.close();
    }
  }

  if (toca("firmar")) {
    const VET = await negocioPrueba("prueba-qa-onboarding-vet-s16");
    const s = await VET.sesion("admin");
    const api = comoPersona(s.token, VET.negocio.id);
    const { data: gato } = await VET.N.from("perros").select("id").eq("negocio_id", VET.negocio.id).eq("nombre", "PRUEBA QA S39 Gato Vet").is("deleted_at", null).single();
    for (let k = 0; k < VECES; k++) {
      const { data: id, error: e1 } = await api.rpc("vet_consulta_iniciar", { p_perro: gato.id, p_cita: null, p_tipo: "consulta", p_medico: null });
      if (e1) throw new Error(`vet_consulta_iniciar: ${e1.message}`);
      const { error: e2 } = await api.rpc("vet_consulta_guardar", { p_id: id, p_datos: { motivo: MARCA, diagnosticos: [{ ref_id: null, origen: "libre", nombre: MARCA, tipo: "presuntivo", nota: "" }] } });
      if (e2) throw new Error(`vet_consulta_guardar: ${e2.message}`);
      // Sus cargos con precio de prueba (sin tocar el catálogo), para que se pueda firmar.
      const { data: cargos } = await api.rpc("vet_consulta_cargos", { p_consulta: id });
      for (const l of cargos?.lineas ?? cargos?.cargos ?? []) {
        if (l.precio == null || l.sin_precio) await api.rpc("vet_consulta_cargo_precio", { p_id: l.id, p_precio: 1, p_guardar_catalogo: false });
      }
      const { c, p, acciones } = await pantalla(VET, "admin");
      await abrir(p, `${VET.base}/veterinaria/consulta/${id}`);
      await p.getByRole("button", { name: "Firmar la consulta" }).click();
      acciones.length = 0;
      const ms = await medir(p.getByRole("button", { name: /^(Sí, firmar|Firmando…)$/ }), async () => (await p.locator("[data-consulta-firmada]").count()) > 0);
      const { data: c2 } = await VET.N.from("vet_consultas").select("estado").eq("id", id).single();
      // La cuenta a la que pasaron sus cargos de prueba.
      const { data: lineas } = await VET.N.from("vet_consulta_cargos").select("cargo_id").eq("consulta_id", id).not("cargo_id", "is", null);
      const { data: reservas } = lineas?.length ? await VET.N.from("cargos_aplicados").select("reserva_id").in("id", lineas.map((l) => l.cargo_id)) : { data: [] };
      for (const r of new Set((reservas ?? []).map((x) => x.reserva_id).filter(Boolean))) cuentas.push({ api, reservaId: r });
      describir("Veterinaria · «Sí, firmar»", k, ms, acciones, `; base: ${c2?.estado}`);
      await c.close();
    }
  }
} finally {
  await nav.close();
  // Una cita que se quedó en curso (la medición se cortó) se deshace antes de cancelar su cuenta.
  for (const { api, N, id } of citas) {
    const { data } = await N.from("citas_estetica").select("estado").eq("id", id).single();
    if (data?.estado === "en_curso") await api.rpc("deshacer_inicio_cita", { p_cita_id: id, p_destino: "cancelada", p_motivo: `${MARCA}: medición automática` });
  }
  for (const { api, reservaId } of cuentas) {
    const { error } = await api.rpc("cancelar_cuenta", { p_reserva_id: reservaId, p_motivo: "error_captura", p_motivo_texto: `${MARCA}: medición automática`, p_cancelar_cita: true });
    if (error) console.log(`  (no se canceló la cuenta ${reservaId}: ${error.message})`);
  }
}
console.log(`Cierres en producción · ${RAPIDA ? "escritorio, red normal" : "celular, red lenta (400 ms, ~400 kbps)"}`);
for (const f of filas) console.log(`  · ${f}`);
