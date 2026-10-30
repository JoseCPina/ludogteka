// QA R59 en PRODUCCIÓN, en los negocios PRUEBA de QA s16 (y solo ahí), con navegador. Se corre ANTES de desplegar (debe
// fallar: reproduce lo que vio QA) y DESPUÉS (debe pasar en el mismo negocio y la misma pantalla). Sale con 1 si algo
// sigue mal.
//
//   node scripts/auditoria/qa-r59-prod.mjs [--escribir] [--solo n148|n144|n146] [--fotos]
//
// N148 · corte ciego (prueba-qa-onboarding-estetica-s16, Caja → Turno → «Cerrar turno — arqueo»). Con un turno abierto que
//   tiene cobros, ni el HTML de la pantalla ni NINGUNA respuesta que llegue al navegador antes de «Enviar conteo» trae un
//   monto esperado: el neto de cada método, lo cobrado, las propinas, el efectivo esperado (fondo + efectivo − retiros +
//   agregado) ni el total. Tampoco Reportes (hoy) ni su desglose por método. Con --escribir, si no hay turno abierto con
//   cobros, se abre uno (fondo $0), se cobra una cuenta con saldo ($137.50 en efectivo y $62.50 por transferencia), se
//   mide, el cobro se anula (anular_cobro) y el turno se cierra en $0: la cuenta queda como estaba, con el cobro anulado
//   en su historial. NUNCA se manda el conteo desde la pantalla.
// N144 · estancia finalizada sin cargos (prueba-qa-onboarding-hotel-s16): el detalle de la reserva y el check-out NO
//   dicen «Ninguno todavía» ni enseñan el bloque «Cargos aplicados»; la base y el total sí.
// N146 · estado junto al título (estética s16 y hotel s16): el detalle de una cita de estética en cada estado que exista
//   (reservada, confirmada, en curso, finalizada, no llegó, cancelada) enseña la insignia con el texto de la agenda junto
//   al título; con «Pide cambio» del recordatorio, ese chip también. La reserva y el check-out de una estancia, igual.
//
// Sesiones por enlace mágico (scripts/lib/prod.mjs); las llaves se leen al vuelo y nunca se imprimen.
import os from "node:os";
import path from "node:path";
import { comoPersona, negocioPrueba } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const ESCRIBIR = process.argv.includes("--escribir");
const FOTOS = process.argv.includes("--fotos");
const SOLO = process.argv.includes("--solo") ? process.argv[process.argv.indexOf("--solo") + 1] : null;
const toca = (n) => !SOLO || SOLO === n;
const hallazgos = [];
const bien = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const ver = (t) => console.log(`    · ${t}`);
const foto = async (p, nombre) => {
  if (!FOTOS) return;
  const ruta = path.join(os.tmpdir(), `qa-r59-${nombre}.png`);
  await p.screenshot({ path: ruta, fullPage: true });
  ver(`foto: ${ruta}`);
};
const limpio = (t) => t.replace(/\s+/g, " ").trim();

// Cómo puede salir un monto: «$1,234.50», «1,234.50», «1234.50», «1234.5» (JSON).
function formas(n) {
  const fijo = n.toFixed(2);
  const miles = Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const corto = String(Number(fijo));
  return [...new Set([`$${miles}`, miles, fijo, corto.includes(".") ? corto : null].filter(Boolean))];
}
function buscar(texto, montos) {
  const hallados = [];
  for (const [nombre, valor] of montos) {
    for (const f of formas(valor)) {
      // Que no sea parte de otro número (p. ej. 62.50 dentro de 162.50).
      const re = new RegExp(`(^|[^0-9.,])${f.replace(/[$.,]/g, (c) => `\\${c}`)}(?![0-9])`);
      if (re.test(texto)) { hallados.push(`${nombre} (${f})`); break; }
    }
  }
  return hallados;
}

const nav = await abrirNavegador();
async function pagina(X, sesion) {
  const c = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addCookies(sesion.cookies);
  const p = await c.newPage();
  p.setDefaultNavigationTimeout(60000);
  return p;
}

try {
  // ───────────────────────────── N148 ─────────────────────────────
  if (toca("n148")) {
    console.log("\nN148 · corte ciego en prueba-qa-onboarding-estetica-s16");
    const EST = await negocioPrueba("prueba-qa-onboarding-estetica-s16");
    const sesion = await EST.sesion("admin");
    const api = comoPersona(sesion.token, EST.negocio.id);
    let { data: turno } = await api.from("turnos_caja").select("id, fondo_inicial").eq("estado", "abierto").maybeSingle();
    const conDinero = async (t) => ((await api.rpc("resumen_turno", { p_turno_id: t.id })).data ?? []).filter((r) => Number(r.cobrado) || Number(r.propinas) || Number(r.devuelto));
    let abriTurno = false, cobroId = null;
    if (!turno || (await conDinero(turno)).length === 0) {
      if (!ESCRIBIR) {
        mal("no hay un turno abierto con cobros en estética s16: corre con --escribir para armar uno");
      } else {
        if (!turno) {
          turno = (await api.from("turnos_caja").insert({ fondo_inicial: 0, notas_apertura: "Verificación QA R59 (N148): corte ciego" }).select("id, fondo_inicial").single()).data;
          abriTurno = true;
        }
        // Una cuenta con saldo de al menos $200 (citas de estética de este negocio de pruebas).
        const { data: citas } = await EST.N.from("citas_estetica").select("reserva_id").eq("negocio_id", EST.negocio.id).is("deleted_at", null).in("estado", ["finalizada", "en_curso", "reservada", "confirmada"]).limit(200);
        let reservaId = null;
        for (const c of citas ?? []) {
          const { data: t } = await api.rpc("cuenta_totales_reserva", { p_reserva_id: c.reserva_id });
          if (Number(t?.[0]?.saldo ?? 0) >= 200) { reservaId = c.reserva_id; break; }
        }
        if (!reservaId) throw new Error("No encontré una cuenta con saldo de $200 en estética s16.");
        const { error } = await api.rpc("registrar_cobro", {
          p_reserva_id: reservaId, p_notas: "Verificación QA R59 (N148), se anula enseguida",
          p_metodos: [{ metodo: "efectivo", monto: 137.5, propina: 0 }, { metodo: "transferencia", monto: 62.5, propina: 0 }],
        });
        if (error) throw new Error(`registrar_cobro: ${error.message}`);
        cobroId = (await api.from("cobros").select("id").eq("reserva_id", reservaId).is("anulado_at", null).order("created_at", { ascending: false }).limit(1).single()).data?.id ?? null;
        ver(`turno ${abriTurno ? "abierto para la prueba" : "que ya estaba abierto"}; cobro de $200 (efectivo $137.50 + transferencia $62.50) en la reserva ${reservaId}`);
      }
    }
    try {
      if (turno && (await conDinero(turno)).length) {
        // Lo esperado, de la base (resumen_turno + fondo + retiros y efectivo agregado vivos).
        const resumen = (await api.rpc("resumen_turno", { p_turno_id: turno.id })).data ?? [];
        const { data: movs } = await api.from("movimientos_caja").select("monto, tipo").eq("turno_id", turno.id).is("deleted_at", null);
        const retiros = (movs ?? []).filter((m) => m.tipo !== "ingreso").reduce((s, m) => s + Number(m.monto), 0);
        const agregado = (movs ?? []).filter((m) => m.tipo === "ingreso").reduce((s, m) => s + Number(m.monto), 0);
        const neto = (m) => resumen.filter((r) => r.metodo === m).reduce((s, r) => s + Number(r.cobrado) + Number(r.propinas) - Number(r.devuelto), 0);
        const montos = new Map();
        for (const m of ["efectivo", "terminal", "transferencia", "tarjeta_manual"]) {
          if (neto(m)) montos.set(`neto ${m}`, neto(m));
          for (const r of resumen.filter((x) => x.metodo === m)) if (Number(r.cobrado)) montos.set(`cobrado ${m} ${r.origen}`, Number(r.cobrado));
        }
        const esperadoEfectivo = Number(turno.fondo_inicial) + neto("efectivo") - retiros + agregado;
        if (esperadoEfectivo) montos.set("efectivo esperado", esperadoEfectivo);
        const total = ["efectivo", "terminal", "transferencia", "tarjeta_manual"].reduce((s, m) => s + neto(m), 0);
        if (total) montos.set("total del turno", total);
        // Lo que la pantalla enseña a propósito (fondo, retiros, efectivo agregado) no cuenta como fuga si coincide.
        const visibles = new Set([Number(turno.fondo_inicial), retiros, agregado, ...(movs ?? []).map((m) => Number(m.monto))].map((n) => n.toFixed(2)));
        for (const [k, v] of [...montos]) if (visibles.has(v.toFixed(2)) || v === 0) { ver(`${k} ${v.toFixed(2)} coincide con un monto que la pantalla enseña a propósito: no se busca`); montos.delete(k); }
        ver(`montos esperados que NO deben aparecer: ${[...montos].map(([k, v]) => `${k} ${v.toFixed(2)}`).join(" · ")}`);

        const p = await pagina(EST, sesion);
        const respuestas = [];
        p.on("response", async (r) => {
          if (!r.url().startsWith(EST.base)) return;
          const tipo = r.headers()["content-type"] ?? "";
          if (!/html|text\/x-component|json|javascript/.test(tipo) || /\/_next\/static\//.test(r.url())) return;
          try { respuestas.push({ url: r.url(), cuerpo: await r.text() }); } catch { /* sin cuerpo */ }
        });
        await p.goto(`${EST.base}/caja/turno`);
        await p.waitForLoadState("networkidle").catch(() => {});
        await p.getByRole("button", { name: /^Cerrar turno$/ }).first().click();
        await p.getByText("Cerrar turno — arqueo").waitFor({ timeout: 20000 });
        await p.waitForLoadState("networkidle").catch(() => {});
        await foto(p, "n148-arqueo");
        const html = await p.content();
        const enHtml = buscar(html, [...montos]);
        if (enHtml.length) mal(`arqueo abierto: el HTML de /caja/turno trae lo esperado ANTES del conteo: ${enHtml.join(", ")}`);
        else bien(`arqueo abierto: el HTML de /caja/turno no trae ningún monto esperado (${montos.size} buscados)`);
        const enRespuestas = respuestas.flatMap((r) => buscar(r.cuerpo, [...montos]).map((h) => `${h} en ${r.url.replace(EST.base, "")}`));
        if (enRespuestas.length) mal(`las respuestas que llegaron al navegador traen lo esperado: ${enRespuestas.slice(0, 6).join(" · ")}`);
        else bien(`ninguna de las ${respuestas.length} respuestas que llegaron al navegador trae un monto esperado`);
        const bloque = limpio(await p.locator("main").innerText());
        if (/Movimientos de este turno/.test(bloque) && !/\$\d/.test(limpio(await p.locator("[data-movimientos-ciegos]").innerText().catch(() => "$0")))) bien("«Movimientos de este turno» lista los movimientos sin un solo monto");
        else mal("«Movimientos de este turno» enseña montos con el turno abierto");

        // Otras vistas con el dinero del turno abierto: Reportes de hoy, su desglose por método y Caja.
        const hoy = (await api.rpc("fecha_negocio")).data;
        for (const [ruta, que] of [[`/reportes?desde=${hoy}&hasta=${hoy}`, "Reportes de hoy"], [`/reportes/desglose?t=cobros:efectivo&desde=${hoy}&hasta=${hoy}`, "desglose «cobros en efectivo» de hoy"], [`/reportes/desglose?t=cobros:transferencia&desde=${hoy}&hasta=${hoy}`, "desglose «cobros por transferencia» de hoy"], ["/caja", "Caja"]]) {
          respuestas.length = 0;
          await p.goto(`${EST.base}${ruta}`);
          await p.waitForLoadState("networkidle").catch(() => {});
          const h = buscar(await p.content(), [...montos]).concat(respuestas.flatMap((r) => buscar(r.cuerpo, [...montos])));
          if (h.length) mal(`${que}: trae lo esperado del turno abierto: ${[...new Set(h)].join(", ")}`);
          else bien(`${que}: sin montos esperados del turno abierto`);
        }
        await p.context().close();
      }
    } finally {
      if (cobroId) {
        const { error } = await api.rpc("anular_cobro", { p_cobro_id: cobroId, p_motivo: "Verificación QA R59 (N148): cobro de prueba" });
        ver(`cobro de prueba ${error ? `NO se anuló (${error.message})` : "anulado"}`);
      }
      if (abriTurno && turno) {
        const { data: r } = await api.rpc("resumen_turno", { p_turno_id: turno.id });
        const n = (m) => (r ?? []).filter((x) => x.metodo === m).reduce((s, x) => s + Number(x.cobrado) + Number(x.propinas) - Number(x.devuelto), 0);
        const { error } = await api.rpc("cerrar_turno", { p_turno_id: turno.id, p_conteo_efectivo: n("efectivo"), p_conteo_terminal: n("terminal"), p_conteo_transferencia: n("transferencia"), p_explicacion_diferencias: "", p_notas_cierre: "Verificación QA R59: el único cobro se anuló" });
        ver(`turno de la prueba: ${error ? `NO se cerró (${error.message})` : "cerrado"}`);
      }
    }
  }

  // ───────────────────────────── N144 ─────────────────────────────
  if (toca("n144") || toca("n146")) {
    const HOT = await negocioPrueba("prueba-qa-onboarding-hotel-s16");
    const sesion = await HOT.sesion("admin");
    const p = await pagina(HOT, sesion);
    // Las estancias finalizadas de QA cuya cuenta solo trae la base (S41 y S42, como las reportó QA).
    const { data: fin } = await HOT.N.from("estancias").select("id, reserva_id, estado, perros(nombre)").eq("negocio_id", HOT.negocio.id).eq("estado", "finalizada").is("deleted_at", null).order("created_at", { ascending: false }).limit(60);
    const api = comoPersona(sesion.token, HOT.negocio.id);
    const sinCargos = [];
    // Primero la de S41, la que reportó QA.
    const orden = [...(fin ?? [])].sort((a, b) => Number(/S41/.test(b.perros?.nombre ?? "")) - Number(/S41/.test(a.perros?.nombre ?? "")));
    for (const e of orden) {
      const { data: todas } = await api.rpc("cuenta_lineas_estancia", { p_reserva_id: e.reserva_id });
      const l = (todas ?? []).filter((x) => x.estancia_id === e.id);
      if (l.length && !l.some((x) => x.tipo !== "estancia" && x.tipo !== "ajuste")) sinCargos.push(e);
      if (sinCargos.length >= 2) break;
    }
    if (toca("n144")) {
      console.log("\nN144 · estancia finalizada sin cargos en prueba-qa-onboarding-hotel-s16");
      if (!sinCargos.length) mal("no encontré una estancia finalizada sin cargos en hotel s16");
      for (const e of sinCargos) {
        for (const [ruta, donde] of [[`/reservas/${e.reserva_id}`, "detalle"], [`/reservas/estancias/${e.id}/checkout`, "check-out"]]) {
          await p.goto(`${HOT.base}${ruta}`);
          await p.waitForLoadState("networkidle").catch(() => {});
          await p.locator("[data-base-estancia]").first().waitFor({ timeout: 30000 }).catch(() => {});
          const texto = limpio(await p.locator("main").innerText());
          const ninguno = /Ninguno todavía/.test(texto);
          const titulo = /Cargos aplicados/i.test(texto);
          const base = /Base de la estancia/.test(texto);
          await foto(p, `n144-${donde}-${e.id.slice(0, 6)}`);
          if (!ninguno && !titulo && base) bien(`${donde} de «${e.perros?.nombre}» (finalizada, solo la base): sin «Cargos aplicados» ni «Ninguno todavía»; la base sí`);
          else mal(`${donde} de «${e.perros?.nombre}» (finalizada, solo la base): ${ninguno ? "dice «Ninguno todavía»" : ""}${titulo ? " · enseña «Cargos aplicados»" : ""}${base ? "" : " · SIN la base"}`);
        }
      }
    }
    if (toca("n146")) {
      console.log("\nN146 · estado junto al título en hotel s16 (reserva y check-out)");
      const e = sinCargos[0] ?? fin?.[0];
      if (e) {
        for (const [ruta, donde] of [[`/reservas/${e.reserva_id}`, "reserva"], [`/reservas/estancias/${e.id}/checkout`, "check-out"]]) {
          await p.goto(`${HOT.base}${ruta}`);
          await p.waitForLoadState("networkidle").catch(() => {});
          const cab = limpio(await p.locator("h1").first().locator("xpath=..").innerText().catch(() => ""));
          if (/Finalizada/.test(cab)) bien(`${donde} de una estancia finalizada: «Finalizada» junto al título («${cab.slice(0, 80)}»)`);
          else mal(`${donde} de una estancia finalizada: sin el estado junto al título («${cab.slice(0, 80)}»)`);
        }
      }
    }
    await p.context().close();
  }

  // ───────────────────────────── N146 ─────────────────────────────
  if (toca("n146")) {
    console.log("\nN146 · detalle de cita de estética en cada estado, en prueba-qa-onboarding-estetica-s16");
    const EST = await negocioPrueba("prueba-qa-onboarding-estetica-s16");
    const sesion = await EST.sesion("admin");
    const p = await pagina(EST, sesion);
    const ETIQUETA = { reservada: "Reservada", confirmada: "Confirmada", en_curso: "En curso", finalizada: "Finalizada", no_llego: "No llegó", cancelada: "Cancelada" };
    for (const [estado, etiqueta] of Object.entries(ETIQUETA)) {
      const { data: c } = await EST.N.from("citas_estetica").select("id").eq("negocio_id", EST.negocio.id).eq("estado", estado).is("deleted_at", null).order("inicio", { ascending: false }).limit(1).maybeSingle();
      if (!c) { ver(`sin cita «${etiqueta}» en este negocio: no se puede revisar`); continue; }
      await p.goto(`${EST.base}/estetica/${c.id}`);
      await p.waitForLoadState("networkidle").catch(() => {});
      const cab = limpio(await p.locator("h1").first().locator("xpath=..").innerText().catch(() => ""));
      await foto(p, `n146-${estado}`);
      if (cab.includes(etiqueta)) bien(`cita «${etiqueta}»: la insignia junto al título («${cab.slice(0, 90)}»)`);
      else mal(`cita «${etiqueta}»: sin su estado junto al título («${cab.slice(0, 90)}»)`);
    }
    // «Pide cambio» (respuesta del recordatorio): el chip sale en el detalle como en la agenda.
    const { data: pide } = await EST.N.from("recordatorios_wa").select("ref_id").eq("negocio_id", EST.negocio.id).eq("respuesta", "pide_cambio").limit(1).maybeSingle().then((r) => r, () => ({ data: null }));
    if (pide?.ref_id) {
      await p.goto(`${EST.base}/estetica/${pide.ref_id}`);
      await p.waitForLoadState("networkidle").catch(() => {});
      if (/Pide cambio/.test(await p.locator("main").innerText())) bien("cita con «Pide cambio»: el chip sale en el detalle");
      else mal("cita con «Pide cambio»: el chip no sale en el detalle");
    } else ver("ninguna cita con «Pide cambio» en este negocio: se revisa en desarrollo");
    await p.context().close();
  }
} finally {
  await nav.close();
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
