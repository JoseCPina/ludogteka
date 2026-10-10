// Ficha clínica de la mascota (SOLO DESARROLLO, en Huellitas; nunca Ludogteka).
// Migración 20261014000100.
//
//   node scripts/auditoria/ficha-clinica-dev.mjs
//
// 1. Con Veterinaria prendida y el permiso «Editar ficha clínica»: especie,
//    microchip (normalizado y único), folio de registro y notas clínicas.
// 2. Sin el permiso (recepción sin él, estética, cliente, anónimo) nada de eso
//    se escribe, ni por la API directa ni dando de alta; lo de siempre (peso,
//    esterilización, alergias, nombre) sigue igual.
// 3. Con Veterinaria apagada: solo perros, nada clínico; los datos se conservan.
// 4. Peso con historial por fecha.
// 5. Aislamiento entre negocios y llave anónima.
import { A, B, SB, LUDOGTEKA, datos, rpc, get, post, patch, personas, dar, quitar, fijarModulo, hoy, sumaDias, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";
import { tokenDe } from "./sesiones-dev.mjs";

const P = await personas();
const MARCA = `ficha-${String(Date.now()).slice(-6)}`;
const chip = (n) => `98511${String(Date.now()).slice(-6)}${n}`.padEnd(15, "0").slice(0, 15);
const nuevoPerro = async (nombre) => {
  const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `${nombre} ${MARCA}` }).select("id").single();
  if (r.error) throw new Error(`perro: ${r.error.message}`);
  return r.data.id;
};
const fila = async (id) => (await SB.from("perros").select("*").eq("id", id).single()).data;

try {
  await fijarModulo("veterinaria", true);
  await fijarModulo("inventario", true);
  await quitar(P.admin, P.recConId, "editar_ficha_clinica");
  await quitar(P.admin, P.recSinId, "editar_ficha_clinica");
  const p1 = await nuevoPerro("Fichita");
  const p2 = await nuevoPerro("Segundo");

  seccion("1. Con el permiso");
  const c1 = chip(1);
  const ok = await patch(P.admin, `perros?id=eq.${p1}`, { especie: "gato", microchip: `${c1.slice(0, 3)} ${c1.slice(3, 9)}-${c1.slice(9)}`, folio_registro: "RUAC-123", notas_clinicas: "Alergia a penicilinas, ver expediente." });
  comprobar(ok.ok, `admin captura especie, microchip, folio y notas (${ok.mensaje})`);
  let f = await fila(p1);
  comprobar(f.especie === "gato" && f.microchip === c1 && f.folio_registro === "RUAC-123" && /penicilinas/.test(f.notas_clinicas), "quedaron guardados, con el microchip sin espacios ni guiones");
  const otro = await patch(P.admin, `perros?id=eq.${p1}`, { especie: "otro", especie_detalle: "Conejo" });
  f = await fila(p1);
  comprobar(otro.ok && f.especie === "otro" && f.especie_detalle === "Conejo", "especie «otro» guarda cuál es");
  await patch(P.admin, `perros?id=eq.${p1}`, { especie: "perro" });
  f = await fila(p1);
  comprobar(f.especie === "perro" && f.especie_detalle === null, "volver a «perro» limpia el detalle");
  const dup = await patch(P.admin, `perros?id=eq.${p2}`, { microchip: c1 });
  comprobar(!dup.ok, `el mismo microchip en otra mascota se rechaza («${dup.mensaje.slice(0, 60)}»)`);
  const corto = await patch(P.admin, `perros?id=eq.${p2}`, { microchip: "123" });
  comprobar(!corto.ok, "un microchip de 3 caracteres se rechaza");
  const raro = await patch(P.admin, `perros?id=eq.${p2}`, { microchip: "98511 ¿?" });
  comprobar(!raro.ok, "y uno con símbolos");
  const malaEspecie = await patch(P.admin, `perros?id=eq.${p2}`, { especie: "dragon" });
  comprobar(!malaEspecie.ok, "una especie fuera de perro/gato/otro se rechaza");
  const vacio = await patch(P.admin, `perros?id=eq.${p1}`, { folio_registro: "   " });
  f = await fila(p1);
  comprobar(vacio.ok && f.folio_registro === null, "un folio en blanco se guarda como vacío");

  seccion("2. Sin el permiso");
  const sinPermiso = [["recepción sin permiso", P.recSin], ["estética", P.estetica]];
  for (const [quien, token] of sinPermiso) {
    for (const campo of [{ microchip: chip(2) }, { folio_registro: "X-1" }, { notas_clinicas: "algo" }, { especie: "gato" }]) {
      const r = await patch(token, `perros?id=eq.${p2}`, campo);
      comprobar(!r.ok || (Array.isArray(r.cuerpo) && r.cuerpo.length === 0), `${quien} no escribe ${Object.keys(campo)[0]}`);
    }
  }
  const nuevoSin = await post(P.recSin, "perros", { cliente_id: datos.clienteSoloB, nombre: `Nuevo ${MARCA}`, microchip: chip(3) });
  comprobar(!nuevoSin.ok, "recepción sin permiso no da de alta una mascota con microchip");
  const nuevoSimple = await post(P.recSin, "perros", { cliente_id: datos.clienteSoloB, nombre: `Simple ${MARCA}` });
  comprobar(nuevoSimple.ok, "pero sí da de alta una mascota normal (sin datos clínicos): el flujo de siempre no cambia");
  const clienteEdita = await patch(P.cliente, `perros?id=eq.${p2}`, { microchip: chip(4) });
  comprobar(!clienteEdita.ok || (clienteEdita.cuerpo ?? []).length === 0, "el cliente no escribe nada clínico");
  const anon = await patch(null, `perros?id=eq.${p2}`, { microchip: chip(5) });
  comprobar(!anon.ok || (anon.cuerpo ?? []).length === 0, "la llave anónima tampoco");
  // Lo de siempre sigue sin el permiso
  const estSin = await patch(P.recSin, `perros?id=eq.${p2}`, { esterilizado: true });
  comprobar(estSin.ok && (await fila(p2)).esterilizado === true, "recepción sin permiso sí edita la esterilización (dato de siempre)");
  const nombre = await patch(P.recSin, `perros?id=eq.${p2}`, { nombre: `Segundo editado ${MARCA}` });
  comprobar(nombre.ok, "y el nombre");
  // Con el permiso, recepción sí
  await dar(P.admin, P.recConId, "editar_ficha_clinica");
  comprobar(((await rpc(P.recCon, "mis_permisos")).cuerpo ?? []).includes("editar_ficha_clinica"), "admin le da «Editar ficha clínica» a una recepcionista");
  const c2 = chip(6);
  const conPermiso = await patch(P.recCon, `perros?id=eq.${p2}`, { microchip: c2, notas_clinicas: "Revisión anual" });
  comprobar(conPermiso.ok && (await fila(p2)).microchip === c2, "y con él recepción captura la ficha");
  const nuevoCon = await post(P.recCon, "perros", { cliente_id: datos.clienteSoloB, nombre: `Con chip ${MARCA}`, especie: "gato", microchip: chip(7) });
  comprobar(nuevoCon.ok, "y da de alta una mascota con especie y microchip");
  const rechazo = await patch(P.recSin, `perros?id=eq.${p2}`, { microchip: chip(8) });
  comprobar(!rechazo.ok, "la otra recepcionista, sin permiso, sigue sin poder");

  seccion("3. Veterinaria apagada");
  await fijarModulo("veterinaria", false);
  const gato = await patch(P.admin, `perros?id=eq.${p2}`, { especie: "gato" });
  comprobar(!gato.ok, `apagado: ni admin registra un gato («${gato.mensaje.slice(0, 60)}»)`);
  const chipApagado = await patch(P.admin, `perros?id=eq.${p2}`, { microchip: chip(9) });
  comprobar(!chipApagado.ok, "apagado: ni admin cambia el microchip");
  comprobar(((await rpc(P.recCon, "tiene_permiso", { p_permiso: "editar_ficha_clinica" })).cuerpo) === false, "apagado: el permiso no da nada aunque se tenga");
  const normal = await patch(P.admin, `perros?id=eq.${p2}`, { nombre: `Segundo ${MARCA}` });
  comprobar(normal.ok, "apagado: editar una mascota normal funciona igual que siempre");
  const f2 = await fila(p2);
  comprobar(f2.microchip === c2 && f2.notas_clinicas === "Revisión anual", "apagado: los datos clínicos se conservan");
  const servidor = await SB.from("perros").update({ folio_registro: "SERV-1" }).eq("id", p2);
  comprobar(!servidor.error, "la llave de servidor (el alta por link) queda exenta");
  await fijarModulo("veterinaria", true);
  comprobar((await fila(p2)).microchip === c2, "prendido otra vez: todo sigue ahí");

  seccion("4. Peso con historial por fecha");
  const hoyB = await hoy(P.admin);
  for (const [dias, kg] of [[-30, 4.2], [-10, 4.6], [0, 4.9]]) {
    const r = await post(P.recSin, "pesos_registrados", { perro_id: p1, peso_kg: kg, fecha: sumaDias(hoyB, dias), notas: MARCA });
    comprobar(r.ok, `se registra un peso de ${kg} kg del ${sumaDias(hoyB, dias)}`);
  }
  const pesos = (await get(P.admin, `pesos_registrados?perro_id=eq.${p1}&select=peso_kg,fecha&order=fecha.desc`)).cuerpo ?? [];
  comprobar(pesos.length === 3 && Number(pesos[0].peso_kg) === 4.9 && Number(pesos[2].peso_kg) === 4.2, "el historial viene ordenado por fecha, con el último peso arriba");

  seccion("5. Aislamiento");
  const { data: adminsL } = await A.from("membresias").select("profile_id").eq("rol", "admin").is("deleted_at", null).limit(1);
  const tLud = await tokenDe(adminsL[0].profile_id);
  const ajeno = await get(tLud, `perros?id=eq.${p1}&select=id,microchip`, LUDOGTEKA);
  comprobar(ajeno.ok && (ajeno.cuerpo ?? []).length === 0, "Ludogteka no lee las mascotas de Huellitas");
  const escribe = await patch(tLud, `perros?id=eq.${p1}`, { microchip: chip(0) }, LUDOGTEKA);
  comprobar(!escribe.ok || (escribe.cuerpo ?? []).length === 0, "ni les escribe");
  const suplanta = await get(tLud, `perros?id=eq.${p1}&select=id`, B);
  comprobar(!suplanta.ok || (suplanta.cuerpo ?? []).length === 0, "ni suplantando el encabezado del negocio");
  const anonLee = await get(null, `perros?select=id,microchip&microchip=not.is.null`);
  comprobar(!anonLee.ok || (anonLee.cuerpo ?? []).length === 0, "la llave anónima no lee microchips");

  // Limpieza
  await SB.from("pesos_registrados").delete().eq("notas", MARCA);
  await SB.from("perros").update({ deleted_at: new Date().toISOString() }).like("nombre", `%${MARCA}`);
} finally {
  await fijarModulo("veterinaria", true);
  await quitar(P.admin, P.recConId, "editar_ficha_clinica");
  await quitar(P.admin, P.recSinId, "editar_ficha_clinica");
}
terminar();
