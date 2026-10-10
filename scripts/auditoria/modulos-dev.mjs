// Módulos de PeluDesk, con Veterinaria (SOLO DESARROLLO, en Huellitas; nunca
// Ludogteka). Migración 20261014000000.
//
//   node scripts/auditoria/negocio-prueba-dev.mjs   (si Huellitas no existe)
//   node scripts/auditoria/modulos-dev.mjs
//
// 1. Estado de partida: Hotel, Guardería y Estética prendidos en Ludogteka;
//    Veterinaria disponible para todos pero apagada salvo en Huellitas.
// 2. Permiso «Administrar módulos»: admin siempre; recepción solo cuando se lo
//    dan; estética, cliente y anónimo no. El catálogo de permisos es de datos
//    (un permiso que no existe se rechaza; los nuevos están).
// 3. Apagar y prender Veterinaria: lo que depende de ella se bloquea en la
//    base (especie, microchip, médicos, lotes, permisos), los permisos del
//    módulo dan falso aun para admin, y Hotel y Estética no se mueven.
// 4. Apagar con pendientes: la base pide confirmación (aunque la pantalla no
//    lo haya hecho), deja el historial inmutable y nada se borra: al prender
//    todo regresa.
// 5. Dependencias: sin Inventario, Veterinaria no está activa.
// 6. Registro: escoger Veterinaria prende solo ese módulo (plan Completo); no
//    escogerla la deja apagada.
// 7. Aislamiento: Ludogteka no ve nada de lo de Huellitas.
import {
  A, B, SB, URL, env, LUDOGTEKA, datos, rpc, get, post, patch, borrar, personas, dar, quitar, fijarModulo, productoClinico, hoy, sumaDias,
  comprobar, seccion, terminar,
} from "./veterinaria-comun-dev.mjs";
import { tokenDe } from "./sesiones-dev.mjs";
import { createClient } from "@supabase/supabase-js";

const P = await personas();
const activos = async (token, negocio = B) => (await rpc(token, "modulos_activos", {}, negocio)).cuerpo ?? [];
const PERMISOS_NUEVOS = ["administrar_modulos", "editar_ficha_clinica", "lotes_clinicos"];

try {
  // Partida conocida
  await fijarModulo("veterinaria", true);
  await fijarModulo("inventario", true);
  for (const perm of [...PERMISOS_NUEVOS, "configuracion_negocio"]) { await quitar(P.admin, P.recConId, perm); await quitar(P.admin, P.recSinId, perm); }

  // ── 1. Partida ──
  seccion("1. Estado de partida");
  const { data: adminsL } = await A.from("membresias").select("profile_id").eq("rol", "admin").is("deleted_at", null).limit(1);
  const tLud = await tokenDe(adminsL[0].profile_id);
  const aLud = await activos(tLud, LUDOGTEKA);
  comprobar(["guarderia", "hotel", "estetica"].every((m) => aLud.includes(m)), "Ludogteka conserva Guardería, Hotel y Estética prendidos");
  comprobar(!aLud.includes("veterinaria"), "Ludogteka NO tiene Veterinaria prendida (apagada por omisión)");
  const modsL = (await rpc(tLud, "mis_modulos", {}, LUDOGTEKA)).cuerpo ?? [];
  const vetL = modsL.find((m) => m.clave === "veterinaria");
  comprobar(vetL?.disponible === true && vetL?.encendido === false && vetL?.activo === false, "en el panel de Ludogteka Veterinaria sale disponible y apagada");
  comprobar(modsL.map((m) => m.clave).indexOf("veterinaria") > modsL.map((m) => m.clave).indexOf("estetica"), "el panel la lista después de Estética");
  const aHue = await activos(P.admin);
  comprobar(aHue.includes("veterinaria") && aHue.includes("inventario"), "Huellitas la tiene prendida para probar");
  comprobar(["guarderia", "hotel", "estetica"].every((m) => aHue.includes(m)), "y conserva Guardería, Hotel y Estética");

  // ── 2. Permiso ──
  seccion("2. Permiso «Administrar módulos» y catálogo de permisos");
  const permAdmin = (await rpc(P.admin, "mis_permisos")).cuerpo ?? [];
  comprobar(PERMISOS_NUEVOS.every((p) => permAdmin.includes(p)), "admin tiene los tres permisos nuevos");
  comprobar(permAdmin.length >= 23, `el catálogo de permisos trae todos los de siempre más los nuevos (${permAdmin.length})`);
  const sin = await rpc(P.recSin, "cambiar_modulo", { p_modulo: "veterinaria", p_activo: false });
  comprobar(!sin.ok && sin.codigo === "42501", `recepción sin el permiso no apaga módulos («${sin.mensaje.slice(0, 60)}…»)`);
  comprobar(!((await rpc(P.recSin, "mis_permisos")).cuerpo ?? []).some((p) => PERMISOS_NUEVOS.includes(p)), "recepción NO trae los permisos nuevos por omisión");
  for (const [quien, token] of [["estética", P.estetica], ["cliente", P.cliente], ["anónimo", null]]) {
    const r = await rpc(token, "cambiar_modulo", { p_modulo: "veterinaria", p_activo: false });
    comprobar(!r.ok, `${quien} no apaga módulos`);
  }
  comprobar((await activos(P.admin)).includes("veterinaria"), "y ningún intento no autorizado movió nada");
  const inexistente = await dar(P.admin, P.recConId, "permiso_que_no_existe");
  comprobar(!inexistente.ok, "un permiso que no está en el catálogo no se puede otorgar");
  const otorgado = await dar(P.admin, P.recConId, "administrar_modulos");
  comprobar(otorgado.ok, "admin le da «Administrar módulos» a una recepcionista");
  comprobar(((await rpc(P.recCon, "mis_permisos")).cuerpo ?? []).includes("administrar_modulos"), "y ella lo trae en su sesión");
  const prendeRec = await rpc(P.recCon, "cambiar_modulo", { p_modulo: "veterinaria", p_activo: false, p_confirmado: true });
  comprobar(prendeRec.ok, "con el permiso, recepción apaga un módulo");
  comprobar(!(await activos(P.admin)).includes("veterinaria"), "y el módulo quedó apagado");
  const prendeRec2 = await rpc(P.recCon, "cambiar_modulo", { p_modulo: "veterinaria", p_activo: true });
  comprobar(prendeRec2.ok && (await activos(P.admin)).includes("veterinaria"), "y lo vuelve a prender");
  const noExiste = await rpc(P.admin, "cambiar_modulo", { p_modulo: "no_existe", p_activo: true });
  comprobar(!noExiste.ok, "un módulo que no existe se rechaza");
  const eventos = (await SB.from("negocio_modulos_eventos").select("modulo, activo").eq("negocio_id", B).order("created_at", { ascending: false }).limit(2)).data ?? [];
  comprobar(eventos.length === 2 && eventos[0].activo === true && eventos[1].activo === false, "cada cambio quedó en el historial de módulos");

  // ── 3. Apagar y prender Veterinaria ──
  seccion("3. Apagar y prender Veterinaria");
  // Material: un perro del negocio y un producto clínico con un lote.
  const perro = datos_perro();
  await rpc(P.admin, "cambiar_modulo", { p_modulo: "veterinaria", p_activo: true });
  const hoyB = await hoy(P.admin);
  const MARCA = `mod-${String(Date.now()).slice(-6)}`;
  const insumo = await productoClinico(P.admin, `Amoxicilina ${MARCA}`);
  const entrada = await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: insumo, p_codigo: `L-${MARCA}`, p_caducidad: sumaDias(hoyB, 200), p_cantidad_compra: 2 });
  comprobar(entrada.ok, `con el módulo prendido se registra un lote (${entrada.mensaje})`);
  comprobar((await rpc(P.admin, "tiene_permiso", { p_permiso: "lotes_clinicos" })).cuerpo === true, "admin tiene «lotes_clinicos» con el módulo prendido");

  await fijarModulo("veterinaria", false);
  const apagado = await activos(P.admin);
  comprobar(!apagado.includes("veterinaria"), "apagado: no aparece entre los módulos activos");
  comprobar(["guarderia", "hotel", "estetica", "inventario"].every((m) => apagado.includes(m)), "apagado: Hotel, Guardería, Estética e Inventario siguen igual");
  for (const p of ["lotes_clinicos", "editar_ficha_clinica"]) {
    comprobar((await rpc(P.admin, "tiene_permiso", { p_permiso: p })).cuerpo === false, `apagado: «${p}» da falso aun para admin`);
  }
  comprobar((await rpc(P.admin, "tiene_permiso", { p_permiso: "administrar_modulos" })).cuerpo === true, "apagado: «administrar_modulos» sigue (es de la base: si no, nadie podría volver a prender)");
  const loteApagado = await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: insumo, p_codigo: `L2-${MARCA}`, p_caducidad: sumaDias(hoyB, 100), p_cantidad_compra: 1 });
  comprobar(!loteApagado.ok, `apagado: no se registran lotes («${loteApagado.mensaje.slice(0, 70)}»)`);
  const gato = await patch(P.admin, `perros?id=eq.${perro}`, { especie: "gato" });
  comprobar(!gato.ok, `apagado: una mascota no puede ser gato («${gato.mensaje.slice(0, 60)}»)`);
  const chip = await patch(P.admin, `perros?id=eq.${perro}`, { microchip: "985112345678901" });
  comprobar(!chip.ok, "apagado: no se captura microchip");
  const medico = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: P.adminId, p_cedula: `CED-${MARCA}`, p_cpa: null });
  comprobar(!medico.ok, `apagado: no se designan médicos («${medico.mensaje.slice(0, 60)}»)`);
  const permisoEst = await rpc(P.admin, "guardar_permiso_establecimiento", { p_id: null, p_tipo: "Licencia", p_numero: "1", p_autoridad: "x", p_nivel: "municipal", p_emision: null, p_vencimiento: null, p_aviso_dias: 60, p_notas: null });
  comprobar(!permisoEst.ok, "apagado: no se capturan permisos del establecimiento");
  const porVencer = await rpc(P.admin, "permisos_establecimiento_por_vencer");
  comprobar(porVencer.ok && porVencer.cuerpo.length === 0, "apagado: el recordatorio de vencimientos no devuelve nada");
  comprobar(Object.keys((await rpc(P.admin, "inventario_clinico_alertas")).cuerpo ?? {}).length === 0, "apagado: las alertas del inventario clínico no devuelven nada");
  const lotesConservados = (await SB.from("insumo_lotes").select("id").eq("insumo_id", insumo).is("deleted_at", null)).data ?? [];
  comprobar(lotesConservados.length === 1, "apagado: los datos se conservan (el lote sigue ahí)");
  // El producto con lotes sigue vendiéndose / consumiéndose aunque el módulo esté apagado (no truena la operación).
  const consumo = await SB.from("movimientos_inventario").insert({ negocio_id: B, insumo_id: insumo, tipo: "salida_consumo", cantidad_base: 10, motivo: "uso de otra parte de la app" });
  comprobar(!consumo.error, `apagado: un consumo de otra parte de la app sobre un producto con lotes no truena (${consumo.error?.message ?? "ok"})`);
  await fijarModulo("veterinaria", true);
  comprobar((await activos(P.admin)).includes("veterinaria"), "prendido de nuevo: regresa");
  const saldo = (await SB.from("insumo_lotes_saldo").select("saldo").eq("insumo_id", insumo).single()).data;
  comprobar(Number(saldo?.saldo) === 1990, `prendido de nuevo: el lote conserva su saldo y el consumo se repartió (${saldo?.saldo})`);
  comprobar((await rpc(P.admin, "tiene_permiso", { p_permiso: "lotes_clinicos" })).cuerpo === true, "prendido de nuevo: el permiso regresa");

  // ── 4. Confirmación ──
  seccion("4. Apagar con pendientes pide confirmación");
  const impacto = (await rpc(P.admin, "impacto_apagar_modulo", { p_modulo: "veterinaria" })).cuerpo;
  comprobar(impacto?.pendientes >= 1, `el impacto cuenta lo pendiente (${impacto?.pendientes} ${impacto?.que})`);
  const sinConfirmar = await rpc(P.admin, "cambiar_modulo", { p_modulo: "veterinaria", p_activo: false });
  comprobar(!sinConfirmar.ok && sinConfirmar.pista === "confirmar_apagado", `sin confirmar, la base lo rechaza («${sinConfirmar.mensaje.slice(0, 70)}…»)`);
  comprobar((await activos(P.admin)).includes("veterinaria"), "y el módulo sigue prendido");
  const confirmado = await rpc(P.admin, "cambiar_modulo", { p_modulo: "veterinaria", p_activo: false, p_confirmado: true });
  comprobar(confirmado.ok, "confirmado, se apaga");
  const ev = (await SB.from("negocio_modulos_eventos").select("*").eq("negocio_id", B).eq("modulo", "veterinaria").eq("activo", false).order("created_at", { ascending: false }).limit(1)).data?.[0];
  comprobar(ev?.confirmado === true && ev?.pendientes >= 1 && Boolean(ev?.pendientes_texto), "el historial guarda lo que había pendiente y que se confirmó");
  const editaEv = await SB.from("negocio_modulos_eventos").update({ confirmado: false }).eq("id", ev.id);
  comprobar(Boolean(editaEv.error), "el historial de módulos no se edita (ni con la llave de servidor)");
  const borraEv = await SB.from("negocio_modulos_eventos").delete().eq("id", ev.id);
  comprobar(Boolean(borraEv.error), "ni se borra");
  const apagaOtraVez = await rpc(P.admin, "cambiar_modulo", { p_modulo: "veterinaria", p_activo: false });
  comprobar(apagaOtraVez.ok, "apagar algo que ya estaba apagado no pide confirmar");
  await rpc(P.admin, "cambiar_modulo", { p_modulo: "veterinaria", p_activo: true });
  const lotes2 = (await SB.from("insumo_lotes").select("id").eq("insumo_id", insumo).is("deleted_at", null)).data ?? [];
  comprobar(lotes2.length === 1 && (await activos(P.admin)).includes("veterinaria"), "al prenderlo todo regresa, nada se borró");
  const impactoEst = (await rpc(P.admin, "impacto_apagar_modulo", { p_modulo: "estetica" })).cuerpo;
  comprobar(typeof impactoEst?.pendientes === "number" && Boolean(impactoEst?.que), `Estética también cuenta lo pendiente (${impactoEst?.pendientes} ${impactoEst?.que})`);
  for (const m of ["hotel", "guarderia"]) {
    const i = (await rpc(P.admin, "impacto_apagar_modulo", { p_modulo: m })).cuerpo;
    comprobar(typeof i?.pendientes === "number", `${m}: también cuenta lo pendiente`);
  }

  // ── 5. Dependencias ──
  seccion("5. Dependencias entre módulos");
  await fijarModulo("inventario", false);
  const sinInv = await activos(P.admin);
  comprobar(!sinInv.includes("inventario") && !sinInv.includes("veterinaria"), "sin Inventario, Veterinaria tampoco está activa");
  const filaVet = ((await rpc(P.admin, "mis_modulos")).cuerpo ?? []).find((m) => m.clave === "veterinaria");
  comprobar(filaVet?.encendido === true && filaVet?.activo === false && (filaVet?.requiere ?? []).includes("inventario"), "el panel la muestra prendida pero inactiva, con su dependencia");
  await fijarModulo("inventario", true);
  comprobar((await activos(P.admin)).includes("veterinaria"), "al prender Inventario regresa");
  const sinGuarderia = (await activos(P.admin)).includes("bonos");
  await fijarModulo("guarderia", false);
  comprobar(!(await activos(P.admin)).includes("bonos"), "day pass sigue dependiendo de guardería (regla de antes, ahora genérica)");
  await fijarModulo("guarderia", true);
  void sinGuarderia;

  // ── 6. Registro ──
  seccion("6. Escoger módulos al registrarse");
  const creados = [];
  const registrar = async (servicios, n) => {
    const email = `reg-vet-${MARCA}-${n}@ejemplo.test`;
    const { data: u, error } = await A.auth.admin.createUser({ email, password: "Prueba-12345", email_confirm: true });
    if (error) throw new Error(`usuario de prueba: ${error.message}`);
    const tel = `55${String(Date.now()).slice(-7)}${n}`.slice(0, 10);
    const r = await SB.rpc("registrar_negocio_prueba", {
      p_nombre: `Registro ${MARCA} ${n}`, p_ciudad: "Monterrey", p_telefono: tel, p_ip: `203.0.113.${(Date.now() % 200) + n}`,
      p_persona_id: u.user.id, p_modelo: LUDOGTEKA, p_dias: 15, p_servicios: servicios,
    });
    creados.push({ usuario: u.user.id, negocio: r.data?.[0]?.negocio_id, nombre: `Registro ${MARCA} ${n}` });
    return { r, negocio: r.data?.[0]?.negocio_id };
  };
  const a = await registrar(["veterinaria"], 1);
  comprobar(!a.r.error && a.negocio, `registro solo con Veterinaria (${a.r.error?.message ?? "ok"})`);
  if (a.negocio) {
    const act = (await servicioActivos(a.negocio));
    comprobar(act.includes("veterinaria") && act.includes("inventario"), "prende Veterinaria (con Inventario)");
    comprobar(!act.includes("estetica") && !act.includes("guarderia") && !act.includes("hotel"), "y deja apagado lo que no escogió");
    comprobar(a.r.data[0].plan_sugerido === "completo", "el plan sugerido es Completo (Inventario lo exige)");
  }
  const b = await registrar(["estetica", "veterinaria"], 2);
  if (b.negocio) {
    const act = await servicioActivos(b.negocio);
    comprobar(act.includes("estetica") && act.includes("veterinaria") && !act.includes("hotel"), "Estética + Veterinaria: solo esos dos servicios");
  }
  const c = await registrar(["estetica"], 3);
  if (c.negocio) {
    const act = await servicioActivos(c.negocio);
    comprobar(act.includes("estetica") && !act.includes("veterinaria"), "sin escogerla, Veterinaria queda apagada");
    const cambia = await SB.rpc("cambiar_modulo", { p_modulo: "veterinaria", p_activo: true });
    void cambia;
  }

  // ── 7. Aislamiento ──
  seccion("7. Aislamiento entre negocios");
  const ajenoLec = await get(tLud, "negocio_modulos_eventos?select=id,negocio_id", LUDOGTEKA);
  comprobar(ajenoLec.ok && (ajenoLec.cuerpo ?? []).every((e) => e.negocio_id !== B), "Ludogteka no lee el historial de módulos de Huellitas");
  const suplanta = await get(tLud, `negocio_modulos_eventos?select=id&negocio_id=eq.${B}`, LUDOGTEKA);
  comprobar(suplanta.ok && (suplanta.cuerpo ?? []).length === 0, "ni pidiéndolo por id");
  const apagaAjeno = await rpc(tLud, "cambiar_modulo", { p_modulo: "veterinaria", p_activo: true }, LUDOGTEKA);
  comprobar(apagaAjeno.ok, "el admin de Ludogteka mueve SOLO sus módulos (puede prender Veterinaria en Ludogteka…)");
  await rpc(tLud, "cambiar_modulo", { p_modulo: "veterinaria", p_activo: false }, LUDOGTEKA);
  comprobar(!(await activos(tLud, LUDOGTEKA)).includes("veterinaria") && (await activos(P.admin)).includes("veterinaria"), "…y lo deja como estaba, sin tocar Huellitas");
  const anonVet = await rpc(null, "modulos_activos", {}, LUDOGTEKA);
  comprobar(anonVet.ok, "la llave anónima solo sabe los módulos activos del dominio (como siempre)");
  for (const f of ["cambiar_modulo", "impacto_apagar_modulo", "mis_modulos", "guardar_medico_veterinario", "es_medico_veterinario"]) {
    const r = await rpc(null, f, f === "cambiar_modulo" ? { p_modulo: "veterinaria", p_activo: false } : f === "impacto_apagar_modulo" ? { p_modulo: "veterinaria" } : f === "guardar_medico_veterinario" ? { p_profile_id: P.adminId, p_cedula: "x", p_cpa: null } : {});
    comprobar(!r.ok || f === "mis_modulos", `la llave anónima no ejecuta ${f}`);
  }

  // Limpieza de lo creado en 6
  for (const c of creados) {
    if (!c.negocio) { await A.auth.admin.deleteUser(c.usuario); continue; }
    const { error } = await SB.rpc("plataforma_eliminar_negocio", { p_negocio_id: c.negocio, p_confirmacion: c.nombre });
    if (error) console.log(`  (no se pudo borrar el negocio de prueba ${c.nombre}: ${error.message})`);
    await A.auth.admin.deleteUser(c.usuario);
  }
} finally {
  // Huellitas como estaba: Veterinaria, Inventario, Guardería prendidos y sin permisos de prueba.
  for (const m of ["veterinaria", "inventario", "guarderia"]) await fijarModulo(m, true);
  for (const perm of [...PERMISOS_NUEVOS, "configuracion_negocio"]) { await quitar(P.admin, P.recConId, perm); await quitar(P.admin, P.recSinId, perm); }
}
terminar();

function datos_perro() {
  return datos.perroSoloB;
}
async function servicioActivos(negocio) {
  const cli = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": negocio } } });
  return (await cli.rpc("modulos_activos")).data ?? [];
}
