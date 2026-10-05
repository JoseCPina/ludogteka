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
//   9. Lo COMPARTIDO entre todos los negocios (razas, tallas, pelajes,
//      unidades, la fila de otro negocio, la persona de dos negocios, la
//      plataforma): nadie de un negocio —ni su admin— lo escribe. Solo la
//      administración de PeluDesk, que a su vez no ve datos de ningún
//      negocio.
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
    // El bloque de razas (10) edita y restaura UN perro de B con la llave de servicio; ese perro se
    // revisa ahí mismo (que Ludogteka no lo toque), no por su updated_at.
    h[t] = JSON.stringify(data.filter((f) => !(t === "perros" && f.id === datos.perroSoloB)).map((f) => [f.id, f.updated_at, f.deleted_at]).sort());
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


// ── 9. Lo compartido: solo la plataforma lo escribe ──
console.log("\n── Lo compartido entre negocios");
const COMPARTIDAS = {
  razas: { cambio: { nombre: "hackeado por un negocio" }, alta: { nombre: `Raza intrusa ${MARCA}` } },
  tamanos_categoria: { cambio: { etiqueta: "hackeado por un negocio" }, alta: { clave: "intrusa", etiqueta: "intrusa", orden: 99 } },
  tipos_pelaje: { cambio: { etiqueta: "hackeado por un negocio" }, alta: { clave: "intrusa", etiqueta: "intrusa", orden: 99 } },
  unidades_medida: { cambio: { etiqueta: "hackeado por un negocio" }, alta: { clave: "intrusa", etiqueta: "intrusa", magnitud: "pieza", equivalencia_en_base: 1 } },
  // Los planes de PeluDesk: precios y módulos, solo la plataforma.
  planes: { cambio: { precio_mensual: 1, modulos: ["hotel", "reportes"] }, alta: { clave: "intruso", nombre: "Gratis para mí", precio_mensual: 0, precio_anual: 0, modulos: ["hotel"] } },
  // Los precios de Stripe y los eventos del webhook (28 de septiembre de 2026): solo la plataforma y el servidor.
  planes_precios_stripe: { cambio: { total_centavos: 1, stripe_price_id: "price_intruso" }, alta: { periodicidad: "mensual", neto: 0, total_centavos: 0, lookup_key: "peludesk_intruso_mensual", stripe_price_id: "price_intruso", stripe_product_id: "prod_intruso", modo: "test" } },
  eventos_stripe: { cambio: { procesado_at: null, error: "intruso" }, alta: { stripe_event_id: `evt_intruso_${MARCA}`, tipo: "invoice.paid", modo: "test", payload: {} } },
};
async function huellaCompartida() {
  const h = {};
  for (const t of [...Object.keys(COMPARTIDAS), "negocios", "plataforma_admins", "modulos"]) {
    const { data, error } = await A.from(t).select("*").order(t === "modulos" ? "clave" : "id");
    if (error) throw new Error(`huella ${t}: ${error.message}`);
    h[t] = JSON.stringify(data);
  }
  const { data: personas } = await A.from("profiles").select("id, nombre_completo, updated_at").in("id", [datos.cuentaAmbos, datos.esteticaAmbos]).order("id");
  h.personas_de_dos_negocios = JSON.stringify(personas);
  return h;
}
const compartidoAntes = await huellaCompartida();
const unaFila = {};
for (const t of Object.keys(COMPARTIDAS)) unaFila[t] = (await A.from(t).select("id").limit(1).single()).data.id;

// Todos los de Ludogteka, y además el admin de Huellitas (el de otro negocio).
const escritores = { ...tokens, admin_de_huellitas: await tokenDe(datos.adminB) };
let intentos = 0;
for (const [rol, token] of Object.entries(escritores)) {
  for (const negocio of [LUDOGTEKA, B]) {
    const donde = negocio === B ? "B" : "A";
    for (const [t, { cambio, alta }] of Object.entries(COMPARTIDAS)) {
      const ins = await fetch(`${URL}/rest/v1/${t}`, { method: "POST", headers: { ...cabeceras(token, negocio), Prefer: "return=representation" }, body: JSON.stringify(alta) });
      if (ins.ok) hallazgo(`${rol} [${donde}] pudo AGREGAR a ${t} (compartida)`);
      const up = await fetch(`${URL}/rest/v1/${t}?id=eq.${unaFila[t]}`, { method: "PATCH", headers: { ...cabeceras(token, negocio), Prefer: "return=representation" }, body: JSON.stringify(cambio) });
      const upFilas = await up.json().catch(() => null);
      if (up.ok && Array.isArray(upFilas) && upFilas.length) hallazgo(`${rol} [${donde}] pudo CAMBIAR ${t} (compartida)`);
      const del = await fetch(`${URL}/rest/v1/${t}?id=eq.${unaFila[t]}`, { method: "DELETE", headers: { ...cabeceras(token, negocio), Prefer: "return=representation" } });
      const delFilas = await del.json().catch(() => null);
      if (del.ok && Array.isArray(delFilas) && delFilas.length) hallazgo(`${rol} [${donde}] pudo BORRAR de ${t} (compartida)`);
      intentos += 3;
    }
    {
      const ins = await fetch(`${URL}/rest/v1/modulos`, { method: "POST", headers: { ...cabeceras(token, negocio), Prefer: "return=representation" }, body: JSON.stringify({ clave: "intruso", nombre: "Intruso", descripcion: "x", orden: 99 }) });
      if (ins.ok) hallazgo(`${rol} [${donde}] pudo AGREGAR a modulos (compartida)`);
      const up = await fetch(`${URL}/rest/v1/modulos?clave=eq.hotel`, { method: "PATCH", headers: { ...cabeceras(token, negocio), Prefer: "return=representation" }, body: JSON.stringify({ nombre: "hackeado" }) });
      const upFilas = await up.json().catch(() => null);
      if (up.ok && Array.isArray(upFilas) && upFilas.length) hallazgo(`${rol} [${donde}] pudo CAMBIAR modulos (compartida)`);
      intentos += 2;
    }
    // La fila de otro negocio, y lo que de la suya solo cambia la plataforma.
    const ajeno = negocio === B ? LUDOGTEKA : B;
    for (const [id, cambio, que] of [
      [ajeno, { nombre: "hackeado", marca: { favicon: "/x.ico" } }, "la fila de OTRO negocio"],
      [negocio, { slug: "hackeado" }, "el slug de su negocio"],
      [negocio, { dominio: "hackeado.mx" }, "el dominio de su negocio"],
      [negocio, { activo: false }, "el estado de su negocio"],
      [negocio, { plan_id: null }, "el plan de su negocio"],
      // Valores que de verdad cambian (un "cambio" al mismo valor no es cambio).
      [negocio, { complementos: ["pagina_web", "reportes"] }, "los complementos de su negocio"],
      [negocio, { modulos_cortesia: ["hotel", "reportes"] }, "los módulos de cortesía de su negocio"],
      [negocio, { web_gratis_at: new Date().toISOString() }, "la web gratis de su negocio"],
      [negocio, { plan: "prueba", prueba_termina_at: "2099-01-01T00:00:00Z" }, "el estado de su prueba"],
    ]) {
      const r = await fetch(`${URL}/rest/v1/negocios?id=eq.${id}`, { method: "PATCH", headers: { ...cabeceras(token, negocio), Prefer: "return=representation" }, body: JSON.stringify(cambio) });
      const f = await r.json().catch(() => null);
      if (r.ok && Array.isArray(f) && f.length) hallazgo(`${rol} [${donde}] pudo cambiar ${que}`);
      intentos++;
    }
    // La persona que está en los dos negocios: su nombre es suyo.
    for (const persona of [datos.cuentaAmbos, datos.esteticaAmbos]) {
      if (persona === personasA[rol]) continue; // su propio nombre sí lo cambia cada quien
      const r = await fetch(`${URL}/rest/v1/profiles?id=eq.${persona}`, { method: "PATCH", headers: { ...cabeceras(token, negocio), Prefer: "return=representation" }, body: JSON.stringify({ nombre_completo: "hackeado por un negocio" }) });
      const f = await r.json().catch(() => null);
      if (r.ok && Array.isArray(f) && f.length) hallazgo(`${rol} [${donde}] pudo cambiarle el nombre a una persona de dos negocios`);
      intentos++;
    }
    // La plataforma: hacerse admin de PeluDesk, dar de alta o tocar negocios, buscar personas.
    const intentosPlataforma = [
      ["plataforma_admins", { profile_id: personasA[rol] ?? datos.adminB }],
    ];
    for (const [t, fila] of intentosPlataforma) {
      const r = await fetch(`${URL}/rest/v1/${t}`, { method: "POST", headers: { ...cabeceras(token, negocio), Prefer: "return=representation" }, body: JSON.stringify(fila) });
      if (r.ok) hallazgo(`${rol} [${donde}] pudo insertar en ${t}`);
      intentos++;
    }
    const rpcsPlataforma = [
      ["crear_negocio", { p_slug: "intruso", p_nombre: "Intruso", p_zona_horaria: "America/Mexico_City", p_ciudad: null, p_dominio: null }],
      ["agregar_admin_negocio", { p_negocio_id: ajeno, p_profile_id: personasA[rol] ?? datos.adminB }],
      ["agregar_admin_plataforma", { p_profile_id: personasA[rol] ?? datos.adminB }],
      ["plataforma_actualizar_negocio", { p_negocio_id: ajeno, p_nombre: "hackeado", p_zona_horaria: "America/Mexico_City", p_ciudad: null, p_dominio: null, p_url_publica: null, p_activo: false, p_marca: {} }],
      ["plataforma_negocios", {}],
      ["plataforma_buscar_personas", { p_busqueda: "4441234567" }],
      ["plataforma_buscar_personas_por_id", { p_persona_id: datos.cuentaAmbos }],
      ["plataforma_registrar_evento", { p_accion: "editar_catalogo", p_negocio_id: null, p_persona_id: null, p_motivo: "x", p_detalle: {} }],
      ["plataforma_cambiar_plan", { p_negocio_id: negocio, p_plan: "activo", p_prueba_termina_at: null, p_motivo: "x" }],
      ["plataforma_asignar_plan", { p_negocio_id: negocio, p_plan_id: unaFila.planes, p_complementos: ["pagina_web"], p_modulos_cortesia: ["hotel"], p_motivo: "x" }],
      ["plataforma_guardar_plan", { p_id: null, p_clave: "intruso", p_nombre: "Intruso", p_descripcion: null, p_tipo: "plan", p_precio_mensual: 0, p_precio_anual: 0, p_modulos: [], p_orden: 0, p_activo: true }],
    ];
    for (const [fn, args] of rpcsPlataforma) {
      const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cabeceras(token, negocio), body: JSON.stringify(args) });
      if (r.ok) hallazgo(`${rol} [${donde}] pudo llamar ${fn} (solo de la plataforma)`);
      else if (r.status === 404) hallazgo(`${fn}: 404, la llamada no llegó (argumentos del script)`);
      intentos++;
    }
  }
}
const compartidoDespues = await huellaCompartida();
for (const t of Object.keys(compartidoAntes)) if (compartidoAntes[t] !== compartidoDespues[t]) hallazgo(`lo compartido CAMBIÓ: ${t}`);
console.log(`  ${intentos} intentos de escribir lo compartido, de ${Object.keys(escritores).length} personas con los dos encabezados`);

// Control positivo: la administración de PeluDesk sí edita lo compartido…
const { data: plataformaId } = await A.rpc("usuario_por_email", { p_email: "plataforma@peludesk.prueba" });
if (!plataformaId) hallazgo("no hay administrador de plataforma en desarrollo (node scripts/plataforma/agregar-admin.mjs plataforma@peludesk.prueba)");
else {
  const tp = await tokenDe(plataformaId);
  const { data: talla } = await A.from("tamanos_categoria").select("id, etiqueta").limit(1).single();
  const hp = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${tp}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const r = await fetch(`${URL}/rest/v1/tamanos_categoria?id=eq.${talla.id}`, { method: "PATCH", headers: hp, body: JSON.stringify({ etiqueta: talla.etiqueta }) });
  const f = await r.json().catch(() => null);
  if (!(r.ok && Array.isArray(f) && f.length === 1)) hallazgo(`control positivo: la plataforma no pudo editar una talla (${r.status})`);
  else console.log("  ✔ control positivo: la administración de PeluDesk sí edita lo compartido");
  // …pero no ve nada de ningún negocio.
  for (const negocio of [LUDOGTEKA, B]) {
    for (const rel of ["clientes", "perros", "cobros", "gastos", "empleados", "membresias", "contratos"]) {
      const x = await fetch(`${URL}/rest/v1/${rel}?select=id&limit=5`, { headers: { ...hp, "x-negocio-id": negocio } });
      const filas = await x.json().catch(() => null);
      if (Array.isArray(filas) && filas.length) hallazgo(`la plataforma ve ${rel} de ${negocio === B ? "Huellitas" : "Ludogteka"} (no es miembro)`);
    }
  }
  console.log("  ✔ la administración de PeluDesk no ve datos de ningún negocio");
}

// ── 10. Razas: propuestas, normalizaciones y grupos de precio ──
// Un negocio no ve las propuestas ni el historial de otro, las funciones de
// razas (fuera del catálogo, sin grupo, asignaciones) solo hablan del negocio
// de la petición, y la bandeja de la plataforma es solo de la plataforma.
console.log("\n── Razas: propuestas y normalizaciones");
{
  const tAdminB = await tokenDe(datos.adminB);
  const { data: perroB } = await SB.from("perros").select("id, raza, raza_id").eq("id", datos.perroSoloB).single();
  const rpcB = async (fn, args, token = tAdminB) => {
    const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cabeceras(token, B), body: JSON.stringify(args) });
    return { ok: r.ok, status: r.status, cuerpo: await r.json().catch(() => null) };
  };
  try {
    await SB.from("perros").update({ raza: `${MARCA} Raros`, raza_id: null }).eq("id", perroB.id);
    const normPropia = (await A.rpc("normalizar_raza", { p_texto: `${MARCA} Raros` })).data;
    const prop = await rpcB("razas_proponer", { p_nombre: `Raza ${MARCA}`, p_variantes: [`${MARCA} raros`], p_tamano_id: null, p_pelaje_id: null, p_texto_norm: normPropia });
    if (!prop.ok) hallazgo(`razas: el admin de Huellitas no pudo proponer una raza (${JSON.stringify(prop.cuerpo).slice(0, 160)})`);
    const propuestaId = prop.cuerpo;

    // Una asignación de B (queda en su historial).
    const { data: poodle } = await A.from("razas").select("id").eq("nombre", "Poodle").single();
    await SB.from("perros").update({ raza: `${MARCA} Poodles`, raza_id: null }).eq("id", perroB.id);
    const normPoodle = (await A.rpc("normalizar_raza", { p_texto: `${MARCA} Poodles` })).data;
    const asig = await rpcB("razas_asignar_texto", { p_texto_norm: normPoodle, p_raza_id: poodle.id });
    const normalizacionB = Array.isArray(asig.cuerpo) ? asig.cuerpo[0]?.normalizacion_id : asig.cuerpo?.normalizacion_id;
    if (!asig.ok || !normalizacionB) hallazgo(`razas: el admin de Huellitas no pudo asignar un texto a una raza (${JSON.stringify(asig.cuerpo).slice(0, 160)})`);

    // Control positivo: B sí ve lo suyo.
    const { data: lasSuyas } = await SB.from("razas_propuestas").select("id").eq("negocio_id", B);
    if (!(lasSuyas ?? []).some((f) => f.id === propuestaId)) hallazgo("razas: control positivo, Huellitas no ve su propia propuesta");
    else console.log("  ✔ control positivo: Huellitas ve su propuesta y su historial");

    // Ludogteka (cada rol) y el anónimo: nada de B.
    const lecturas = ["razas_propuestas", "razas_propuestas_perros", "razas_normalizaciones", "razas_normalizacion_perros"];
    for (const [rol, token] of [...Object.entries(tokens), ["anonimo", null]]) {
      for (const t of lecturas) {
        const r = await fetch(`${URL}/rest/v1/${t}?select=*&limit=500`, { headers: cabeceras(token, LUDOGTEKA) });
        const texto = await r.text();
        const filas = r.ok ? JSON.parse(texto) : [];
        if (filas.some((f) => f.negocio_id === B) || texto.includes(MARCA)) hallazgo(`razas: ${rol} de Ludogteka ve ${t} de Huellitas`);
        // También con el encabezado de B suplantado: la membresía manda.
        const r2 = await fetch(`${URL}/rest/v1/${t}?select=*&limit=500`, { headers: cabeceras(token, B) });
        const t2 = await r2.text();
        if (t2.includes(MARCA) && !miembrosDeB.has(personasA[rol])) hallazgo(`razas: ${rol} suplantando a Huellitas ve ${t}`);
      }
      for (const fn of ["razas_fuera_de_catalogo", "razas_sin_grupo", "razas_asignaciones_recientes"]) {
        for (const negocio of [LUDOGTEKA, B]) {
          const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cabeceras(token, negocio), body: "{}" });
          const texto = await r.text();
          if (texto.includes(MARCA) && !(negocio === B && miembrosDeB.has(personasA[rol]))) hallazgo(`razas: rpc ${fn} (${rol}, negocio ${negocio === B ? "B" : "A"}) trae lo de Huellitas`);
        }
      }
    }
    console.log("  ✔ ningún rol de Ludogteka ni el anónimo ve propuestas, historial, razas sin grupo ni textos de Huellitas");

    // Escribir sobre lo de B desde Ludogteka.
    const antes = JSON.stringify((await SB.from("razas_propuestas").select("id, estado, nombre, updated_at").eq("negocio_id", B)).data);
    for (const [rol, token] of Object.entries(tokens)) {
      const h = { ...cabeceras(token, LUDOGTEKA), Prefer: "return=representation" };
      await fetch(`${URL}/rest/v1/razas_propuestas?id=eq.${propuestaId}`, { method: "PATCH", headers: h, body: JSON.stringify({ estado: "aprobada", nombre: "hackeada" }) });
      await fetch(`${URL}/rest/v1/razas_propuestas?id=eq.${propuestaId}`, { method: "DELETE", headers: h });
      await fetch(`${URL}/rest/v1/razas_propuestas`, { method: "POST", headers: h, body: JSON.stringify({ nombre: "x", nombre_norm: "x", negocio_id: B }) });
      await fetch(`${URL}/rest/v1/razas_normalizaciones?id=eq.${normalizacionB}`, { method: "PATCH", headers: h, body: JSON.stringify({ revertida_at: new Date().toISOString() }) });
      for (const [fn, args] of [
        ["razas_revertir_normalizacion", { p_normalizacion_id: normalizacionB }],
        ["razas_asignar_texto", { p_texto_norm: normPropia, p_raza_id: poodle.id }],
        ["asignar_grupo_raza", { p_raza_id: poodle.id, p_grupo_raza_id: "00000000-0000-0000-0000-000000000000" }],
        ["plataforma_resolver_propuesta", { p_id: propuestaId, p_accion: "aprobar", p_motivo: null, p_raza_destino: null, p_nombre: null }],
        ["plataforma_razas_propuestas", {}],
        ["plataforma_agregar_raza", { p_nombre: `Intrusa ${MARCA}`, p_variantes: [] }],
      ]) {
        const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cabeceras(token, LUDOGTEKA), body: JSON.stringify(args) });
        const texto = await r.text();
        if (r.ok && /plataforma_/.test(fn)) hallazgo(`razas: ${rol} de Ludogteka pudo llamar ${fn}`);
        if (r.ok && texto.includes(MARCA)) hallazgo(`razas: ${rol} de Ludogteka con ${fn} tocó o vio lo de Huellitas`);
      }
    }
    const despues = JSON.stringify((await SB.from("razas_propuestas").select("id, estado, nombre, updated_at").eq("negocio_id", B)).data);
    if (antes !== despues) hallazgo("razas: las propuestas de Huellitas CAMBIARON por escrituras desde Ludogteka");
    const { data: normB } = await SB.from("razas_normalizaciones").select("revertida_at").eq("id", normalizacionB).single();
    if (normB?.revertida_at) hallazgo("razas: Ludogteka deshizo una asignación de Huellitas");
    const { data: perroDespues } = await SB.from("perros").select("raza, raza_id").eq("id", perroB.id).single();
    if (perroDespues.raza_id !== poodle.id) hallazgo("razas: el perro de Huellitas cambió de raza por una llamada de Ludogteka");
    console.log("  ✔ ninguna escritura ni función de razas de Ludogteka alcanzó propuestas, historial ni perros de Huellitas");

    // Quién puede proponer: recepción de Huellitas sin el permiso «tarifas» no.
    const { data: recB } = await SB.rpc("usuario_por_email", { p_email: "recepcion@huellitas.prueba" });
    const sinPermiso = await rpcB("razas_proponer", { p_nombre: `Otra ${MARCA}`, p_variantes: [], p_tamano_id: null, p_pelaje_id: null, p_texto_norm: null }, await tokenDe(recB));
    if (sinPermiso.ok) hallazgo("razas: recepción sin el permiso de tarifas pudo proponer una raza");
    else console.log("  ✔ recepción sin «Precios y tarifas» no puede proponer razas ni asignar grupos");
    const sinGrupoRec = await rpcB("asignar_grupo_raza", { p_raza_id: poodle.id, p_grupo_raza_id: "00000000-0000-0000-0000-000000000000" }, await tokenDe(recB));
    if (sinGrupoRec.ok) hallazgo("razas: recepción sin permiso pudo asignar el grupo de una raza");

    // El catálogo compartido no lo escribe un negocio (ni su admin).
    const rIns = await fetch(`${URL}/rest/v1/razas`, { method: "POST", headers: { ...cabeceras(tAdminB, B), Prefer: "return=representation" }, body: JSON.stringify({ nombre: `Raza intrusa ${MARCA}` }) });
    if (rIns.ok) hallazgo("razas: el admin de un negocio escribió en el catálogo compartido de razas");
    const rpAdmin = await rpcB("plataforma_resolver_propuesta", { p_id: propuestaId, p_accion: "aprobar", p_motivo: null, p_raza_destino: null, p_nombre: null });
    if (rpAdmin.ok) hallazgo("razas: el admin de un negocio resolvió su propia propuesta");
    else console.log("  ✔ el catálogo compartido y la bandeja de propuestas son solo de la plataforma");

    // Control positivo: la plataforma sí ve la bandeja, y rechaza (limpia).
    const { data: plataformaId } = await A.rpc("usuario_por_email", { p_email: "plataforma@peludesk.prueba" });
    if (plataformaId) {
      const tp = await tokenDe(plataformaId);
      const lista = await fetch(`${URL}/rest/v1/rpc/plataforma_razas_propuestas`, { method: "POST", headers: cabeceras(tp, LUDOGTEKA), body: "{}" });
      const filas = await lista.json().catch(() => []);
      if (!lista.ok || !Array.isArray(filas) || !filas.some((f) => f.id === propuestaId)) hallazgo("razas: control positivo, la plataforma no ve la propuesta de Huellitas");
      else {
        const rech = await fetch(`${URL}/rest/v1/rpc/plataforma_resolver_propuesta`, { method: "POST", headers: cabeceras(tp, LUDOGTEKA), body: JSON.stringify({ p_id: propuestaId, p_accion: "rechazar", p_motivo: "auditoría", p_raza_destino: null, p_nombre: null }) });
        if (!rech.ok) hallazgo(`razas: la plataforma no pudo rechazar la propuesta (${rech.status})`);
        else console.log("  ✔ control positivo: la plataforma ve la bandeja y resuelve propuestas");
      }
    }
  } finally {
    await SB.from("perros").update({ raza: perroB.raza, raza_id: perroB.raza_id }).eq("id", perroB.id);
  }
}

// ── 11. Reasignar la estilista de una cita ──
// El historial y la función solo hablan del negocio de la petición: nadie de
// Ludogteka (ni el anónimo, ni suplantando el encabezado de Huellitas) lee el
// historial de una cita de B, ve a sus estilistas ni la reasigna.
console.log("\n── Reasignar la estilista: el historial y la función son de un solo negocio");
{
  const tAdminB = await tokenDe(datos.adminB);
  const rpcB = async (fn, args) => {
    const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cabeceras(tAdminB, B), body: JSON.stringify(args) });
    return { ok: r.ok, cuerpo: await r.json().catch(() => null) };
  };
  let citaId = null, reservaId = null, perroPrueba = null, perroOriginal = null;
  try {
    const { data: razaP } = await A.from("razas").select("id").eq("nombre", "Poodle").single();
    const { data: tallaP } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
    const { data: peloP } = await A.from("tipos_pelaje").select("id").eq("clave", "medio").single();
    const { data: servP } = await SB.from("servicios").select("id").eq("clave", "estetica_estetico").maybeSingle();
    // Se usa el perro de Huellitas con los datos que pide el precio y se restaura al final.
    const { data: orig } = await SB.from("perros").select("raza, raza_id, tamano_id, pelaje_id").eq("id", datos.perroSoloB).single();
    perroOriginal = orig;
    await SB.from("perros").update({ raza: "Poodle", raza_id: razaP.id, tamano_id: tallaP.id, pelaje_id: peloP.id }).eq("id", datos.perroSoloB);
    perroPrueba = datos.perroSoloB;
    const modelo = { perro_id: perroPrueba, servicio_id: servP?.id, empleado_id: datos.esteticaB };
    if (!perroPrueba || !servP) hallazgo("reasignar: no se pudo armar el perro o el servicio de prueba en Huellitas (corre negocio-prueba-dev y cargar-tarifas)");
    else {
      const rr = await SB.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single();
      reservaId = rr.data.id;
      const f = new Date(Date.now() + (500 + Math.floor(Math.random() * 400)) * 86_400_000).toISOString().slice(0, 10);
      const c = await SB.from("citas_estetica").insert({ reserva_id: reservaId, perro_id: modelo.perro_id, servicio_id: modelo.servicio_id, empleado_id: modelo.empleado_id, inicio: `${f}T20:00:00Z` }).select("id").single();
      if (c.error) hallazgo(`reasignar: no se pudo crear la cita de prueba en Huellitas (${c.error.message})`);
      else {
        citaId = c.data.id;
        const otras = (await rpcB("estilistas_asignables")).cuerpo;
        const otra = (otras ?? []).find((e) => e.id !== modelo.empleado_id);
        const ok1 = await rpcB("reasignar_estilista_cita", { p_cita_id: citaId, p_empleado_id: otra?.id, p_motivo: null });
        const h = (await rpcB("historial_asignaciones_cita", { p_cita_id: citaId })).cuerpo;
        if (!ok1.ok || !Array.isArray(h) || h.length !== 1) hallazgo(`reasignar: control positivo, el admin de Huellitas no reasigna o no ve su historial (${JSON.stringify(ok1.cuerpo).slice(0, 120)})`);
        else console.log("  ✔ control positivo: el admin de Huellitas reasigna y ve el historial de su cita");
        const estadoAntes = JSON.stringify([(await SB.from("citas_estetica").select("empleado_id, updated_at").eq("id", citaId).single()).data, (await SB.from("citas_estetica_asignaciones").select("id").eq("cita_id", citaId)).data]);
        const llamadasHechas = [
          ["reasignar_estilista_cita", { p_cita_id: citaId, p_empleado_id: modelo.empleado_id, p_motivo: "intruso" }],
          ["reasignar_estilista_cita", { p_cita_id: citaId, p_empleado_id: null, p_motivo: null }],
          ["historial_asignaciones_cita", { p_cita_id: citaId }],
          ["estilistas_asignables", {}],
          ["corregir_servicio_cita", { p_cita_id: citaId, p_servicio_id: modelo.servicio_id, p_motivo: "intruso" }],
          ["cotizar_correccion_servicio", { p_cita_id: citaId, p_servicio_id: modelo.servicio_id }],
          ["historial_correcciones_servicio_cita", { p_cita_id: citaId }],
        ];
        for (const [rol, token] of [...Object.entries(tokens), ["anonimo", null]]) {
          const esMiembro = miembrosDeB.has(personasA[rol]);
          for (const negocio of [LUDOGTEKA, B]) {
            if (negocio === B && esMiembro) continue;
            for (const [fn, args] of llamadasHechas) {
              const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cabeceras(token, negocio), body: JSON.stringify(args) });
              const texto = await r.text();
              llamadas++;
              if (texto.includes(citaId)) hallazgo(`reasignar: ${rol} (negocio ${negocio === B ? "B" : "A"}) recibió algo de Huellitas con ${fn}`);
              if (r.ok && fn === "estilistas_asignables" && negocio === LUDOGTEKA) {
                // Solo gente que de verdad es estilista (o admin) de Ludogteka; quien está en los dos negocios sale legítimamente.
                const { data: deA } = await A.from("membresias").select("profile_id").eq("negocio_id", LUDOGTEKA).in("rol", ["estetica", "admin"]).is("deleted_at", null);
                const permitidos = new Set((deA ?? []).map((m) => m.profile_id));
                for (const e of JSON.parse(texto)) if (!permitidos.has(e.id)) hallazgo(`reasignar: ${rol} ve en la lista de Ludogteka a alguien que no es de su personal`);
              }
              if (r.ok && (fn === "corregir_servicio_cita" || fn === "cotizar_correccion_servicio")) hallazgo(`corregir servicio: ${rol} (negocio ${negocio === B ? "B" : "A"}) llegó a una cita de Huellitas con ${fn}`);
              if (r.ok && fn === "reasignar_estilista_cita") hallazgo(`reasignar: ${rol} (negocio ${negocio === B ? "B" : "A"}) pudo reasignar una cita de Huellitas`);
            }
            const t = await fetch(`${URL}/rest/v1/citas_estetica_asignaciones?select=*&limit=500`, { headers: cabeceras(token, negocio) });
            const tx = await t.text();
            if (tx.includes(citaId)) hallazgo(`reasignar: ${rol} (negocio ${negocio === B ? "B" : "A"}) lee el historial de Huellitas por la tabla`);
            const tc = await fetch(`${URL}/rest/v1/citas_estetica_correcciones?select=*&limit=500`, { headers: cabeceras(token, negocio) });
            if ((await tc.text()).includes(citaId)) hallazgo(`corregir servicio: ${rol} (negocio ${negocio === B ? "B" : "A"}) lee las correcciones de Huellitas por la tabla`);
            const w = await fetch(`${URL}/rest/v1/citas_estetica?id=eq.${citaId}`, { method: "PATCH", headers: { ...cabeceras(token, negocio), Prefer: "return=representation" }, body: JSON.stringify({ empleado_id: modelo.empleado_id }) });
            if (w.ok && (await w.json().catch(() => [])).length) hallazgo(`reasignar: ${rol} (negocio ${negocio === B ? "B" : "A"}) cambió empleado_id de una cita de Huellitas por la API`);
          }
        }
        const estadoDespues = JSON.stringify([(await SB.from("citas_estetica").select("empleado_id, updated_at").eq("id", citaId).single()).data, (await SB.from("citas_estetica_asignaciones").select("id").eq("cita_id", citaId)).data]);
        if (estadoAntes !== estadoDespues) hallazgo("reasignar: la cita o su historial en Huellitas CAMBIARON por llamadas desde fuera");
        else console.log("  ✔ nadie fuera de Huellitas lee su historial, ve a sus estilistas ni reasigna sus citas");
      }
    }
  } finally {
    if (citaId) await SB.from("citas_estetica").delete().eq("id", citaId);
    if (reservaId) await SB.from("reservas").delete().eq("id", reservaId);
    if (perroOriginal) await SB.from("perros").update(perroOriginal).eq("id", datos.perroSoloB);
  }
}

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
