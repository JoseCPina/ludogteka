// Precios de los SITIOS WEB de los prospectos para el Índice PeluDesk de precios.
//
//   node scripts/mercado/sitios.mjs [--prod] [--giros estetica,hotel] [--ciudades "Guadalajara,…"] [--tope 3000] [--paralelo 6] [--tope-ia 300]
//
// Por cada prospecto vivo con sitio web propio (web_dominio; Facebook e Instagram no cuentan): baja su portada y hasta
// 3 páginas más del mismo sitio que hablen de precios o servicios (4 por sitio), respetando robots.txt y con 1.2 s
// entre peticiones al mismo sitio; saca cada cantidad en pesos con su contexto (expresiones regulares) y la IA
// (claude-haiku-5-5) dice de qué servicio del catálogo canónico es cada una, con un tope de gasto de 300 MXN en 31
// días. Cada precio queda en precios_mercado con su URL, ciudad y estado del prospecto; la corrida, en
// precios_mercado_corridas. Repetir no duplica (huella por mes).
import { abrirBase, abrirIA, bajarPagina, candidatosDePrecio, clasificarOEncolar, Corrida, enlacesDePrecios, enParalelo, insertarPrecios, lista, prod, textoDeHtml, todas, valor } from "./lib.mjs";

const GIROS = lista("--giros") ?? ["estetica", "hotel", "guarderia", "veterinaria", "mixto"];
const CIUDADES = lista("--ciudades");
const TOPE = Number(valor("--tope") ?? 3000);
const PARALELO = Number(valor("--paralelo") ?? 6);
const giroDeProspecto = (p) => (p.giro === "mixto" ? (p.clasificacion?.servicios?.[0] ?? "hotel") : p.giro);

const db = await abrirBase();
const ia = abrirIA();
const corrida = await new Corrida(db, "sitio_web").empezar();

let prospectos = await todas(() => {
  let q = db.from("prospectos").select("id, nombre, giro, ciudad, estado, web, web_dominio, resenas, clasificacion").is("deleted_at", null).is("principal_id", null).not("web_dominio", "is", null).neq("etapa", "descartado").in("giro", GIROS);
  if (CIUDADES?.length) q = q.in("ciudad", CIUDADES);
  return q.order("resenas", { ascending: false, nullsFirst: false }).order("id");
});
prospectos = prospectos.slice(0, TOPE);
console.log(`${prod ? "PRODUCCIÓN" : "desarrollo"} · ${prospectos.length} prospectos con sitio web`);

const pendientes = [];
let hechos = 0;
try {
  await enParalelo(prospectos, PARALELO, async (p) => {
    const giro = giroDeProspecto(p);
    const paginas = [];
    const portada = await bajarPagina(p.web);
    corrida.revisados++;
    if (!portada.html) {
      if (portada.motivo && !/HTTP 4|tiempo|robots/.test(portada.motivo)) corrida.error(`${p.web_dominio}: ${portada.motivo}`);
      return;
    }
    paginas.push({ url: portada.url ?? p.web, html: portada.html });
    for (const enlace of enlacesDePrecios(portada.html, portada.url ?? p.web, 3)) {
      const r = await bajarPagina(enlace);
      if (r.html) paginas.push({ url: r.url ?? enlace, html: r.html });
    }
    const candidatos = [];
    paginas.forEach((pg, i) => {
      for (const c of candidatosDePrecio(textoDeHtml(pg.html), giro, `${p.id.slice(0, 8)}-${i}`, 30)) candidatos.push({ ...c, giro, url: pg.url, prospecto: p });
    });
    if (candidatos.length) pendientes.push(...candidatos);
    hechos++;
    if (hechos % 50 === 0) {
      console.log(`  ${hechos}/${prospectos.length} sitios · ${pendientes.length} candidatos en espera · IA $${corrida.costoIa.toFixed(2)}`);
      await vaciar();
      await corrida.guardar();
    }
  });
  await vaciar();
  await corrida.terminar();
} catch (e) {
  await corrida.terminar(e.message);
  process.exit(1);
}

async function vaciar() {
  if (!pendientes.length) return;
  const lote = pendientes.splice(0, pendientes.length);
  const clasificados = await clasificarOEncolar(db, ia, corrida, lote, (c) => ({ fuente: "sitio_web", url: c.url, prospecto_id: c.prospecto.id, ciudad: c.prospecto.ciudad, estado: c.prospecto.estado, origen: c.prospecto.id }));
  corrida.encontrados += clasificados.length;
  await insertarPrecios(
    db,
    corrida,
    clasificados.map((c) => ({ giro: c.giro, servicio: c.servicio, talla: c.talla, precio: c.precio, ciudad: c.prospecto.ciudad, estado: c.prospecto.estado, fuente: "sitio_web", url: c.url, prospecto_id: c.prospecto.id, detalle: c.contexto.slice(0, 200), origen: c.prospecto.id }))
  );
}
