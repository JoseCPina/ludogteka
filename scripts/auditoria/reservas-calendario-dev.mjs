// Calendario de reservas de guardería y hotel + cancelar la cuenta cancela la reserva (QA externa B16 y B17)
// — SOLO DESARROLLO, en Huellitas, a 390 y 1280 px. Con el servidor prendido en el 3001
// (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/reservas-calendario-dev.mjs
//
// 1. /reservas/calendario existe (antes daba 404): semana y mes, la ocupación de cada día coincide con la
//    base (calendario_ocupacion), sin desborde en celular.
// 2. Al tocar un día salen sus reservas (mascota, cliente, estado, cuenta).
// 3. La lista de próximas reservas filtra por módulo, estado y fecha; abre, mueve y cancela.
// 4. Una cuenta cancelada sin cancelar la reserva se ve (Cuenta cancelada + reserva abierta) y, cancelándola
//    junto con la cuenta, la reserva sale de la ocupación.
// 5. El mensaje de traslape lleva el enlace al calendario en la fecha que choca.
// 6. N122: la ocupación de hoy y de los días pasados cuenta a quien está adentro (también con la salida vencida; el
//    check-out libera el cupo al momento); la de los días futuros, las reservas vivas y a quien sigue adentro y su
//    salida prevista alcanza ese día. Hoy también las llegadas pendientes (reservas vivas sin check-in). Canceladas
//    y no-show nunca. Con 8 adentro, 5 por llegar y cupo 10, no deja reservar hoy; si las 5 se marcan no-show o se
//    cancelan, sí. Una reserva con la entrada vencida sin check-in (llegada atrasada) no cuenta ningún día: sale en
//    «Llegadas atrasadas» del tablero, donde se marca «No llegó»; con el check-in tardío vuelve a contar desde ese
//    momento; si con él la casa rebasa el cupo, la pantalla dice «La casa está llena (10/10); al registrar la entrada
//    quedas en 11/10.», pide confirmar y queda anotado (estancia y bitácora). N121: «+ Reserva … este día» lleva ?fecha.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { CONFIRMA_FUERA_HORARIO, confirmarSiFueraDeHorario } from "../lib/fuera-horario.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const sufijo = String(Date.now()).slice(-6);

async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  // Dos cookies de sesión (personal y portal): el servidor lee la que le toca por la ruta.
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const comoPersona = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });

const admin = await comoPersona(datos.adminB);
const hoy = (await admin.rpc("fecha_negocio")).data;
const suma = (base, dias) => new Date(new Date(`${base}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
const dow = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const { data: gDia } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
const { data: hNoche } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "hotel").is("deleted_at", null).limit(1).single();

// Un lunes lejano con cupo (otras auditorías dejan estancias en Huellitas).
let D = suma(hoy, 120 + Math.floor(Math.random() * 150));
while (dow(D) !== 1) D = suma(D, 1);
const creados = { estancias: [], reservas: [], perros: [] };
const { data: tallaChico } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
const mkPerro = async (n) => {
  const { data, error } = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `ZZ cal ${n} ${sufijo}`, tamano_id: tallaChico.id }).select("id, nombre").single();
  if (error) throw new Error(`perro: ${error.message}`);
  creados.perros.push(data.id);
  return data;
};
const mkEstancia = async (perro, servicio, entrada, salida) => {
  const rr = await admin.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single();
  creados.reservas.push(rr.data.id);
  const e = await admin.from("estancias").insert({
    reserva_id: rr.data.id, perro_id: perro.id, servicio_id: servicio, fecha_entrada: entrada, fecha_salida: salida, estado: "reservada",
    bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba calendario", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba calendario",
  }).select("id").single();
  if (e.error) throw new Error(`estancia: ${e.error.message}`);
  creados.estancias.push(e.data.id);
  return { id: e.data.id, reserva: rr.data.id };
};
const estado = async (id) => (await SB.from("estancias").select("estado, fecha_entrada, fecha_salida").eq("id", id).single()).data;
const ocupado = async (dia) => Number(((await admin.rpc("calendario_ocupacion", { p_desde: dia, p_hasta: dia })).data ?? [])[0]?.ocupado_diurno ?? NaN);

const nav = await abrirNavegador();
try {
  const pG = await mkPerro("guarderia");
  const pH = await mkPerro("hotel");
  const eG = await mkEstancia(pG, gDia.id, D, suma(D, 1));
  const eH = await mkEstancia(pH, hNoche.id, D, suma(D, 3));

  console.log("── 6. N122: la ocupación cuenta quién está adentro (hoy y antes) y lo reservado (después)");
  {
    // Días en que el negocio abre (el hotel no recibe ni entrega en día cerrado).
    const abre = async (d) => (await admin.rpc("negocio_abre", { p_fecha: d })).data === true;
    const abiertoDesde = async (d, paso) => { let x = d; for (let i = 0; i < 14 && !(await abre(x)); i++) x = suma(x, paso); return x; };
    const instante = (dia, hora) => new Date(`${dia}T${hora}:00-07:00`).toISOString();
    const marcar = async (e, cambios) => {
      const { error } = await admin.from("estancias").update(cambios).eq("id", e.id);
      if (error) throw new Error(`estancia ${e.id}: ${error.message}`);
    };
    const checkin = (dia) => ({ estado: "en_curso", entregado_por_nombre: "Prueba", hora_entrada_real: dia === hoy ? new Date(Date.now() - 3 * 3600_000).toISOString() : instante(dia, "10:00"), ...CONFIRMA_FUERA_HORARIO });
    const checkout = { estado: "finalizada", recogido_por_nombre: "Prueba", recogido_por_es_dueno: true, hora_salida_real: new Date(Date.now() - 3600_000).toISOString(), ...CONFIRMA_FUERA_HORARIO };
    // Cada caso con lo que debe contar, para comparar contra la base: entrada, salida, estado, día de check-in y de check-out.
    const casos = [];
    const caso = async (nombre, servicio, entrada, salida, pasos) => {
      const e = await mkEstancia(await mkPerro(nombre), servicio, entrada, salida);
      const c = { nombre, id: e.id, hotel: servicio === hNoche.id, entrada, salida, estado: "reservada", dentro: null, fuera: null };
      for (const paso of pasos) {
        await marcar(e, paso.cambios);
        c.estado = paso.cambios.estado;
        if (paso.dentro) c.dentro = paso.dentro;
        if (paso.fuera) c.fuera = paso.fuera;
      }
      casos.push(c);
      return c;
    };
    // a) Adentro con la salida vencida (QA R24: la salida prevista ya pasó y no hay check-out).
    const salidaA = await abiertoDesde(suma(hoy, -2), -1);
    const entradaA = await abiertoDesde(suma(salidaA, -1), -1);
    const vencida = await caso("vencida", hNoche.id, entradaA, salidaA, [{ cambios: checkin(entradaA), dentro: entradaA }]);
    // b) Check-out hecho hoy con la salida prevista después (QA S30: seguía ocupando hoy y mañana).
    const entradaB = await abiertoDesde(hoy, -1);
    await caso("salio hoy", hNoche.id, entradaB, await abiertoDesde(suma(hoy, 2), 1), [{ cambios: checkin(entradaB), dentro: entradaB }, { cambios: checkout, fuera: hoy }]);
    // c) Adentro desde antes y con la salida prevista después de mañana: cuenta hoy y hasta su salida.
    const entradaC = await abiertoDesde(suma(hoy, -1), -1);
    const salidaC = await abiertoDesde(suma(hoy, 2), 1);
    await caso("adentro", hNoche.id, entradaC, salidaC, [{ cambios: checkin(entradaC), dentro: entradaC }]);
    // d) Reserva viva que todavía no llega.
    const entradaD = await abiertoDesde(suma(hoy, 1), 1);
    await caso("futura", hNoche.id, entradaD, await abiertoDesde(suma(entradaD, 2), 1), []);
    // e) Guardería de hoy sin check-in (si hoy abre): llegada pendiente, cuenta hoy.
    if (await abre(hoy)) await caso("sin llegar", gDia.id, hoy, suma(hoy, 1), []);
    // g) Llegada atrasada: la entrada ya pasó sin check-in. Sigue viva pero no cuenta ningún día.
    const entradaG = await abiertoDesde(suma(hoy, -2), -1);
    const atrasada = await caso("atrasada", hNoche.id, entradaG, await abiertoDesde(suma(hoy, 2), 1), []);
    // f) Cancelada y no-show: nunca.
    await caso("cancelada", hNoche.id, entradaD, await abiertoDesde(suma(entradaD, 2), 1), [{ cambios: { estado: "cancelada" } }]);
    const entradaF = await abiertoDesde(suma(hoy, -3), -1);
    await caso("no llego", hNoche.id, entradaF, await abiertoDesde(suma(entradaF, 1), 1), [{ cambios: { estado: "no_llego" } }]);

    // La regla, escrita aparte para comparar (de noche solo hotel y el check-out de ese día ya no duerme ahí).
    const cuenta = (c, D, noche) => {
      if (["cancelada", "no_llego"].includes(c.estado) || (noche && !c.hotel) || c.entrada > D) return false;
      const adentroAhora = Boolean(c.dentro) && !c.fuera;
      const viva = ["reservada", "confirmada"].includes(c.estado);
      if (D === hoy) return adentroAhora || (!c.dentro && viva && c.entrada === D && c.salida > D);
      if (D < hoy) return Boolean(c.dentro) && c.dentro <= D && (!c.fuera || c.fuera > D || (!noche && c.fuera === D));
      return c.salida > D && ((viva && c.entrada >= hoy) || adentroAhora);
    };
    const dias = [...new Set([entradaA, entradaF, entradaG, suma(hoy, -1), hoy, suma(hoy, 1), suma(hoy, 2), salidaC])].sort();
    const leer = async () => {
      const { data } = await admin.rpc("calendario_ocupacion", { p_desde: dias[0], p_hasta: dias[dias.length - 1] });
      return Object.fromEntries((data ?? []).map((f) => [f.fecha, { d: f.ocupado_diurno, n: f.ocupado_nocturno }]));
    };
    // Lo que ya había (otras auditorías) sale de quitar los casos: se compara la base con y sin ellos.
    const con = await leer();
    for (const c of casos) await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).eq("id", c.id);
    const sin = await leer();
    for (const c of casos) await SB.from("estancias").update({ deleted_at: null }).eq("id", c.id);
    for (const D of dias) {
      const esperadoD = casos.filter((c) => cuenta(c, D, false)).length;
      const esperadoN = casos.filter((c) => cuenta(c, D, true)).length;
      const dD = con[D].d - sin[D].d;
      const dN = con[D].n - sin[D].n;
      const quienes = casos.filter((c) => cuenta(c, D, false)).map((c) => c.nombre).join(", ") || "nadie";
      comprobar(dD === esperadoD && dN === esperadoN, `${D}${D === hoy ? " (hoy)" : ""}: +${dD} de día / +${dN} de noche, esperado +${esperadoD}/+${esperadoN} (${quienes})`);
    }
    comprobar(cuenta(vencida, hoy, true) && !cuenta(casos.find((c) => c.nombre === "salio hoy"), suma(hoy, 1), true), "los dos casos de la QA: la salida vencida cuenta hoy y el check-out de hoy ya no ocupa mañana");
    comprobar(dias.every((D) => !cuenta(atrasada, D, false)), "la llegada atrasada no cuenta ningún día (ni su entrada, ni hoy, ni después)");
    // El panel del día de hoy enseña al de la salida vencida (cuenta en la ocupación de hoy).
    const ctxN = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctxN.addCookies(await cookiesDe(datos.adminB));
    const pn = await ctxN.newPage();
    pn.setDefaultTimeout(60000);
    await pn.goto(`${BASE}/reservas/calendario?dia=${hoy}`, { waitUntil: "networkidle", timeout: 120000 });
    comprobar((await pn.locator(`[data-lista=dia] [data-reserva="${vencida.id}"]`).count()) === 1, "el panel de hoy incluye al perro que sigue adentro con la salida vencida");
    // Llegadas atrasadas en el tablero de Hotel; «No llegó» desde ahí, y el check-in tardío vuelve a contar.
    {
      const entradaH = await abiertoDesde(suma(hoy, -1), -1);
      const salidaH = await abiertoDesde(suma(hoy, 2), 1);
      const tardia = await mkEstancia(await mkPerro("tardia"), hNoche.id, entradaH, salidaH);
      const noVino = await mkEstancia(await mkPerro("no vino"), hNoche.id, entradaH, salidaH);
      const manana = suma(hoy, 1);
      const leerDos = async () => {
        const { data } = await admin.rpc("calendario_ocupacion", { p_desde: entradaH, p_hasta: manana });
        return Object.fromEntries((data ?? []).map((f) => [f.fecha, f.ocupado_nocturno]));
      };
      await pn.goto(`${BASE}/hotel`, { waitUntil: "networkidle", timeout: 120000 });
      const lista = pn.locator("[data-lista=llegadas-atrasadas]");
      comprobar((await lista.locator(`[data-llegada-atrasada="${tardia.id}"]`).count()) === 1 && (await lista.locator(`[data-llegada-atrasada="${noVino.id}"]`).count()) === 1, "el tablero de Hotel enseña las dos en «Llegadas atrasadas»");
      const fila = lista.locator(`[data-llegada-atrasada="${tardia.id}"]`);
      comprobar((await fila.getByRole("link", { name: "Check-in tardío" }).getAttribute("href")) === `/reservas/estancias/${tardia.id}/checkin` && (await fila.getByRole("link", { name: "Reprogramar" }).getAttribute("href")) === `/reservas/${tardia.reserva}`, "cada una trae «Check-in tardío» y «Reprogramar»");
      const filaNo = lista.locator(`[data-llegada-atrasada="${noVino.id}"]`);
      await filaNo.locator("[data-no-llego]").click();
      await filaNo.locator("[data-confirmar-no-llego]").click();
      await filaNo.locator("[data-marcada-no-llego]").waitFor({ timeout: 30000 }).catch(() => {});
      comprobar((await estado(noVino.id)).estado === "no_llego", `«No llegó» desde el tablero la marca (${(await estado(noVino.id)).estado})`);
      const antesTarde = await leerDos();
      await marcar(tardia, checkin(hoy));
      const despuesTarde = await leerDos();
      comprobar(despuesTarde[hoy] - antesTarde[hoy] === 1 && despuesTarde[manana] - antesTarde[manana] === 1 && despuesTarde[entradaH] === antesTarde[entradaH],
        `con el check-in tardío cuenta desde ese momento: hoy +${despuesTarde[hoy] - antesTarde[hoy]}, mañana +${despuesTarde[manana] - antesTarde[manana]}, su día de entrada +${despuesTarde[entradaH] - antesTarde[entradaH]}`);
      await pn.goto(`${BASE}/hotel`, { waitUntil: "networkidle", timeout: 120000 });
      comprobar((await pn.locator(`[data-llegada-atrasada="${tardia.id}"], [data-llegada-atrasada="${noVino.id}"]`).count()) === 0, "las dos salen de «Llegadas atrasadas» al resolverse");
    }
    // N121: desde el día elegido, «+ Reserva de hotel este día» lleva la fecha.
    const futuroDia = suma(hoy, 2);
    await pn.goto(`${BASE}/reservas/calendario?dia=${futuroDia}`, { waitUntil: "networkidle", timeout: 120000 });
    const hrefDia = await pn.locator('[data-nueva-reserva-dia="hotel"]').getAttribute("href").catch(() => null);
    comprobar(hrefDia === `/hotel/nueva?fecha=${futuroDia}`, `«+ Reserva de hotel este día» lleva ?fecha (${hrefDia})`);
    await ctxN.close();

    // Cupo de hoy con llegadas pendientes: 8 adentro + 5 por llegar con cupo 10 (sobre lo que ya había) no deja reservar.
    if (await abre(hoy)) {
      const salidaHoy = await abiertoDesde(suma(hoy, 1), 1);
      const leerHoy = async () => (await admin.rpc("calendario_ocupacion", { p_desde: hoy, p_hasta: hoy })).data?.[0];
      const { data: vigente } = await SB.from("cupo_configuracion").select("telefono_recepcion").eq("negocio_id", B).is("deleted_at", null)
        .lte("vigencia_desde", hoy).order("vigencia_desde", { ascending: false }).order("created_at", { ascending: false }).limit(1).single();
      const configs = [];
      const fijarCupo = async (extra) => {
        const base = await leerHoy();
        const { data, error } = await admin.rpc("guardar_configuracion_negocio", {
          p_cupo_diurno: base.ocupado_diurno + extra, p_cupo_nocturno: base.ocupado_nocturno + extra, p_telefono_recepcion: vigente?.telefono_recepcion ?? null,
        });
        if (error) throw new Error(`cupo: ${error.message}`);
        configs.push(data);
      };
      try {
        const base0 = await leerHoy();
        await fijarCupo(20);
        const adentro = [], porLlegar = [];
        for (let i = 0; i < 8; i++) {
          const e = await mkEstancia(await mkPerro(`cupo adentro ${i}`), hNoche.id, hoy, salidaHoy);
          await marcar(e, checkin(hoy));
          adentro.push(e);
        }
        for (let i = 0; i < 5; i++) porLlegar.push(await mkEstancia(await mkPerro(`cupo llega ${i}`), hNoche.id, hoy, salidaHoy));
        // Cupo = lo que había + 10: con 8 adentro y 5 por llegar ya hay 13 sobre lo de antes.
        const { error: eCupo } = await admin.rpc("guardar_configuracion_negocio", {
          p_cupo_diurno: base0.ocupado_diurno + 10, p_cupo_nocturno: base0.ocupado_nocturno + 10, p_telefono_recepcion: vigente?.telefono_recepcion ?? null,
        }).then(async (r) => { if (!r.error) configs.push(r.data); return r; });
        if (eCupo) throw new Error(`cupo: ${eCupo.message}`);
        const ahora = await leerHoy();
        comprobar(ahora.ocupado_nocturno - base0.ocupado_nocturno === 13 && ahora.disponible_nocturno < 0,
          `hoy cuentan los 8 adentro y las 5 llegadas pendientes (+${ahora.ocupado_nocturno - base0.ocupado_nocturno}, disponibles ${ahora.disponible_nocturno})`);
        const otro = await mkPerro("cupo uno mas");
        const rr = await admin.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single();
        creados.reservas.push(rr.data.id);
        const fila = { reserva_id: rr.data.id, perro_id: otro.id, servicio_id: hNoche.id, fecha_entrada: hoy, fecha_salida: salidaHoy, estado: "reservada",
          bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba calendario", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba calendario" };
        const lleno = await admin.from("estancias").insert(fila).select("id").single();
        if (lleno.data) creados.estancias.push(lleno.data.id);
        comprobar(Boolean(lleno.error) && /No hay cupo disponible/.test(lleno.error.message), `8 adentro + 5 por llegar con cupo 10: no deja reservar hoy (${lleno.error?.message ?? "la dejó pasar"})`);
        // Las 5 llegadas pendientes: 3 no-show y 2 canceladas. Dejan de contar y ya hay lugar.
        for (const [i, e] of porLlegar.entries()) await marcar(e, { estado: i < 3 ? "no_llego" : "cancelada" });
        const despues = await leerHoy();
        comprobar(despues.ocupado_nocturno - base0.ocupado_nocturno === 8, `marcadas no-show o canceladas, las llegadas pendientes ya no cuentan (+${despues.ocupado_nocturno - base0.ocupado_nocturno})`);
        const cabe = await admin.from("estancias").insert(fila).select("id").single();
        if (cabe.data) creados.estancias.push(cabe.data.id);
        comprobar(!cabe.error, `y entonces sí deja reservar hoy (${cabe.error?.message ?? "ok"})`);

        // QA S31: check-in tardío con la casa llena. No bloquea: avisa en cuánto queda, pide confirmar y lo anota.
        const tarde = await mkEstancia(await mkPerro("tarde casa llena"), hNoche.id, await abiertoDesde(suma(hoy, -1), -1), salidaHoy);
        await fijarCupo(0);
        const lleno0 = await leerHoy();
        const c = lleno0.cupo_diurno;
        const ctxC = await nav.newContext({ viewport: { width: 390, height: 844 } });
        await ctxC.addCookies(await cookiesDe(datos.adminB));
        const pc = await ctxC.newPage();
        pc.setDefaultTimeout(60000);
        await pc.goto(`${BASE}/reservas/estancias/${tarde.id}/checkin`, { waitUntil: "networkidle", timeout: 120000 });
        await pc.locator("#checkin-entrega-quien").selectOption({ index: 1 });
        await pc.locator("[data-confirmar-checkin]").click();
        // N125: si la prueba corre fuera del horario de Huellitas, primero pregunta eso (fuera-horario-dev lo cubre).
        await pc.locator("[data-aviso-sobrecupo], [data-aviso-fuera-horario]").first().waitFor({ timeout: 30000 }).catch(() => {});
        await confirmarSiFueraDeHorario(pc, 500);
        const aviso = await pc.locator("[data-aviso-sobrecupo]").innerText({ timeout: 30000 }).catch(() => "");
        comprobar(aviso === `La casa está llena (${c}/${c}); al registrar la entrada quedas en ${c + 1}/${c}.`, `check-in tardío con la casa llena: «${aviso}»`);
        comprobar((await estado(tarde.id)).estado === "reservada", "sin confirmar no se registra la entrada");
        comprobar((await pc.evaluate(() => document.documentElement.scrollWidth)) <= 390, "el aviso cabe a 390 px");
        await pc.locator("[data-confirmar-sobrecupo]").click();
        const hecho = await pc.locator("[data-checkin-sobrecupo]").innerText({ timeout: 30000 }).catch(() => "");
        const { data: filaTarde } = await SB.from("estancias").select("estado, checkin_sobrecupo").eq("id", tarde.id).single();
        comprobar(filaTarde.estado === "en_curso" && filaTarde.checkin_sobrecupo === `${c + 1}/${c} de día`, `confirmado, entra y queda anotado en la estancia (${filaTarde.estado}, «${filaTarde.checkin_sobrecupo}»; pantalla: «${hecho.replace(/\s+/g, " ")}»)`);
        const { data: bit } = await SB.from("registro_ediciones").select("profile_id, cambios").eq("tabla", "estancias").eq("registro_id", tarde.id);
        comprobar((bit ?? []).some((b) => b.profile_id === datos.adminB && b.cambios && "checkin_sobrecupo" in b.cambios), "y en la bitácora (registro_ediciones), con quién lo hizo");
        await pc.goto(`${BASE}/reservas/${tarde.reserva}`, { waitUntil: "networkidle", timeout: 120000 });
        comprobar(/Entró con la casa llena: quedó en/.test(await pc.locator(`[data-sobrecupo-estancia]`).innerText().catch(() => "")), "la reserva lo enseña: «Entró con la casa llena: quedó en …»");
        await ctxC.close();
      } finally {
        // El cupo vuelve a la configuración de antes (las versiones de prueba se dan de baja con su horario).
        for (const id of configs) {
          await SB.from("horario_semana").update({ deleted_at: new Date().toISOString() }).eq("cupo_configuracion_id", id);
          await SB.from("cupo_configuracion").update({ deleted_at: new Date().toISOString() }).eq("id", id);
        }
      }
    } else bien("hoy el negocio no abre: el caso del cupo con llegadas pendientes se salta");
  }

  console.log("── 5. Traslape: el mensaje lleva el enlace al calendario");
  const choque = await admin.from("estancias").insert({
    reserva_id: eG.reserva, perro_id: pG.id, servicio_id: gDia.id, fecha_entrada: D, fecha_salida: suma(D, 1),
    bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba calendario", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba calendario",
  });
  comprobar(choque.error?.code === "23P01", "la base rechaza la reserva que se traslapa (23P01)");
  const { mensajeTraslape } = await import("../../src/lib/reservas/traslape.ts");
  // El texto cierra con punto (frase completa); el enlace es la ruta justo antes del punto final, que TextoConEnlaces deja fuera.
  const terminaEn = (texto, ruta) => texto.endsWith(` ${ruta}.`);
  comprobar(terminaEn(mensajeTraslape(D), `/reservas/calendario?dia=${D}`) && terminaEn(mensajeTraslape(), "/reservas/calendario") && terminaEn(mensajeTraslape("x; drop"), "/reservas/calendario"), "el mensaje termina con el enlace al calendario en esa fecha (y solo con fechas válidas)");
  // La pantalla: el enlace del mensaje abre el calendario en ese día.
  {
    const ctxT = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctxT.addCookies(await cookiesDe(datos.adminB));
    const pt = await ctxT.newPage();
    pt.setDefaultTimeout(60000);
    await pt.goto(`${BASE}/reservas/calendario?dia=${D}`, { waitUntil: "networkidle", timeout: 120000 });
    comprobar((await pt.locator("[data-lista=dia]").count()) === 1 && (await pt.locator(`[data-dia="${D}"][aria-current="date"]`).count()) === 1, "el enlace con ?dia= abre el calendario con ese día marcado y sus reservas");
    await ctxT.close();
  }

  for (const [nombreVista, ancho, alto] of [["celular", 390, 844], ["escritorio", 1280, 900]]) {
    console.log(`── ${nombreVista} (${ancho} px)`);
    const ctx = await nav.newContext({ viewport: { width: ancho, height: alto } });
    await ctx.addCookies(await cookiesDe(datos.adminB));
    const pa = await ctx.newPage();
    pa.setDefaultTimeout(60000);
    const ir = (ruta) => pa.goto(`${BASE}${ruta}`, { waitUntil: "networkidle", timeout: 120000 });
    const texto = async (sel) => (await pa.locator(sel).first().innerText().catch(() => "")).replace(/\s+/g, " ");

    // ── 1. Semana y mes ──
    const resp = await ir(`/reservas/calendario?fecha=${D}`);
    comprobar(resp.status() === 200, "/reservas/calendario abre (antes daba 404)");
    comprobar(/Calendario de reservas/.test(await pa.locator("h1").innerText()), "tiene su título");
    comprobar((await pa.locator("[data-calendario-grid] [data-dia]").count()) === 7, "la semana tiene 7 días");
    const lunes = await pa.locator(`[data-dia="${D}"]`).getAttribute("aria-label");
    const esperado = await ocupado(D);
    comprobar(new RegExp(`: ${esperado} de `).test(lunes ?? ""), `la ocupación del día coincide con la base (${lunes})`);
    comprobar((await pa.evaluate(() => document.documentElement.scrollWidth)) <= ancho + 2, "la semana no se desborda");
    comprobar((await pa.getByRole("link", { name: "Calendario" }).count()) >= 1 || ancho < 700, "el menú trae «Calendario»");
    await ir(`/reservas/calendario?vista=mes&fecha=${D}`);
    const celdas = await pa.locator("[data-calendario-grid] [data-dia]").count();
    comprobar(celdas >= 28 && celdas <= 42 && celdas % 7 === 0, `el mes tiene semanas completas (${celdas} días)`);
    comprobar((await pa.evaluate(() => document.documentElement.scrollWidth)) <= ancho + 2, "el mes no se desborda");

    // ── 2. Un día ──
    await ir(`/reservas/calendario?fecha=${D}`);
    await pa.locator(`[data-dia="${D}"]`).click();
    await pa.waitForURL(new RegExp(`dia=${D}`));
    await pa.locator("[data-lista=dia]").waitFor();
    const dia = await texto("[data-lista=dia]");
    comprobar(dia.includes(pG.nombre) && dia.includes(pH.nombre) && /Reservada/.test(dia) && /Cuenta:/.test(dia), "al tocar el día salen las reservas con mascota, estado y cuenta");

    // ── 3. Próximas, filtros y acciones ──
    await ir(`/reservas/calendario?desde=${D}&modulo=hotel`);
    const hotel = await texto("[data-lista=proximas]");
    comprobar(hotel.includes(pH.nombre) && !hotel.includes(pG.nombre), "el filtro de módulo deja solo hotel");
    await ir(`/reservas/calendario?desde=${D}&modulo=guarderia&estado=reservada`);
    const guard = await texto("[data-lista=proximas]");
    comprobar(guard.includes(pG.nombre) && !guard.includes(pH.nombre), "el filtro de guardería deja solo guardería");
    await ir(`/reservas/calendario?desde=${suma(D, 5)}&modulo=hotel`);
    comprobar(!(await texto("body")).includes(pH.nombre), "el filtro de fecha oculta lo anterior");

    await ir(`/reservas/calendario?desde=${D}&modulo=guarderia`);
    const fila = pa.locator(`[data-reserva="${eG.id}"]`);
    comprobar((await fila.getByRole("link", { name: "Abrir" }).getAttribute("href")) === `/reservas/${eG.reserva}`, "«Abrir» lleva a la reserva");
    await fila.getByRole("button", { name: "Mover fechas" }).click();
    const nueva = suma(D, 1);
    await fila.locator('input[type="date"]').fill(nueva);
    await fila.getByRole("button", { name: "Guardar fechas" }).click();
    await fila.getByText("Fechas cambiadas").waitFor({ timeout: 90000 }).catch(() => {});
    const movida = await estado(eG.id);
    comprobar(movida.fecha_entrada === nueva, `«Mover fechas» cambia la reserva (${movida.fecha_entrada})`);
    await fila.getByRole("button", { name: "Cancelar" }).first().click();
    await fila.getByRole("button", { name: "Sí, cancelarla" }).click();
    await fila.getByText("Reserva cancelada").waitFor({ timeout: 90000 }).catch(() => {});
    comprobar((await estado(eG.id)).estado === "cancelada", "«Cancelar» cancela la reserva desde la lista");

    // Para la vuelta siguiente: otra guardería en D.
    if (nombreVista === "celular") {
      const otra = await mkEstancia(pG, gDia.id, D, suma(D, 1));
      eG.id = otra.id; eG.reserva = otra.reserva;
    }
    await ctx.close();
  }

  console.log("── 4. Cuenta cancelada y reserva");
  const pC = await mkPerro("cuenta");
  const tRec = await tokenDe(datos.adminB);
  void tRec;
  // Una reserva con saldo: la guardería de un día con precio.
  const sinCancelar = await mkEstancia(pC, gDia.id, suma(D, 7), suma(D, 8));
  const r1 = await admin.rpc("cancelar_cuenta", { p_reserva_id: sinCancelar.reserva, p_motivo: "cita_cancelada", p_motivo_texto: null, p_cancelar_cita: false });
  comprobar(!r1.error, `la cuenta se cancela sin tocar la reserva (${r1.error?.message ?? "ok"})`);
  comprobar((await estado(sinCancelar.id)).estado === "reservada", "…y la reserva sigue abierta (el estado que se veía en la QA)");
  const ctx2 = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.addCookies(await cookiesDe(datos.adminB));
  const p2 = await ctx2.newPage();
  p2.setDefaultTimeout(60000);
  await p2.goto(`${BASE}/reservas/calendario?desde=${suma(D, 7)}&modulo=guarderia`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar(/Cuenta cancelada/.test((await p2.locator(`[data-reserva="${sinCancelar.id}"]`).innerText()).replace(/\s+/g, " ")), "el calendario la muestra: «Cuenta cancelada» con la reserva todavía abierta");
  await ctx2.close();
  const juntas = await mkEstancia(pC, hNoche.id, suma(D, 14), suma(D, 16));
  const antes = await ocupado(suma(D, 14));
  const r2 = await admin.rpc("cancelar_cuenta", { p_reserva_id: juntas.reserva, p_motivo: "cita_cancelada", p_motivo_texto: null, p_cancelar_cita: true });
  comprobar(!r2.error && (await estado(juntas.id)).estado === "cancelada", `cancelar la cuenta con la casilla cancela la reserva (${r2.error?.message ?? "ok"})`);
  comprobar((await ocupado(suma(D, 14))) === antes - 1, "y libera el cupo de ese día");
} finally {
  if (creados.estancias.length) await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).in("id", creados.estancias).is("deleted_at", null);
  await nav.close();
}

console.log(hallazgos.length ? `\nHALLAZGOS: ${hallazgos.length}` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
