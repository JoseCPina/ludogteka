// Uso: node scripts/auditoria/entre-negocios.mjs   (SOLO DESARROLLO)
// Antes: node scripts/auditoria/negocio-prueba-dev.mjs (arma Huellitas).
//
// ¿Alguien de Ludogteka (negocio A) alcanza ALGO de Huellitas (negocio B)?
// Con el JWT real de cada rol de A — admin, recepción, estética, cliente, la
// estilista que trabaja en los dos y el cliente de los dos — contra la API:
//   1. Cada tabla y vista de la API, con el encabezado de A: ni un id de B
//      ni la marca ZZSECRETOB; y en las que tienen negocio_id, cero filas
//      de B aunque se pidan por negocio_id.
//   2. Lo mismo mandando el encabezado de B (suplantar el negocio): quien
//      no es miembro de B no ve nada de B.
//   3. Cada RPC: las de solo lectura con el encabezado de A (su respuesta no
//      trae nada de B); las que escriben, con ids de B (tienen que
//      rechazarlo o no tocar nada).
//   4. Escribir directo sobre filas de B (PATCH/DELETE) con los dos
//      encabezados: cero filas afectadas.
//   5. El cliente de los dos negocios: en cada negocio ve SOLO su
//      expediente de ese negocio. La estilista de los dos: en B no ve nada
//      de A.
//   6. Storage: la foto de un perro de B no se firma ni se lista desde A.
//   7. La llave anónima pelada, con cualquiera de los dos encabezados.
//   8. auditoria_frontera() vacía.
// Al final se compara una huella de las filas de B antes y después: nada
// de lo de arriba pudo haberlas cambiado. Sale con 1 si hay hallazgos.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");

const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const MARCA = "ZZSECRETOB";
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const idsB = new Set(datos.idsB);
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log("  ✘ " + t); };
let revisiones = 0;

const servicioEn = (negocio) =>
  createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": negocio } } });
const SB = servicioEn(B);
const SA = servicioEn(LUDOGTEKA);

// ── Quiénes de A ──
const unoDe = async (rol, excluir = []) => {
  const { data } = await A.from("membresias").select("profile_id").eq("negocio_id", LUDOGTEKA).eq("rol", rol).is("deleted_at", null).order("created_at");
  return data.map((f) => f.profile_id).find((id) => !excluir.includes(id));
};
const personasA = {
  admin: await unoDe("admin"),
  recepcion: await unoDe("recepcion"),
  estetica: await unoDe("estetica", [datos.esteticaAmbos]),
  estetica_de_los_dos: datos.esteticaAmbos,
  cliente: await unoDe("cliente", [datos.cuentaAmbos]),
  cliente_de_los_dos: datos.cuentaAmbos,
};
const miembrosDeB = new Set([datos.esteticaAmbos, datos.cuentaAmbos]);
for (const [rol, id] of Object.entries(personasA)) if (!id) throw new Error(`No hay ${rol} en Ludogteka de desarrollo.`);

const tokens = {};
for (const [rol, id] of Object.entries(personasA)) tokens[rol] = await tokenDe(id);
const cabeceras = (token, negocio) => ({
  apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${token ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
  "x-negocio-id": negocio,
  "Content-Type": "application/json",
});

// Ids de A, para revisar la dirección contraria (miembros de B mirando B).
const idsA = new Set();
for (const t of ["clientes", "perros", "reservas", "cobros", "contratos", "empleados", "gastos", "grupos_raza", "servicios", "sucursales", "tipos_contrato", "categorias_gasto", "tipos_requisito_sanitario"]) {
  const { data } = await SA.from(t).select("id").eq("negocio_id", LUDOGTEKA).limit(2000);
  for (const f of data ?? []) idsA.add(f.id);
}

// Huella de B: cuántas filas y la última modificación, tabla por tabla.
const TABLAS_HUELLA = ["clientes", "perros", "reservas", "cargos_aplicados", "cobros", "cobro_metodos", "turnos_caja", "contratos", "plantillas_contrato", "empleados", "gastos", "membresias", "permisos_staff", "servicios", "tarifas"];
async function huellaB() {
  const h = {};
  for (const t of TABLAS_HUELLA) {
    const { data, error } = await SB.from(t).select("id, updated_at, deleted_at").eq("negocio_id", B);
    if (error) throw new Error(`huella ${t}: ${error.message}`);
    h[t] = JSON.stringify(data.map((f) => [f.id, f.updated_at, f.deleted_at]).sort());
  }
  return h;
}
const huellaAntes = await huellaB();

// Qué de B aparece en un texto de respuesta.
function deB(texto, { permitirNegocio = false } = {}) {
  if (texto.includes(MARCA)) return MARCA;
  for (const id of idsB) {
    if (permitirNegocio && id === B) continue;
    if (texto.includes(id)) return id;
  }
  return null;
}
function deA(texto) {
  for (const id of idsA) if (texto.includes(id)) return id;
  return null;
}

const spec = await (await fetch(URL + "/rest/v1/", { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } })).json();
const relaciones = Object.keys(spec.definitions).sort();
const conNegocio = new Set(relaciones.filter((r) => spec.definitions[r].properties?.negocio_id));

// Positivo: si recepción de B no viera sus propias filas, la prueba no
// demostraría nada.
{
  const { data: recB } = await SB.rpc("usuario_por_email", { p_email: "recepcion@huellitas.prueba" });
  const r = await fetch(`${URL}/rest/v1/clientes?select=id,nombre&id=eq.${datos.clienteSoloB}`, { headers: cabeceras(await tokenDe(recB), B) });
  const filas = await r.json();
  if (!Array.isArray(filas) || filas.length !== 1) hallazgo(`control positivo: recepción de Huellitas no ve su propio cliente (${JSON.stringify(filas).slice(0, 120)})`);
  else console.log("  ✔ control positivo: recepción de Huellitas ve su cliente");
}

// ── 1 y 2. Tablas y vistas ──
console.log("\n── Tablas y vistas");
for (const [rol, token] of Object.entries(tokens)) {
  const esMiembroB = miembrosDeB.has(personasA[rol]);
  for (const negocio of [LUDOGTEKA, B]) {
    if (negocio === B && esMiembroB) continue; // se revisa aparte (punto 5)
    let vistas = 0;
    for (const rel of relaciones) {
      const r = await fetch(`${URL}/rest/v1/${rel}?select=*&limit=1000`, { headers: cabeceras(token, negocio) });
      revisiones++;
      const texto = await r.text();
      // negocios: con el encabezado de B, el id de B es solo el eco del
      // propio encabezado (la fila pública, si la política la deja ver).
      const fuga = deB(texto, { permitirNegocio: negocio === B && rel === "negocios" });
      if (fuga) hallazgo(`${rol} [${negocio === B ? "encabezado de B" : "encabezado de A"}] ${rel}: aparece ${fuga}`);
      if (conNegocio.has(rel)) {
        const r2 = await fetch(`${URL}/rest/v1/${rel}?select=negocio_id&negocio_id=eq.${B}&limit=5`, { headers: cabeceras(token, negocio) });
        revisiones++;
        const filas = await r2.json().catch(() => null);
        if (Array.isArray(filas) && filas.length && !(rel === "negocios")) hallazgo(`${rol} [${negocio === B ? "B" : "A"}] ${rel}: ${filas.length} filas de B pedidas por negocio_id`);
      }
      vistas++;
    }
    console.log(`  ${rol} con encabezado de ${negocio === B ? "B" : "A"}: ${vistas} relaciones`);
  }
}

// ── 3. RPC ──
console.log("\n── Funciones (RPC)");
const idsPorTabla = {};
for (const t of ["clientes", "perros", "reservas", "contratos", "turnos_caja", "gastos", "empleados", "tipos_contrato", "servicios", "cobros", "categorias_gasto", "cargos_aplicados", "plantillas_contrato"]) {
  const { data } = await SB.from(t).select("id").eq("negocio_id", B).limit(1).maybeSingle();
  idsPorTabla[t] = data?.id ?? null;
}
function idPara(nombre) {
  const n = nombre.toLowerCase();
  const reglas = [
    [/cliente/, datos.clienteSoloB], [/perro/, datos.perroSoloB], [/reserva|cuenta/, datos.reservaB],
    [/tipo_contrato/, idsPorTabla.tipos_contrato], [/plantilla/, idsPorTabla.plantillas_contrato], [/contrato/, idsPorTabla.contratos],
    [/turno/, idsPorTabla.turnos_caja], [/gasto/, idsPorTabla.gastos], [/empleado/, idsPorTabla.empleados],
    [/servicio/, idsPorTabla.servicios], [/cobro/, idsPorTabla.cobros], [/categoria/, idsPorTabla.categorias_gasto],
    [/cargo|item/, idsPorTabla.cargos_aplicados], [/negocio/, B], [/profile|user|persona|actor/, datos.cuentaSoloB],
  ];
  for (const [re, id] of reglas) if (re.test(n) && id) return id;
  return datos.clienteSoloB;
}
function argumentos(fn) {
  const op = spec.paths[`/rpc/${fn}`]?.post;
  const props = op?.parameters?.find((p) => p.in === "body")?.schema?.properties ?? {};
  const args = {};
  for (const [nombre, def] of Object.entries(props)) {
    const f = def.format ?? def.type;
    if (/uuid/.test(f)) args[nombre] = idPara(nombre);
    else if (/timestamp/.test(f)) args[nombre] = new Date().toISOString();
    else if (f === "date") args[nombre] = /hasta|fin/.test(nombre) ? "2027-12-31" : "2026-01-01";
    else if (/int|numeric|number|double|real/.test(f)) args[nombre] = 1;
    else if (/bool/.test(f)) args[nombre] = false;
    else if (/json|array/.test(f) || def.type === "array") args[nombre] = [];
    else args[nombre] = "x";
  }
  return args;
}
const rpcs = Object.keys(spec.paths).filter((p) => p.startsWith("/rpc/")).map((p) => p.slice(5)).sort();
const soloLectura = new Set(rpcs.filter((fn) => spec.paths[`/rpc/${fn}`].get));
// mis_negocios le dice a cada persona en qué negocios ESTÁ: a un miembro de
// B le debe mostrar B.
const propiasDeLaPersona = new Set(["mis_negocios"]);
let llamadas = 0;
for (const [rol, token] of Object.entries(tokens)) {
  for (const fn of rpcs) {
    const lectura = soloLectura.has(fn);
    const args = argumentos(fn);
    const tieneId = Object.values(args).some((v) => typeof v === "string" && idsB.has(v));
    if (!lectura && !tieneId) continue; // escribe sobre lo propio de A: no es de esta prueba
    const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cabeceras(token, LUDOGTEKA), body: JSON.stringify(args) });
    llamadas++;
    const texto = await r.text();
    if (r.ok) {
      // Quitar el eco de los ids que se mandaron como argumento.
      let limpio = texto;
      for (const v of Object.values(args)) if (typeof v === "string") limpio = limpio.split(v).join("");
      const fuga = deB(limpio);
      if (fuga && !(propiasDeLaPersona.has(fn) && miembrosDeB.has(personasA[rol]))) hallazgo(`rpc ${fn} (${rol}): la respuesta trae ${fuga}`);
      if (!lectura && tieneId && texto && texto !== "null" && texto !== "[]" && texto !== '""') {
        // Una escritura con ids de B que "funcionó": se confirma con la huella al final.
        console.log(`  · ${fn} (${rol}) respondió ${r.status} con ids de B: ${texto.slice(0, 100)}`);
      }
    } else if (r.status === 404 && /Could not find the function/.test(texto)) {
      hallazgo(`rpc ${fn}: 404, la llamada no llegó a la función (argumentos del script)`);
    }
  }
}
console.log(`  ${llamadas} llamadas (${soloLectura.size} funciones de lectura, las demás solo con ids de B)`);

// ── 4. Escrituras directas sobre filas de B ──
console.log("\n── Escribir sobre filas de B");
const objetivos = [
  ["clientes", datos.clienteSoloB, { nombre: "hackeado desde A" }],
  ["perros", datos.perroSoloB, { nombre: "hackeado desde A" }],
  ["reservas", datos.reservaB, { deleted_at: new Date().toISOString() }],
  ["gastos", idsPorTabla.gastos, { concepto: "hackeado desde A" }],
  ["empleados", idsPorTabla.empleados, { nombre: "hackeado desde A" }],
  ["contratos", idsPorTabla.contratos, { deleted_at: new Date().toISOString() }],
  ["membresias", null, { rol: "admin" }],
];
for (const [rol, token] of Object.entries(tokens)) {
  if (miembrosDeB.has(personasA[rol])) continue;
  for (const negocio of [LUDOGTEKA, B]) {
    for (const [t, id, cambio] of objetivos) {
      const filtro = id ? `id=eq.${id}` : `negocio_id=eq.${B}`;
      const r = await fetch(`${URL}/rest/v1/${t}?${filtro}`, { method: "PATCH", headers: { ...cabeceras(token, negocio), Prefer: "return=representation" }, body: JSON.stringify(cambio) });
      const cuerpo = await r.json().catch(() => null);
      if (r.ok && Array.isArray(cuerpo) && cuerpo.length) hallazgo(`${rol} [${negocio === B ? "B" : "A"}] PATCH ${t}: cambió ${cuerpo.length} filas de B`);
      const d = await fetch(`${URL}/rest/v1/${t}?${filtro}`, { method: "DELETE", headers: { ...cabeceras(token, negocio), Prefer: "return=representation" } });
      const borrado = await d.json().catch(() => null);
      if (d.ok && Array.isArray(borrado) && borrado.length) hallazgo(`${rol} [${negocio === B ? "B" : "A"}] DELETE ${t}: borró ${borrado.length} filas de B`);
      // Insertar en B (con el negocio de B escrito a mano).
      if (t === "clientes") {
        const ins = await fetch(`${URL}/rest/v1/clientes`, { method: "POST", headers: { ...cabeceras(token, negocio), Prefer: "return=representation" }, body: JSON.stringify({ negocio_id: B, nombre: "intruso", telefono: "8119999999" }) });
        if (ins.ok) hallazgo(`${rol} [${negocio === B ? "B" : "A"}] pudo crear un cliente en B`);
      }
    }
  }
}
console.log("  PATCH, DELETE e INSERT revisados");

// ── 5. Quien está en los dos negocios ──
console.log("\n── Personas de los dos negocios");
{
  const t = tokens.cliente_de_los_dos;
  const leer = async (rel, negocio, q = "") => (await (await fetch(`${URL}/rest/v1/${rel}?select=id${q}`, { headers: cabeceras(t, negocio) })).json());
  const cliA = (await leer("clientes", LUDOGTEKA)).map((f) => f.id);
  const cliB = (await leer("clientes", B)).map((f) => f.id);
  if (cliA.length !== 1 || cliA[0] !== datos.clienteAmbosA) hallazgo(`cliente de los dos, en A: ve ${JSON.stringify(cliA)} (esperado solo ${datos.clienteAmbosA})`);
  else console.log("  ✔ en Ludogteka ve solo su expediente de Ludogteka");
  if (cliB.length !== 1 || cliB[0] !== datos.clienteAmbosB) hallazgo(`cliente de los dos, en B: ve ${JSON.stringify(cliB)} (esperado solo ${datos.clienteAmbosB})`);
  else console.log("  ✔ en Huellitas ve solo su expediente de Huellitas");
  const perrosB = (await leer("perros", B)).map((f) => f.id);
  if (perrosB.includes(datos.perroSoloB)) hallazgo("cliente de los dos, en B: ve el perro de otra clienta de Huellitas");
  if (!perrosB.includes(datos.perroAmbosB)) hallazgo("cliente de los dos, en B: no ve su propio perro de Huellitas");
  const perrosEnA = (await leer("perros", LUDOGTEKA)).map((f) => f.id);
  if (perrosEnA.includes(datos.perroAmbosB)) hallazgo("cliente de los dos, en A: ve su perro de Huellitas");
  for (const negocio of [LUDOGTEKA, B]) {
    const r = await fetch(`${URL}/rest/v1/rpc/mis_visitas`, { method: "POST", headers: cabeceras(t, negocio), body: "{}" });
    const texto = await r.text();
    if (negocio === LUDOGTEKA && deB(texto)) hallazgo("cliente de los dos: mis_visitas en A trae algo de B");
    if (negocio === B && deA(texto)) hallazgo("cliente de los dos: mis_visitas en B trae algo de A");
  }
  // Y con el encabezado de B, ningún id de A en ninguna relación.
  for (const quien of ["cliente_de_los_dos", "estetica_de_los_dos"]) {
    let n = 0;
    for (const rel of relaciones) {
      const r = await fetch(`${URL}/rest/v1/${rel}?select=*&limit=1000`, { headers: cabeceras(tokens[quien], B) });
      const texto = await r.text();
      const fuga = deA(texto);
      if (fuga) hallazgo(`${quien} con encabezado de B, ${rel}: aparece ${fuga} de Ludogteka`);
      n++;
    }
    console.log(`  ${quien} en Huellitas: ${n} relaciones sin nada de Ludogteka`);
  }
  const { data: rolEnB } = await (await fetch(`${URL}/rest/v1/rpc/current_rol`, { method: "POST", headers: cabeceras(tokens.estetica_de_los_dos, B), body: "{}" })).json().then((d) => ({ data: d }));
  if (rolEnB !== "estetica") hallazgo(`estilista de los dos: en Huellitas su rol es ${rolEnB}`);
}

// ── 6. Storage ──
console.log("\n── Storage");
for (const [rol, token] of Object.entries(tokens)) {
  if (miembrosDeB.has(personasA[rol])) continue;
  for (const negocio of [LUDOGTEKA, B]) {
    const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}`, "x-negocio-id": negocio } } });
    const firmada = await cli.storage.from("perros-archivos").createSignedUrl(datos.rutaFoto, 60);
    if (firmada.data?.signedUrl) hallazgo(`${rol} [${negocio === B ? "B" : "A"}]: firmó la foto de un perro de B`);
    const lista = await cli.storage.from("perros-archivos").list(`${datos.clienteSoloB}/${datos.perroSoloB}/perfil`);
    if ((lista.data ?? []).length) hallazgo(`${rol} [${negocio === B ? "B" : "A"}]: listó la carpeta de un perro de B`);
    const baja = await cli.storage.from("perros-archivos").download(datos.rutaFoto);
    if (baja.data) hallazgo(`${rol} [${negocio === B ? "B" : "A"}]: descargó la foto de un perro de B`);
  }
}
{
  const { data: recB } = await SB.rpc("usuario_por_email", { p_email: "recepcion@huellitas.prueba" });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(recB)}`, "x-negocio-id": B } } });
  const firmada = await cli.storage.from("perros-archivos").createSignedUrl(datos.rutaFoto, 60);
  if (!firmada.data?.signedUrl) hallazgo(`control positivo: recepción de B no puede firmar la foto de su propio perro (${firmada.error?.message})`);
  else console.log("  ✔ control positivo: recepción de Huellitas firma la foto de su perro");
}
console.log("  firmar, listar y descargar revisados");

// ── 7. Llave anónima ──
console.log("\n── Llave anónima");
for (const negocio of [LUDOGTEKA, B]) {
  for (const rel of relaciones) {
    const r = await fetch(`${URL}/rest/v1/${rel}?select=*&limit=1000`, { headers: cabeceras(null, negocio) });
    const texto = await r.text();
    const fuga = deB(texto, { permitirNegocio: negocio === B && rel === "negocios" });
    if (fuga) hallazgo(`anónimo [${negocio === B ? "B" : "A"}] ${rel}: aparece ${fuga}`);
  }
  for (const fn of soloLectura) {
    const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cabeceras(null, negocio), body: JSON.stringify(argumentos(fn)) });
    if (!r.ok) continue;
    let texto = await r.text();
    for (const v of Object.values(argumentos(fn))) if (typeof v === "string") texto = texto.split(v).join("");
    const fuga = deB(texto, { permitirNegocio: negocio === B });
    if (fuga) hallazgo(`anónimo [${negocio === B ? "B" : "A"}] rpc ${fn}: trae ${fuga}`);
  }
}
console.log(`  ${relaciones.length} relaciones y ${soloLectura.size} funciones de lectura, con los dos encabezados`);

// ── 8. Catálogo ──
const { data: frontera, error: errFrontera } = await A.rpc("auditoria_frontera");
if (errFrontera) hallazgo(`auditoria_frontera: ${errFrontera.message}`);
for (const f of frontera ?? []) hallazgo(`frontera: ${f.tipo} ${f.nombre} ${f.detalle ?? ""}`);
if (!errFrontera && !(frontera ?? []).length) console.log("\n  ✔ auditoria_frontera() vacía");

// ── Huella ──
const huellaDespues = await huellaB();
for (const t of TABLAS_HUELLA) if (huellaAntes[t] !== huellaDespues[t]) hallazgo(`las filas de B en ${t} CAMBIARON durante la auditoría`);

console.log(`\n${revisiones} consultas a tablas y vistas, ${llamadas} llamadas a funciones.`);
console.log(hallazgos.length ? `HALLAZGOS: ${hallazgos.length}` : "TODO BIEN: nada de Huellitas alcanzable desde Ludogteka");
process.exit(hallazgos.length ? 1 : 0);
