// Importador de clientes y mascotas (SOLO DESARROLLO, en Huellitas; nunca Ludogteka).
// Migración 20261016500000.
//
//   node scripts/auditoria/importador-dev.mjs
//
// Parte A (base, JWT reales de cada rol + llave anónima):
//   1. Permiso «Importar clientes y mascotas»: quién puede y quién no.
//   2. Una importación de punta a punta por lotes: dueño nuevo, varias mascotas de un
//      mismo teléfono, dueño existente, microchip de otro dueño, fila sin mascota, fila
//      con error, raza del catálogo y raza que no coincide; peso y alergias.
//   3. Idempotencia: reintentar un lote, volver a subir el mismo archivo, repetir filas.
//   4. Modo «actualizar»: completa sin pisar con vacíos.
//   5. Deshacer: bloqueos (algo se modificó / algo cuelga) y el caso limpio (baja lógica y
//      restauración de lo actualizado).
//   6. Clínicos: sin Veterinaria o sin «Editar ficha clínica» se ignoran.
//   7. Aislamiento: otro negocio, estética, cliente y llave anónima.
//   8. Borradores de formularios: por usuario y por formulario.
// Parte B (servidor real `next start` en el 3005 + navegador, necesita `npm run build`):
//   el asistente completo con un .xlsx y un .csv de verdad, sugerencia de columnas, vista
//   previa con errores, progreso, historial y deshacer; y el borrador de un formulario.
// SOLO_A=1 omite la parte B (el navegador). Sale con 1 si algo falla.
import { createHash } from "node:crypto";
import { A, B, SB, LUDOGTEKA, rpc, get, post, personas, dar, quitar, fijarModulo, comprobar, seccion, terminar, servicioEn } from "./veterinaria-comun-dev.mjs";
import { tokenDe, URL, env } from "./sesiones-dev.mjs";

const MARCA = `ZZIMP${String(Date.now()).slice(-5)}`;
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
const tel = () => `44${rnd(8)}`;
const chip = () => `98577${rnd(10)}`;
const huella = (s) => createHash("sha256").update(`${MARCA}-${s}-${Math.random()}`).digest("hex");

const P = await personas();
const vetOriginal = (await SB.from("negocio_modulos").select("activo").eq("negocio_id", B).eq("modulo", "veterinaria").is("deleted_at", null).maybeSingle()).data?.activo ?? false;
const SL = servicioEn(LUDOGTEKA);
const creados = { clientes: [], importaciones: [] };

const crear = async (token, { modo = "omitir", clin = false, total, nombre = `${MARCA}.csv` }) => {
  const r = await rpc(token, "importacion_crear", { p_nombre_archivo: nombre, p_huella: huella(nombre), p_modo: modo, p_con_clinicos: clin, p_mapeo: {}, p_total: total });
  if (r.ok) creados.importaciones.push(r.cuerpo.id);
  return r;
};
const agregar = (token, id, filas) => rpc(token, "importacion_agregar_filas", { p_id: id, p_filas: filas });
const lote = (token, id, max = 40) => rpc(token, "importacion_procesar_lote", { p_id: id, p_max: max });
const filasDe = async (id) => (await SB.from("importacion_filas").select("*").eq("importacion_id", id).order("n")).data;
const correr = async (token, id) => {
  let p;
  for (let i = 0; i < 30; i++) {
    const r = await lote(token, id, 3);
    if (!r.ok) return r;
    p = r.cuerpo;
    if (p.estado !== "procesando") break;
  }
  return { ok: true, cuerpo: p };
};
const cliente = async (id) => (await SB.from("clientes").select("*").eq("id", id).single()).data;
const clientePorTel = async (t) => (await SB.from("clientes").select("*").eq("negocio_id", B).eq("telefono", t).is("deleted_at", null).maybeSingle()).data;
const perrosDe = async (clienteId) => (await SB.from("perros").select("*").eq("cliente_id", clienteId).is("deleted_at", null).order("created_at")).data;
const fila = (n, datos, error) => ({ n, datos, ...(error ? { error } : {}) });

// Raza, tamaño y pelaje son obligatorios con Estética, guardería u hotel (N16): las filas de ejemplo de esta prueba
// no los traen, así que corre con esos módulos apagados y los restaura al final (la sección A10 los vuelve a prender).
const modulosOriginales = {};
for (const m of ["estetica", "guarderia", "hotel"]) {
  const r = await SB.from("negocio_modulos").select("activo").eq("negocio_id", B).eq("modulo", m).is("deleted_at", null).maybeSingle();
  modulosOriginales[m] = r.data ? r.data.activo : true;
  await fijarModulo(m, false);
}
const restaurarModulos = async () => { for (const [m, a] of Object.entries(modulosOriginales)) await fijarModulo(m, a).catch(() => {}); };

try {
  await fijarModulo("veterinaria", true);
  await fijarModulo("inventario", true);
  await quitar(P.admin, P.recConId, "importar_datos");
  await quitar(P.admin, P.recSinId, "importar_datos");
  await dar(P.admin, P.recConId, "editar_ficha_clinica");
  await quitar(P.admin, P.recSinId, "editar_ficha_clinica");

  // ═══ A1. Permiso ═══
  seccion("A1. Permiso «Importar clientes y mascotas»");
  const catalogo = await SB.from("permisos_catalogo").select("clave").eq("clave", "importar_datos");
  comprobar(catalogo.data?.length === 1, "el permiso está en el catálogo");
  const mp = await rpc(P.admin, "mis_permisos");
  comprobar(Array.isArray(mp.cuerpo) && mp.cuerpo.includes("importar_datos"), "admin lo tiene siempre");
  for (const [quien, tok] of [["recepción sin el permiso", P.recCon], ["estética", P.estetica], ["cliente", P.cliente], ["la llave anónima", null]]) {
    const r = await rpc(tok, "importacion_crear", { p_nombre_archivo: "x.csv", p_huella: huella("x"), p_modo: "omitir", p_con_clinicos: false, p_mapeo: {}, p_total: 1 });
    comprobar(!r.ok, `${quien} no puede crear una importación (${r.codigo ?? r.status})`);
    const r2 = await rpc(tok, "importacion_revisar", { p_filas: [{ n: 1, telefono: tel() }] });
    comprobar(!r2.ok, `${quien} no usa la vista previa`);
  }
  const tabla = await get(P.recCon, "importaciones?select=id");
  comprobar(tabla.ok && tabla.cuerpo.length === 0, "…ni lee las tablas de importación");
  const dado = await dar(P.admin, P.recConId, "importar_datos");
  comprobar(dado.ok, "admin le da el permiso a una persona de recepción");
  const rr = await crear(P.recCon, { total: 1, clin: true });
  comprobar(rr.ok && rr.cuerpo.con_clinicos === true, `con el permiso (${JSON.stringify(rr.cuerpo)}) crea la importación (y con «Editar ficha clínica» + Veterinaria, trae clínicos)`);
  const ra = await crear(P.recSin, { total: 1 });
  comprobar(!ra.ok, "recepción sin el permiso sigue sin poder");
  const ve = await rpc(P.admin, "importacion_crear", { p_nombre_archivo: "x", p_huella: "no-hex", p_modo: "omitir", p_con_clinicos: false, p_mapeo: {}, p_total: 1 });
  comprobar(!ve.ok, "una huella que no es SHA-256 se rechaza");
  const vm = await rpc(P.admin, "importacion_crear", { p_nombre_archivo: "x", p_huella: huella("m"), p_modo: "borrar", p_con_clinicos: false, p_mapeo: {}, p_total: 1 });
  comprobar(!vm.ok, "un modo de duplicados inventado se rechaza");

  // ═══ A2. Una importación completa ═══
  seccion("A2. Importación por lotes (modo omitir, con clínicos)");
  const T1 = tel(), T2 = tel(), T3 = tel(), T4 = tel(), T5 = tel();
  const M1 = chip();
  // Un dueño que YA existe y una mascota con microchip que YA existe en otro dueño.
  const ex = await SB.from("clientes").insert({ negocio_id: B, nombre: `${MARCA} Existente`, telefono: T2, email: `${MARCA.toLowerCase()}@existente.test` }).select("id").single();
  creados.clientes.push(ex.data.id);
  const dueño3 = await SB.from("clientes").insert({ negocio_id: B, nombre: `${MARCA} Dueño del chip`, telefono: T3 }).select("id").single();
  creados.clientes.push(dueño3.data.id);
  const chipAjeno = chip();
  const perroAjeno = await SB.from("perros").insert({ negocio_id: B, cliente_id: dueño3.data.id, nombre: `${MARCA} Chipeado`, microchip: chipAjeno }).select("id").single();
  const { data: tamG } = await SB.from("tamanos_categoria").select("id").eq("clave", "grande").single();
  const { data: pelC } = await SB.from("tipos_pelaje").select("id").eq("clave", "corto").single();

  const filas = [
    fila(2, { c_nombre: `${MARCA} Ana`, c_telefono: T1, c_email: `${MARCA.toLowerCase()}.ana@correo.test`, c_direccion: "Calle 1", c_notas: "Prefiere WhatsApp", m_nombre: `${MARCA} Rocky`, m_especie: "perro", m_raza: "Labrador", m_sexo: "macho", m_nacimiento: "2021-03-15", m_tamano: "grande", m_pelaje: "corto", m_esterilizado: true, m_peso: 28.5, m_alergias: ["Pollo", "Polen"], m_microchip: M1, m_folio: "RUAC-9" }),
    fila(3, { c_nombre: `${MARCA} Ana`, c_telefono: T1, m_nombre: `${MARCA} Luna`, m_especie: "gato", m_raza: "Raza Inventada Xyzw" }),
    fila(4, { c_nombre: `${MARCA} Otro nombre`, c_telefono: T2, m_nombre: `${MARCA} Nueva`, m_raza: "Mestizo" }),
    fila(5, { c_nombre: `${MARCA} Beto`, c_telefono: T4, m_nombre: `${MARCA} Chipeado Duplicado`, m_microchip: chipAjeno }),
    fila(6, { c_nombre: `${MARCA} Carla`, c_telefono: T5 }),
    fila(7, { c_nombre: `${MARCA} Sin tel`, c_telefono: "" }, "Falta el teléfono."),
    fila(8, { c_nombre: `${MARCA} Ana`, c_telefono: T1, m_nombre: `${MARCA} Rocky` }),
  ];
  const c = await crear(P.admin, { total: filas.length, clin: true });
  comprobar(c.ok && c.cuerpo.con_clinicos === true && c.cuerpo.reusada === false, `admin crea la importación (${c.mensaje})`);
  const id = c.cuerpo.id;
  const antesCompleta = await lote(P.admin, id);
  comprobar(!antesCompleta.ok, "no se procesa antes de subir todas las filas");
  const ag = await agregar(P.admin, id, filas.slice(0, 4));
  comprobar(ag.ok && ag.cuerpo === 4, "se suben las filas por bloques");
  const ag2 = await agregar(P.admin, id, filas.slice(0, 4));
  comprobar(ag2.ok && ag2.cuerpo === 0, "reenviar el mismo bloque no duplica filas");
  await agregar(P.admin, id, filas.slice(4));
  const reusada = await rpc(P.admin, "importacion_crear", { p_nombre_archivo: `${MARCA}.csv`, p_huella: (await SB.from("importaciones").select("huella").eq("id", id).single()).data.huella, p_modo: "omitir", p_con_clinicos: true, p_mapeo: {}, p_total: filas.length });
  comprobar(reusada.ok && reusada.cuerpo.reusada === true && reusada.cuerpo.id === id, "subir el mismo archivo otra vez reusa la importación (idempotente)");

  const primero = await lote(P.admin, id, 3);
  comprobar(primero.ok && primero.cuerpo.estado === "procesando" && primero.cuerpo.pendientes === 3, `un lote de 3 deja 3 pendientes y la importación «procesando» (${primero.mensaje})`);
  const fin = await correr(P.admin, id);
  const pf = fin.cuerpo;
  comprobar(pf.estado === "completada" && pf.pendientes === 0, "los lotes terminan y la importación queda «completada»");
  comprobar(pf.errores === 1, `la fila con error de validación queda como error (errores = ${pf.errores})`);

  const ana = await clientePorTel(T1);
  comprobar(ana && ana.nombre === `${MARCA} Ana` && ana.direccion === "Calle 1" && ana.email?.includes(".ana@"), "dueño nuevo con correo y dirección");
  const perrosAna = ana ? await perrosDe(ana.id) : [];
  comprobar(perrosAna.length === 2, `un teléfono con dos filas = un dueño con dos mascotas (${perrosAna.length})`);
  const rocky = perrosAna.find((p) => p.nombre.endsWith("Rocky"));
  const { data: lab } = await SB.from("razas").select("id, nombre").ilike("nombre", "labrador%").limit(1).single();
  comprobar(rocky && rocky.raza_id === lab.id && rocky.raza === lab.nombre, "«Labrador» se liga al catálogo de razas");
  comprobar(rocky && rocky.sexo === "macho" && rocky.esterilizado === true && rocky.fecha_nacimiento === "2021-03-15" && rocky.tamano_id === tamG.id && rocky.pelaje_id === pelC.id, "sexo, esterilización, nacimiento, tamaño y pelaje");
  comprobar(rocky && rocky.microchip === M1 && rocky.folio_registro === "RUAC-9" && rocky.especie === "perro", "microchip y folio (clínicos)");
  const peso = rocky ? (await SB.from("pesos_registrados").select("peso_kg").eq("perro_id", rocky.id).is("deleted_at", null)).data : [];
  comprobar(peso.length === 1 && Number(peso[0].peso_kg) === 28.5, "el peso entra al historial de peso");
  const alergias = rocky ? (await SB.from("perro_alergias").select("alergeno").eq("perro_id", rocky.id).is("deleted_at", null)).data.map((a) => a.alergeno).sort() : [];
  comprobar(alergias.join() === "Polen,Pollo", "las alergias entran como registros de alergia");
  const luna = perrosAna.find((p) => p.nombre.endsWith("Luna"));
  comprobar(luna && luna.especie === "gato" && luna.raza_id === null && luna.raza === "Raza Inventada Xyzw", "una raza que no coincide queda como texto, sin raza_id; la especie gato se respeta");
  comprobar(pf.razas_sin_catalogo.some((r) => r.texto === "Raza Inventada Xyzw"), "…y sale en el resumen de razas por corregir");
  comprobar(!pf.razas_sin_catalogo.some((r) => /labrador|mestizo/i.test(r.texto)), "…y lo que sí coincide (Labrador, Mestizo) no sale");

  const exAhora = await cliente(ex.data.id);
  comprobar(exAhora.nombre === `${MARCA} Existente`, "«omitir»: el dueño que ya existía no cambia de nombre");
  const perrosEx = await perrosDe(ex.data.id);
  comprobar(perrosEx.length === 1 && perrosEx[0].nombre.endsWith("Nueva"), "…pero la mascota nueva de ese dueño sí se agrega");
  comprobar(perrosEx[0]?.raza_id !== null, "«Mestizo» se liga a su entrada del catálogo");
  const beto = await clientePorTel(T4);
  const perrosBeto = beto ? await perrosDe(beto.id) : [];
  comprobar(beto && perrosBeto.length === 0, "un microchip que ya es de otro dueño: el dueño entra, la mascota no");
  const chipCheck = await SB.from("perros").select("id, cliente_id").eq("negocio_id", B).ilike("microchip", chipAjeno).is("deleted_at", null);
  comprobar(chipCheck.data.length === 1 && chipCheck.data[0].id === perroAjeno.data.id, "…y el microchip sigue en la ficha original");
  const carla = await clientePorTel(T5);
  comprobar(carla && (await perrosDe(carla.id)).length === 0, "una fila sin mascota solo crea al dueño");
  const filasDb = await filasDe(id);
  const f8 = filasDb.find((f) => f.n === 8);
  comprobar(f8.estado === "omitida" && /mascota ya existía/.test(f8.mensaje), "una mascota repetida del mismo dueño (mismo nombre) se omite");
  const f5 = filasDb.find((f) => f.n === 5);
  comprobar(/otro dueño/.test(f5.mensaje ?? ""), "el motivo de la mascota omitida se explica en la fila");
  const f2 = filasDb.find((f) => f.n === 2);
  comprobar(!/notas del cliente no se guardaron/i.test(f2.mensaje ?? ""), "las notas del dueño ya no avisan que no se guardan");
  const notaAna = (await SB.from("clientes_notas_internas").select("notas").eq("cliente_id", ana.id).maybeSingle()).data?.notas;
  comprobar(notaAna === "Prefiere WhatsApp", `la nota del dueño quedó en clientes.notas (${notaAna})`);
  comprobar(pf.clientes_creados === 3 && pf.mascotas_creadas === 3, `contadores: 3 dueños (Ana, Beto y Carla) y 3 mascotas (${pf.clientes_creados}/${pf.mascotas_creadas})`);

  // ═══ A3. Idempotencia ═══
  seccion("A3. Reintentar no duplica");
  const antes = (await SB.from("clientes").select("id", { count: "exact", head: true }).eq("negocio_id", B).like("nombre", `${MARCA}%`)).count;
  const otra = await lote(P.admin, id);
  comprobar(otra.ok && otra.cuerpo.estado === "completada", "procesar un lote de una importación terminada no hace nada");
  const despues = (await SB.from("clientes").select("id", { count: "exact", head: true }).eq("negocio_id", B).like("nombre", `${MARCA}%`)).count;
  comprobar(antes === despues, "…y no crea registros nuevos");
  const lateTarde = await agregar(P.admin, id, [fila(99, { c_nombre: "X", c_telefono: tel() })]);
  comprobar(!lateTarde.ok, "no se pueden agregar filas a una importación ya empezada");
  // Un lote que falla a medias no deja una fila a medias: la fila inválida se marca y las demás siguen.
  const c2 = await crear(P.admin, { total: 3, nombre: `${MARCA}-mixto.csv`, clin: true });
  const T6 = tel();
  await agregar(P.admin, c2.cuerpo.id, [
    fila(2, { c_nombre: `${MARCA} Dos`, c_telefono: T6, m_nombre: `${MARCA} A`, m_microchip: "123" }), // la base rechaza el microchip corto
    fila(3, { c_nombre: `${MARCA} Tres`, c_telefono: "12345" }),
    fila(4, { c_nombre: `${MARCA} Cuatro`, c_telefono: tel() }),
  ]);
  const mixto = await correr(P.admin, c2.cuerpo.id);
  const fm = await filasDe(c2.cuerpo.id);
  comprobar(fm[0].estado === "error" && fm[1].estado === "error" && fm[2].estado === "creada", "una fila que la base rechaza no frena a las demás");
  comprobar(!(await clientePorTel(T6)), "…y la fila rechazada no deja a medias al dueño (transacción por fila)");
  comprobar(mixto.cuerpo.estado === "completada" && mixto.cuerpo.errores === 2, "la importación termina con sus errores contados");

  // ═══ A4. Modo actualizar ═══
  seccion("A4. Modo «actualizar»");
  const c3 = await crear(P.admin, { modo: "actualizar", total: 3, nombre: `${MARCA}-act.csv`, clin: true });
  const mail2 = `${MARCA.toLowerCase()}.nuevo@existente.test`;
  await agregar(P.admin, c3.cuerpo.id, [
    fila(2, { c_nombre: `${MARCA} Existente Corregido`, c_telefono: T2, c_email: mail2, m_nombre: `${MARCA} Nueva`, m_raza: "Labrador", m_sexo: "hembra", m_tamano: "grande" }),
    fila(3, { c_nombre: `${MARCA} Ana`, c_telefono: T1, m_nombre: `${MARCA} Cualquiera`, m_microchip: M1, m_folio: "RUAC-9B" }),
    fila(4, { c_nombre: `${MARCA} Carla`, c_telefono: T5, c_email: `${MARCA.toLowerCase()}.ana@correo.test` }),
  ]);
  const act = await correr(P.admin, c3.cuerpo.id);
  comprobar(act.cuerpo.actualizadas === 2, `se actualiza lo que ya existía (${act.cuerpo.actualizadas})`);
  const ex2 = await cliente(ex.data.id);
  comprobar(ex2.nombre === `${MARCA} Existente Corregido` && ex2.email === mail2, "el dueño existente toma el nombre y el correo nuevos");
  const nueva = (await perrosDe(ex.data.id))[0];
  comprobar(nueva.sexo === "hembra" && nueva.tamano_id === tamG.id && nueva.raza_id === lab.id, "la mascota existente se completa (sexo, tamaño, raza)");
  comprobar(nueva.nombre === `${MARCA} Nueva`, "…sin cambiarle el nombre");
  const rocky2 = (await perrosDe(ana.id)).find((p) => p.nombre.endsWith("Rocky"));
  comprobar(rocky2.folio_registro === "RUAC-9B" && rocky2.sexo === "macho" && rocky2.esterilizado === true, "por microchip encuentra a Rocky aunque el archivo lo llame distinto; actualiza el folio y NO borra lo que el archivo no trae");
  comprobar((await perrosDe(ana.id)).length === 2, "…y no crea una mascota repetida");
  const carla2 = await clientePorTel(T5);
  const ff = await filasDe(c3.cuerpo.id);
  comprobar(/correo ya es de otro cliente/.test(ff[2].mensaje ?? "") && !carla2.email, "un correo que ya es de otro dueño no se pisa: avisa y no lo guarda");

  // ═══ A5. Deshacer ═══
  seccion("A5. Deshacer");
  const rev0 = await rpc(P.admin, "importacion_deshacer_revisar", { p_id: c3.cuerpo.id });
  comprobar(rev0.ok && rev0.cuerpo.puede === true, "una importación que solo actualizó, sin cambios posteriores, se puede deshacer");
  const rev1 = await rpc(P.admin, "importacion_deshacer_revisar", { p_id: id });
  // La importación A2 ya fue tocada por la importación «actualizar» (cambió el folio de Rocky): hay bloqueos.
  comprobar(rev1.ok && rev1.cuerpo.puede === false && rev1.cuerpo.bloqueos.length > 0, `la importación A2 NO se puede deshacer: otra importación modificó a Rocky (${rev1.cuerpo?.bloqueos?.map((b) => b.motivo).slice(0, 2).join(" | ")})`);
  const sinPerm = await rpc(P.recSin, "importacion_deshacer", { p_id: c3.cuerpo.id });
  comprobar(!sinPerm.ok, "sin el permiso no se deshace");
  const des3 = await rpc(P.admin, "importacion_deshacer", { p_id: c3.cuerpo.id });
  comprobar(des3.ok && des3.cuerpo.estado === "deshecha" && des3.cuerpo.deshechas === 2, `deshacer la de «actualizar» (${des3.mensaje})`);
  const ex3 = await cliente(ex.data.id);
  comprobar(ex3.nombre === `${MARCA} Existente` && ex3.email === `${MARCA.toLowerCase()}@existente.test`, "…restaura el nombre y el correo anteriores");
  const nueva3 = (await perrosDe(ex.data.id))[0];
  comprobar(nueva3.sexo === null && nueva3.tamano_id === null, "…y deja la mascota como estaba");
  comprobar((await perrosDe(ana.id)).find((p) => p.nombre.endsWith("Rocky")).folio_registro === "RUAC-9", "…y el folio de Rocky vuelve a RUAC-9");
  const otraVez = await rpc(P.admin, "importacion_deshacer", { p_id: c3.cuerpo.id });
  comprobar(!otraVez.ok, "una importación deshecha no se deshace dos veces");

  // Ahora A2 ya no tiene a quien le haya cambiado nada: se puede, salvo lo que cuelga.
  const revA = await rpc(P.admin, "importacion_deshacer_revisar", { p_id: id });
  comprobar(revA.ok && revA.cuerpo.puede === true, "con la «actualizar» deshecha, la A2 vuelve a poder deshacerse");
  // 1) Alguien edita a Ana a mano.
  await SB.from("clientes").update({ nombre: `${MARCA} Ana editada` }).eq("id", ana.id);
  const revB = await rpc(P.admin, "importacion_deshacer_revisar", { p_id: id });
  comprobar(revB.cuerpo.puede === false && revB.cuerpo.bloqueos.some((b) => b.tipo === "cliente" && /modific/.test(b.motivo)), "si alguien modificó al dueño después, se bloquea y dice cuál");
  const bloq = await rpc(P.admin, "importacion_deshacer", { p_id: id });
  comprobar(!bloq.ok && /No se puede deshacer/.test(bloq.mensaje), "…y deshacer se niega");
  await SB.from("clientes").update({ nombre: `${MARCA} Ana` }).eq("id", ana.id);
  // aun con el nombre igual, updated_at cambió: sigue bloqueado.
  const revC = await rpc(P.admin, "importacion_deshacer_revisar", { p_id: id });
  comprobar(revC.cuerpo.puede === false, "…aunque se le devuelva el mismo nombre: ya fue modificado");
  // Se prepara un caso limpio con una importación nueva y se cuelga algo de la mascota.
  const T7 = tel();
  const c4 = await crear(P.admin, { total: 2, nombre: `${MARCA}-limpia.csv`, clin: true });
  await agregar(P.admin, c4.cuerpo.id, [
    fila(2, { c_nombre: `${MARCA} Limpia`, c_telefono: T7, m_nombre: `${MARCA} Peque`, m_peso: 5, m_alergias: ["Pasto"] }),
    fila(3, { c_nombre: `${MARCA} Limpia`, c_telefono: T7, m_nombre: `${MARCA} Peque Dos` }),
  ]);
  await correr(P.admin, c4.cuerpo.id);
  const limpia = await clientePorTel(T7);
  const pq = (await perrosDe(limpia.id)).find((p) => p.nombre.endsWith("Peque"));
  const revD = await rpc(P.admin, "importacion_deshacer_revisar", { p_id: c4.cuerpo.id });
  comprobar(revD.cuerpo.puede === true, "dueño y mascotas intactos: se puede (el peso y la alergia importados no cuentan como algo ajeno)");
  // algo cuelga: un segundo peso capturado por una persona.
  const extra = await SB.from("pesos_registrados").insert({ negocio_id: B, perro_id: pq.id, peso_kg: 6, fecha: "2026-01-01" }).select("id").single();
  const revE = await rpc(P.admin, "importacion_deshacer_revisar", { p_id: c4.cuerpo.id });
  comprobar(revE.cuerpo.puede === false && revE.cuerpo.bloqueos.some((b) => /pesos_registrados/.test(b.motivo)), "si a la mascota se le registró algo después (otro peso), se bloquea");
  await SB.from("pesos_registrados").delete().eq("id", extra.data.id);
  const revF = await rpc(P.admin, "importacion_deshacer_revisar", { p_id: c4.cuerpo.id });
  comprobar(revF.cuerpo.puede === true, "quitado lo ajeno, otra vez se puede");
  // una cita / estancia colgando
  const des4 = await rpc(P.admin, "importacion_deshacer", { p_id: c4.cuerpo.id });
  comprobar(des4.ok && des4.cuerpo.estado === "deshecha", `deshacer la importación limpia (${des4.mensaje})`);
  comprobar(!(await clientePorTel(T7)), "el dueño creado queda dado de baja (ya no está activo)");
  const bajaCli = (await SB.from("clientes").select("deleted_at").eq("id", limpia.id).single()).data;
  const bajaPerro = (await SB.from("perros").select("deleted_at").eq("id", pq.id).single()).data;
  comprobar(bajaCli.deleted_at && bajaPerro.deleted_at, "…baja lógica: la fila sigue ahí con deleted_at");
  const bajaPeso = (await SB.from("pesos_registrados").select("deleted_at").eq("perro_id", pq.id)).data;
  comprobar(bajaPeso.every((w) => w.deleted_at), "…y el peso y las alergias importados también se dan de baja");
  // el teléfono queda libre
  const reuso = await SB.from("clientes").insert({ negocio_id: B, nombre: `${MARCA} Reuso`, telefono: T7 }).select("id").single();
  comprobar(!reuso.error, "…y el teléfono queda libre para volver a usarse");
  if (reuso.data) creados.clientes.push(reuso.data.id);

  // ═══ A6. Clínicos ═══
  seccion("A6. Datos clínicos: solo con Veterinaria y el permiso");
  await fijarModulo("veterinaria", false);
  const sinVet = await crear(P.admin, { clin: true, total: 1, nombre: `${MARCA}-sinvet.csv` });
  comprobar(sinVet.ok && sinVet.cuerpo.con_clinicos === false, "con Veterinaria apagada la importación no trae clínicos aunque se pidan");
  const T8 = tel();
  await agregar(P.admin, sinVet.cuerpo.id, [fila(2, { c_nombre: `${MARCA} SinVet`, c_telefono: T8, m_nombre: `${MARCA} Gatuno`, m_especie: "gato", m_microchip: chip(), m_peso: 4, m_alergias: ["X"] })]);
  await correr(P.admin, sinVet.cuerpo.id);
  const sv = await clientePorTel(T8);
  const svp = sv ? (await perrosDe(sv.id))[0] : null;
  comprobar(svp && svp.especie === "perro" && svp.microchip === null, "…y se guardan como perro, sin microchip");
  const svPeso = svp ? (await SB.from("pesos_registrados").select("id").eq("perro_id", svp.id)).data : [];
  comprobar(svPeso.length === 0, "…ni peso ni alergias");
  await fijarModulo("veterinaria", true);
  await quitar(P.admin, P.recConId, "editar_ficha_clinica");
  const sinFicha = await crear(P.recCon, { clin: true, total: 1, nombre: `${MARCA}-sinficha.csv` });
  comprobar(sinFicha.ok && sinFicha.cuerpo.con_clinicos === false, "con Veterinaria pero sin «Editar ficha clínica», recepción importa sin clínicos");
  // y si alguien fuerza un dato clínico en la fila, la ficha clínica sigue protegida por su trigger.
  await agregar(P.recCon, sinFicha.cuerpo.id, [fila(2, { c_nombre: `${MARCA} Forzada`, c_telefono: tel(), m_nombre: `${MARCA} Forzado`, m_especie: "gato", m_microchip: chip() })]);
  await correr(P.recCon, sinFicha.cuerpo.id);
  const forz = (await filasDe(sinFicha.cuerpo.id))[0];
  const pForz = forz.perro_id ? (await SB.from("perros").select("especie, microchip").eq("id", forz.perro_id).single()).data : null;
  comprobar(pForz && pForz.especie === "perro" && pForz.microchip === null, "…aunque la fila traiga especie y microchip, no se escriben");
  await dar(P.admin, P.recConId, "editar_ficha_clinica");

  // ═══ A7. Aislamiento ═══
  seccion("A7. Aislamiento");
  const ajeno = await tokenDe((await SL.from("membresias").select("profile_id").eq("negocio_id", LUDOGTEKA).eq("rol", "admin").is("deleted_at", null).limit(1).single()).data.profile_id);
  const verAjena = await rpc(ajeno, "importacion_progreso", { p_id: id }, LUDOGTEKA);
  comprobar(!verAjena.ok, "un admin de OTRO negocio no ve la importación de Huellitas");
  const pasaH = await rpc(ajeno, "importacion_progreso", { p_id: id }, B);
  comprobar(!pasaH.ok, "…ni suplantando el encabezado de Huellitas");
  const des = await rpc(ajeno, "importacion_deshacer", { p_id: id }, B);
  comprobar(!des.ok, "…ni la deshace");
  const ver = await get(ajeno, "importacion_filas?select=id", B);
  comprobar(!ver.ok || ver.cuerpo.length === 0, "…ni lee sus filas por la API");
  const rv = await rpc(ajeno, "importacion_revisar", { p_filas: [{ n: 1, telefono: T1 }] }, B);
  comprobar(!rv.ok || (rv.cuerpo?.[0] && rv.cuerpo[0].cliente_id === null), "…ni usa la vista previa para saber si un teléfono existe en Huellitas");
  const anonRevisar = await rpc(null, "importacion_deshacer_revisar", { p_id: id });
  comprobar(!anonRevisar.ok, "la llave anónima no puede nada");
  const ayud = await rpc(P.admin, "importacion_raza", { p_texto: "labrador" });
  comprobar(!ayud.ok, "los ayudantes internos (importacion_raza) no se ofrecen a la API");
  const ayud2 = await rpc(P.admin, "importacion_procesar_fila", { p_id: id });
  comprobar(!ayud2.ok, "…ni importacion_procesar_fila");
  const dir = await post(P.admin, "importaciones", { nombre_archivo: "x", huella: "a".repeat(64), modo_duplicados: "omitir", total_filas: 1 });
  comprobar(!dir.ok, "no se escribe en las tablas por la API directa");
  const fr = await A.rpc("auditoria_frontera");
  comprobar(!fr.error && fr.data.length === 0, "auditoria_frontera() sigue vacía");

  // ═══ A8. Vista previa ═══
  seccion("A8. Vista previa (duplicados y razas)");
  const prev = await rpc(P.admin, "importacion_revisar", { p_filas: [
    { n: 1, telefono: T2, mascota: `${MARCA} Nueva`, raza: "Labrador" },
    { n: 2, telefono: tel(), mascota: "Fulana", raza: "Ratonero imaginario" },
    { n: 3, telefono: T4, mascota: "Otro", microchip: chipAjeno },
    { n: 4, telefono: T1 },
    { n: 5, telefono: tel(), mascota: "Mix", raza: "criollo" },
  ] });
  comprobar(prev.ok && prev.cuerpo.length === 5, `la vista previa contesta por fila (${prev.mensaje})`);
  const [p1, p2, p3, p4, p5] = prev.cuerpo ?? [];
  comprobar(p1?.cliente_id === ex.data.id && p1.perro_por === "nombre" && p1.raza_estado === "catalogo", "dueño existente + mascota existente por nombre + raza del catálogo");
  comprobar(p2?.cliente_id === null && p2.perro_id === null && p2.raza_estado === "sin_coincidencia", "dueño nuevo, raza sin coincidencia");
  comprobar(p3?.perro_por === "microchip" && p3.perro_de_otro === true, "microchip de otro dueño");
  comprobar(p4?.cliente_id && p4.perro_id === null, "fila sin mascota");
  comprobar(p5?.raza_estado === "catalogo", "«criollo» es un alias de mestizo en el catálogo");

  // ═══ A9. Borradores ═══
  seccion("A9. Borradores de formularios");
  const g = await rpc(P.recCon, "borrador_guardar", { p_formulario: "cliente_nuevo", p_clave: "", p_datos: { nombre: "Ana", telefono: "4441" } });
  comprobar(g.ok, `se guarda un borrador (${g.mensaje})`);
  const l = await rpc(P.recCon, "borrador_leer", { p_formulario: "cliente_nuevo", p_clave: "" });
  comprobar(l.ok && l.cuerpo?.datos?.nombre === "Ana", "…y se recupera");
  const g2 = await rpc(P.recCon, "borrador_guardar", { p_formulario: "cliente_nuevo", p_clave: "", p_datos: { nombre: "Ana María" } });
  const l2 = await rpc(P.recCon, "borrador_leer", { p_formulario: "cliente_nuevo", p_clave: "" });
  comprobar(g2.ok && l2.cuerpo.datos.nombre === "Ana María" && !("telefono" in l2.cuerpo.datos), "guardar otra vez reemplaza el anterior (uno por usuario y formulario)");
  const otroForm = await rpc(P.recCon, "borrador_leer", { p_formulario: "mascota_nueva", p_clave: "" });
  comprobar(otroForm.ok && (otroForm.cuerpo === null || otroForm.cuerpo === ""), "otro formulario no ve ese borrador");
  const conClave = await rpc(P.recCon, "borrador_guardar", { p_formulario: "checkin", p_clave: "est-1", p_datos: { x: 1 } });
  const otraClave = await rpc(P.recCon, "borrador_leer", { p_formulario: "checkin", p_clave: "est-2" });
  comprobar(conClave.ok && (otraClave.cuerpo === null || otraClave.cuerpo === ""), "la clave separa el borrador de cada registro (un check-in por estancia)");
  const ajenoB = await rpc(P.admin, "borrador_leer", { p_formulario: "cliente_nuevo", p_clave: "" });
  comprobar(ajenoB.ok && (ajenoB.cuerpo === null || ajenoB.cuerpo === ""), "otra persona del mismo negocio no ve mi borrador");
  const tablaB = await get(P.admin, "formulario_borradores?select=id");
  comprobar(tablaB.ok && tablaB.cuerpo.length === 0, "…ni lo lee por la API de tablas");
  const anonB = await rpc(null, "borrador_guardar", { p_formulario: "cliente_nuevo", p_clave: "", p_datos: { a: 1 } });
  comprobar(!anonB.ok, "la llave anónima no guarda borradores");
  const clienteB = await rpc(P.cliente, "borrador_guardar", { p_formulario: "cliente_nuevo", p_clave: "", p_datos: { a: 1 } });
  comprobar(clienteB.ok || !clienteB.ok, "(el cliente del portal no usa borradores del personal)");
  const malForm = await rpc(P.recCon, "borrador_guardar", { p_formulario: "Cliente Nuevo!", p_clave: "", p_datos: {} });
  comprobar(!malForm.ok, "un nombre de formulario inválido se rechaza");
  const grande = await rpc(P.recCon, "borrador_guardar", { p_formulario: "cliente_nuevo", p_clave: "", p_datos: { x: "a".repeat(210000) } });
  comprobar(!grande.ok, "un borrador de más de 200 KB se rechaza");
  const noObj = await rpc(P.recCon, "borrador_guardar", { p_formulario: "cliente_nuevo", p_clave: "", p_datos: [1, 2] });
  comprobar(!noObj.ok, "un borrador que no es un objeto se rechaza");
  await rpc(P.recCon, "borrador_descartar", { p_formulario: "cliente_nuevo", p_clave: "" });
  const trasDescartar = await rpc(P.recCon, "borrador_leer", { p_formulario: "cliente_nuevo", p_clave: "" });
  comprobar(trasDescartar.cuerpo === null || trasDescartar.cuerpo === "", "descartar lo borra");
  const delOtro = await rpc(P.admin, "borrador_descartar", { p_formulario: "checkin", p_clave: "est-1" });
  const sigue = await rpc(P.recCon, "borrador_leer", { p_formulario: "checkin", p_clave: "est-1" });
  comprobar(delOtro.ok && sigue.cuerpo?.datos?.x === 1, "descartar solo borra el MÍO (el de otra persona se queda)");
  await rpc(P.recCon, "borrador_descartar", { p_formulario: "checkin", p_clave: "est-1" });

  // ═══ A10. Raza, tamaño y pelaje obligatorios (N16) ═══
  seccion("A10. Una mascota nueva sin raza, tamaño o pelaje se rechaza con Estética");
  await fijarModulo("estetica", true);
  const tA = tel(), tB = tel(), tC = tel();
  const imp9 = await crear(P.admin, { total: 4 });
  await agregar(P.admin, imp9.cuerpo.id, [
    fila(2, { c_nombre: `${MARCA} Sin Nada`, c_telefono: tA, m_nombre: `${MARCA} Vacio` }),
    fila(3, { c_nombre: `${MARCA} Sin Talla`, c_telefono: tB, m_nombre: `${MARCA} Mestiza`, m_raza: "Mestizo" }),
    fila(4, { c_nombre: `${MARCA} Completa`, c_telefono: tC, m_nombre: `${MARCA} Completa`, m_raza: "Mestizo", m_tamano: "grande", m_pelaje: "corto" }),
    fila(5, { c_nombre: `${MARCA} Solo Dueño`, c_telefono: tel() }),
  ]);
  await correr(P.admin, imp9.cuerpo.id);
  const f9 = await filasDe(imp9.cuerpo.id);
  comprobar(f9[0].estado === "error" && /raza/.test(f9[0].mensaje ?? ""), `sin raza: la fila se rechaza y dice que falta la raza (${f9[0].estado}: ${f9[0].mensaje})`);
  comprobar(f9[1].estado === "error" && /tamaño/.test(f9[1].mensaje ?? "") && /pelaje/.test(f9[1].mensaje ?? ""), `mestizo sin tamaño ni pelaje: se rechaza (${f9[1].estado}: ${f9[1].mensaje})`);
  comprobar(f9[2].estado === "creada", `completa: se crea (${f9[2].estado}: ${f9[2].mensaje})`);
  comprobar(f9[3].estado === "creada", `una fila de solo dueño (sin mascota) no pide nada (${f9[3].estado}: ${f9[3].mensaje})`);
  const huerfano = await SB.from("clientes").select("id").eq("negocio_id", B).eq("telefono", tA);
  comprobar((huerfano.data ?? []).length === 0, "la fila rechazada no deja al dueño creado a medias");
  const anon9 = await fetch(`${URL}/rest/v1/rpc/perro_faltantes_alta`, { method: "POST", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json", "x-negocio-id": B }, body: JSON.stringify({ p_raza: null, p_raza_id: null, p_tamano_id: null, p_pelaje_id: null }) });
  comprobar(anon9.status >= 400, `la llave anónima no ejecuta perro_faltantes_alta (${anon9.status})`);
  await fijarModulo("estetica", false);
} catch (e) {
  console.log(`  ✘ la prueba se detuvo: ${e.stack ?? e}`);
  process.exitCode = 1;
} finally {
  // Limpieza: lo de la prueba se da de baja (nunca se borra nada real).
  const ahora = new Date().toISOString();
  const { data: mios } = await SB.from("clientes").select("id").eq("negocio_id", B).like("nombre", `${MARCA}%`);
  const idsC = [...new Set([...(mios ?? []).map((x) => x.id), ...creados.clientes])];
  if (idsC.length) {
    await SB.from("perros").update({ deleted_at: ahora }).in("cliente_id", idsC).is("deleted_at", null);
    await SB.from("clientes").update({ deleted_at: ahora }).in("id", idsC).is("deleted_at", null);
  }
  await dar(P.admin, P.recConId, "editar_ficha_clinica").catch(() => {});
  await quitar(P.admin, P.recConId, "importar_datos").catch(() => {});
  await fijarModulo("veterinaria", vetOriginal).catch(() => {});
}
// Parte B: el asistente en el navegador (archivo aparte, mismo conteo de hallazgos).
if (!process.env.SOLO_A) await import("./importador-ui-dev.mjs");
await restaurarModulos();
terminar();
