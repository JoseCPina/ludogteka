// Calidad de la base de prospectos: la ciudad sale de la dirección (no de la búsqueda), la IA decide el giro real y
// descarta lo que no es del giro, y los que comparten marca se agrupan como sucursales de un mismo negocio.
// Sin imports de valores: la clasificación llega como parámetro (la tarea, las acciones y los scripts la arman).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Clasificacion, ParaClasificar, Servicio } from "./clasificar";

// ── Ciudad ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Google escribe las direcciones de México así: «Calle 123, Colonia, 78000 San Luis Potosí, S.L.P., México».
// La ciudad es lo que sigue al código postal; el estado, la abreviatura de después.

const ESTADOS: Record<string, string> = {
  cdmx: "Ciudad de México", "ciudad de mexico": "Ciudad de México", "d f": "Ciudad de México", df: "Ciudad de México",
  mex: "Estado de México", "edo mex": "Estado de México", "estado de mexico": "Estado de México",
  jal: "Jalisco", jalisco: "Jalisco", "n l": "Nuevo León", nl: "Nuevo León", "nuevo leon": "Nuevo León",
  qro: "Querétaro", queretaro: "Querétaro", "s l p": "San Luis Potosí", slp: "San Luis Potosí", "san luis potosi": "San Luis Potosí",
  gto: "Guanajuato", guanajuato: "Guanajuato", ags: "Aguascalientes", aguascalientes: "Aguascalientes", pue: "Puebla", puebla: "Puebla",
  mich: "Michoacán", michoacan: "Michoacán", coah: "Coahuila", coahuila: "Coahuila", tamps: "Tamaulipas", tamaulipas: "Tamaulipas",
  hgo: "Hidalgo", hidalgo: "Hidalgo", zac: "Zacatecas", zacatecas: "Zacatecas", mor: "Morelos", morelos: "Morelos",
  ver: "Veracruz", veracruz: "Veracruz", yuc: "Yucatán", yucatan: "Yucatán", "q r": "Quintana Roo", qroo: "Quintana Roo", "quintana roo": "Quintana Roo",
  "b c": "Baja California", bc: "Baja California", "b c s": "Baja California Sur", bcs: "Baja California Sur", son: "Sonora", sonora: "Sonora",
  chih: "Chihuahua", chihuahua: "Chihuahua", dgo: "Durango", durango: "Durango", sin: "Sinaloa", sinaloa: "Sinaloa", nay: "Nayarit", nayarit: "Nayarit",
  col: "Colima", colima: "Colima", gro: "Guerrero", guerrero: "Guerrero", oax: "Oaxaca", oaxaca: "Oaxaca", chis: "Chiapas", chiapas: "Chiapas",
  tab: "Tabasco", tabasco: "Tabasco", camp: "Campeche", campeche: "Campeche", tlax: "Tlaxcala", tlaxcala: "Tlaxcala",
};
// Nombres que Google usa y no son como se dice la ciudad.
const CIUDAD_COMO_SE_DICE: Record<string, string> = {
  "santiago de queretaro": "Querétaro",
  "san luis": "San Luis Potosí",
  "heroica puebla de zaragoza": "Puebla",
  "monterrey centro": "Monterrey",
  queretaro: "Querétaro",
  qro: "Querétaro",
  slp: "San Luis Potosí",
  "s l p": "San Luis Potosí",
  gdl: "Guadalajara",
  jal: "Guadalajara",
  mty: "Monterrey",
  "n l": "Monterrey",
  cdmx: "Ciudad de México",
};

export const sinAcentos = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function ciudadDeDireccion(direccion: string | null | undefined): { ciudad: string; estado: string | null } | null {
  if (!direccion) return null;
  const partes = direccion.split(",").map((p) => p.trim()).filter(Boolean);
  if (partes.at(-1) && /^m[eé]xico$/i.test(partes.at(-1)!)) partes.pop();
  const estadoDe = (p: string | undefined) => (p ? ESTADOS[sinAcentos(p)] ?? null : null);
  const i = partes.findIndex((p) => /^\d{5}\s+\S/.test(p));
  let ciudad: string | null = null;
  let estado: string | null = null;
  if (i >= 0) {
    ciudad = partes[i].replace(/^\d{5}\s+/, "");
    estado = estadoDe(partes[i + 1]);
  } else {
    const j = partes.findIndex((p, k) => k > 0 && estadoDe(p));
    if (j > 0) {
      ciudad = partes[j - 1].replace(/^\d{5}\s*/, "");
      estado = estadoDe(partes[j]);
    }
  }
  if (!ciudad) return null;
  // En la capital, Google pone a veces la alcaldía en lugar de la ciudad.
  if (estado === "Ciudad de México") ciudad = "Ciudad de México";
  ciudad = ciudad.replace(/^Cdad\.?\s+/i, "Ciudad ").replace(/^Cd\.\s+/i, "Ciudad ");
  ciudad = CIUDAD_COMO_SE_DICE[sinAcentos(ciudad)] ?? ciudad;
  return { ciudad, estado };
}

// ── Marca (sucursales) ───────────────────────────────────────────────────────────────────────────────────────────

const PALABRAS_DE_GIRO = new Set(
  ("estetica esteticas canina canino caninas caninos hotel hoteles guarderia guarderias veterinaria veterinario veterinarias veterinarios " +
    "clinica clinicas hospital consultorio spa daycare day care pet pets dog dogs perro perros perruno perrunos mascota mascotas grooming groomer " +
    "boutique y e de del la las el los para and the center centro club sucursal suc oficial mx mex slp cdmx gdl mty qro sa cv " +
    "pension pensiones estancia resort kinder casa animal animales salud health vida vet vets medica medico medicina hogar servicio servicios " +
    // Ciudades: «Club Dog Querétaro» y «Hospital Veterinario Querétaro» no son la misma marca.
    "san luis potosi queretaro monterrey guadalajara mexico ciudad zapopan juriquilla pedro garza garcia nicolas soledad tlaquepaque apodaca santiago").split(" ")
);

/** La marca de un nombre: sin las palabras del giro, sin espacios. «CanHijos hotel & daycare» y «CAN HIJOS» → «canhijos». */
export function claveMarca(nombre: string): string | null {
  const palabras = sinAcentos(nombre.replace(/([a-z])([A-Z])/g, "$1 $2")).split(" ").filter((w) => w && !PALABRAS_DE_GIRO.has(w));
  const clave = palabras.join("");
  // Con menos de 6 letras la marca es una palabra común («happy», «pets»): no alcanza para decir que es el mismo negocio.
  return clave.length >= 6 ? clave : null;
}

export type ParaAgrupar = {
  id: string;
  nombre: string;
  ciudad_norm: string | null;
  estado: string | null;
  instagram: string | null;
  facebook: string | null;
  resenas: number | null;
  principal_id: string | null;
  /** Descartado por la clasificación: puede ser sucursal, pero no queda de principal si hay otro. */
  descartado?: boolean;
};

/**
 * Grupos de sucursales: misma marca y misma ciudad, o misma marca en el mismo estado con un perfil de Instagram o
 * Facebook compartido, o misma marca larga (10+ letras, «huellitas» con 9 se repite entre negocios distintos) en cualquier ciudad. El principal es el que ya lo era o el
 * de más reseñas. Devuelve el principal de cada id que debe ser sucursal.
 */
export function agruparSucursales(lista: ParaAgrupar[]): Map<string, string> {
  const porMarca = new Map<string, ParaAgrupar[]>();
  for (const p of lista) {
    const k = claveMarca(p.nombre);
    if (!k) continue;
    porMarca.set(k, [...(porMarca.get(k) ?? []), p]);
  }
  const resultado = new Map<string, string>();
  for (const [clave, grupo] of porMarca) {
    if (grupo.length < 2) continue;
    // Subgrupos que de verdad son el mismo negocio.
    const juntos: ParaAgrupar[][] = [];
    for (const p of grupo) {
      const destino = juntos.find((g) =>
        g.some(
          (q) =>
            (p.ciudad_norm && p.ciudad_norm === q.ciudad_norm) ||
            clave.length >= 10 ||
            (p.estado && p.estado === q.estado && ((p.instagram && p.instagram === q.instagram) || (p.facebook && p.facebook === q.facebook)))
        )
      );
      if (destino) destino.push(p);
      else juntos.push([p]);
    }
    for (const g of juntos) {
      if (g.length < 2) continue;
      const principal =
        g.find((p) => !p.principal_id && !p.descartado && g.some((q) => q.principal_id === p.id)) ??
        [...g].sort((a, b) => Number(a.descartado ?? false) - Number(b.descartado ?? false) || (b.resenas ?? 0) - (a.resenas ?? 0) || a.id.localeCompare(b.id))[0];
      for (const p of g) if (p.id !== principal.id) resultado.set(p.id, principal.id);
    }
  }
  return resultado;
}

// ── Limpieza estricta de hotel y guardería (18 de octubre de 2026) ──────────────────────────────────────────────
// En Google, «hotel» y «guardería» traen sobre todo hoteles para personas y guarderías infantiles (IMSS, estancias,
// CENDI, kínder). Un prospecto de esos giros —o un mixto que salió de una búsqueda de hotel o guardería— se queda
// solo si algo de lo que sabemos de él habla de mascotas: su nombre, sus categorías de Google, el título y la
// descripción de su web, su dominio o sus redes. Las reseñas no se guardan (Text Search no las trae y pedirlas por
// lugar se cobra), así que no entran.

export const MOTIVO_HOTEL = "Hotel para personas";
export const MOTIVO_GUARDERIA = "Guardería infantil";

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// «Pet friendly», «aceptamos mascotas» o «ven con tu mascota» son de un hotel para personas que admite mascotas:
// el texto que lo dice no cuenta como de mascotas (si el negocio es de perros lo dirán sus categorías u otro lado).
const ACEPTA_MASCOTAS = /\b(pet[\s-]?friendly|petfriendly|(se )?(aceptan?|admiten?|permiten?|aceptamos|admitimos|permitimos) (a )?(tu |tus |su |sus )?mascotas?|mascotas? (bienvenidas?|permitidas?)|traiga su mascota|con (tu|tus|su|sus) mascotas?)\b/;

// Palabras de mascotas, enteras (no «carpet», «competencia» ni «canal»).
const PALABRAS = /\b(perr[oa]s?|perrit[oa]s?|perrun[oa]s?|perruqueria|mascotas?|pets?|petshop|petsitter|petcare|canin[oa]s?|canes|can|k9|k-9|dogs?|doggy|doggie|puppy|puppies|gat[oa]s?|gatit[oa]s?|felin[oa]s?|cats?|kitty|animal(es)?|animalit[oa]s?|veterinari[oa]s?|vet|grooming|groomer|cachorr[oa]s?|lomit[oa]s?|peludit[oa]s?|peludos?|huellitas?|patitas?|firulais|guau|miau|michis?|paws?|woof|bark)\b/;

// Pegadas a otra palabra («doghotel», «dogtraining», «petsland», «mascotaslandia», «caninoshotel»).
const PEGADAS = /(perr[oa]|mascota|canin[oa]|doggy|dog(s)?(hotel|house|land|zone|camp|care|spa|day|train|walk|sit|school|club|lover)|pet(s)?(hotel|house|land|zone|camp|care|spa|shop|lovers|friends?|club|resort|paradise)|(hotel|house|land|camp|spa|resort)pets?|(hotel|house|land|camp|spa|resort)dogs?|veterinari)/;

// Palabras que también usan las guarderías infantiles («Guardería Cachorros», «El Gato con Botas», «Patitas»): con
// categoría de Google de cuidado infantil o escuela no bastan.
const DE_NINOS_TAMBIEN = /^(gat[oa]s?|gatit[oa]s?|cachorr[oa]s?|patitas?|huellitas?|peludit[oa]s?|kitty|puppy|puppies|doggy|doggie|animalit[oa]s?|miau|michis?)$/;
const TIPOS_NINOS = /^(child_care_agency|preschool|primary_school|school|educational_institution)$/;
// Señales de guardería infantil en el nombre o la web: ganan a cualquier palabra (no a una categoría de mascotas).
const INFANTIL = /\b(infantil(es)?|estimulacion temprana|kinder|kindergarten|preescolar|maternal|lactantes|cendi|imss|issste|dif|bebes|ninos|ninas|nursery|daycare infantil)\b/;

// Categorías de Google (types de Places) que son de animales.
const TIPOS = /(pet|veterinar|animal|dog|cat_)/;

export type ParaRevisar = {
  nombre: string;
  giro: string;
  giro_busqueda: string | null;
  google_tipos: string[] | null;
  web: string | null;
  web_resumen: string | null;
  instagram: string | null;
  facebook: string | null;
};

/** ¿Le aplica la regla? Hotel y guardería, y el mixto que salió de una búsqueda de hotel o guardería. */
export function aplicaLimpieza(p: Pick<ParaRevisar, "giro" | "giro_busqueda">): boolean {
  return p.giro === "hotel" || p.giro === "guarderia" || (p.giro === "mixto" && (p.giro_busqueda === "hotel" || p.giro_busqueda === "guarderia"));
}

/** Lo que dice algo de mascotas, o null si no hay nada. */
export function evidenciaMascotas(p: ParaRevisar): string | null {
  const tipo = (p.google_tipos ?? []).find((t) => TIPOS.test(t));
  if (tipo) return `categoría de Google «${tipo}»`;
  const fuentes: [string, string | null][] = [
    ["nombre", p.nombre],
    ["web", p.web_resumen],
    ["dominio", p.web],
    ["Instagram", p.instagram],
    ["Facebook", p.facebook],
  ];
  const deNinos = (p.google_tipos ?? []).some((t) => TIPOS_NINOS.test(t));
  if ([p.nombre, p.web_resumen].some((t) => t && INFANTIL.test(norm(t)))) return null;
  for (const [donde, texto] of fuentes) {
    if (!texto) continue;
    const t = norm(texto);
    if (ACEPTA_MASCOTAS.test(t)) continue;
    const limpio = t.replace(/\bcan[\s-]?(inn|cun)\b|\bcancun\b/g, " ");
    const m = limpio.match(PALABRAS) ?? limpio.replace(/[^a-z0-9]/g, "").match(PEGADAS);
    if (!m) continue;
    if (deNinos && DE_NINOS_TAMBIEN.test(m[0])) continue;
    return `${donde}: «${m[0]}»`;
  }
  return null;
}

/** Motivo del descarte para un prospecto al que le aplica la regla y no habla de mascotas. */
export function motivoLimpieza(p: Pick<ParaRevisar, "giro" | "giro_busqueda">): string {
  const g = p.giro === "mixto" ? p.giro_busqueda : p.giro;
  return g === "guarderia" ? MOTIVO_GUARDERIA : MOTIVO_HOTEL;
}

/** null = se queda; texto = el motivo del descarte. */
export function revisarHotelGuarderia(p: ParaRevisar): string | null {
  if (!aplicaLimpieza(p)) return null;
  return evidenciaMascotas(p) ? null : motivoLimpieza(p);
}

// ── Gobierno, refugio o escuela (18 de octubre de 2026) ─────────────────────────────────────────────────────────
// Centros de control animal y antirrábicos, bienestar animal municipal o estatal, perreras, protectoras y refugios
// sin servicio de pago, y facultades o escuelas de veterinaria: no compran un sistema. Aplica a todos los giros.
// Se mira el nombre y el título/descripción de su web; un refugio o una protectora que además ofrece un servicio
// de pago (pensión, estética, clínica…) se queda.
export const MOTIVO_GOBIERNO = "Gobierno, refugio o escuela";

const GOBIERNO = /\b(control (animal|canino|canina|de animales|de fauna|y (asistencia|bienestar) animal)|centro (de )?(control|atencion) (canin[oa]|animal)|antirrabic[oa]s?|perreras? municipal(es)?|caan|cecan|ceca|zoonosis|(bienestar|proteccion|atencion|salud) animal( (municipal|estatal|del municipio|del estado))?( [a-z]+)? (municipal|estatal)|(direccion|coordinacion|departamento|modulo|unidad|centro|instituto|jefatura|subdireccion) (municipal )?de (bienestar|proteccion|control|atencion) (y [a-z]+ )?animal|(municipio|municipal|ayuntamiento|gobierno|h\.? ayuntamiento|secretaria|dif) [^|]{0,40}animal|animal [^|]{0,20}(municipal|estatal))\b/;
const REFUGIO = /\b(refugios?|albergues?\b[^|]{0,30}\b(animal(es)?|perr[oa]s?|gat[oa]s?|canin[oa]s?|felin[oa]s?|mascotas?|patitas|huellitas)|protector(a|as)|rescates?|rescatistas?|adopcion(es)?|adopta|adoptame|santuarios?|asociacion protectora|sociedad protectora|patrulla animal|sin hogar|callejer[oa]s)\b/;
const ESCUELA = /\b(facultad|escuela de (medicina )?veterinaria|universidad|universitari[oa]|fmvz|licenciatura en medicina veterinaria)\b/;
// Siglas de universidades: solo en el nombre y sin «egresado de» (un médico egresado de la UNAM no es la facultad).
const SIGLAS_UNIVERSIDAD = /\b(unam|uanl|udeg|udg|uaslp|buap|uaq|uady|uabc|uan|uaa|uach|uaem|uacj|uv|uvm|ipn|uat|ujat|unach)\b/;
const VETERINARIA_TEXTO = /\b(veterinari[ao]s?|medicina veterinaria|zootecnia|mvz|grandes especies|especies menores)\b/;
// «Bienestar Animal Apodaca», «Casa de Bienestar Animal de San Nicolás»: el nombre ES la dependencia (sin clínica).
const BIENESTAR_COMO_NOMBRE = /^(casa |centro |modulo |unidad |direccion |coordinacion )?(de )?(bienestar|proteccion|control) animal\b/;
const CLINICA = /\b(clinica|veterinari[ao]|consultorio|hospital|estetica|pension|hotel)\b/;
const VET_MUNICIPAL = /\b(veterinari[ao]|clinica|hospital|consultorio)\b[^|]{0,30}\bmunicipal\b|\bmunicipal\b[^|]{0,20}\b(veterinari[ao]|bienestar)\b/;
// Un refugio o protectora que también cobra un servicio se queda.
const SERVICIO_DE_PAGO = /\b(pension|hotel|hospedaje|guarderia|daycare|estetica|grooming|bano|banos|corte|spa|clinica|consultorio|consulta|hospital|veter[a-z]*|vet|medic[oa]|mvz|vacunacion|tienda|petshop|boutique|adiestramiento)\b/;

/** null = se queda; MOTIVO_GOBIERNO si es gobierno, refugio o escuela. */
export function revisarGobiernoRefugio(p: Pick<ParaRevisar, "nombre" | "web_resumen" | "google_tipos">): string | null {
  const textos = [p.nombre, p.web_resumen].filter(Boolean).map((t) => norm(t as string));
  const todo = textos.join(" | ");
  const tipos = p.google_tipos ?? [];
  const nombre = norm(p.nombre);
  // «Centro de Bienestar Animal y Clínica Veterinaria X»: una clínica con ese nombre es privada, salvo que diga municipal.
  const clinicaPrivada = /\b(clinica|consultorio)\b/.test(nombre) && !/\b(municipal|gobierno|estatal|ayuntamiento|dif)\b/.test(nombre);
  if ((!clinicaPrivada && textos.some((t) => GOBIERNO.test(t))) || VET_MUNICIPAL.test(nombre)) return MOTIVO_GOBIERNO;
  if (BIENESTAR_COMO_NOMBRE.test(nombre) && !CLINICA.test(nombre)) return MOTIVO_GOBIERNO;
  // «Centro Municipal de Atención Canina», o una web que se presenta como gobierno municipal o del estado.
  const deAnimales = /\b(canin[oa]s?|felin[oa]s?|animal(es)?|antirrabic[oa]|zoonosis)\b/.test(nombre);
  if (deAnimales && /\b(municipal|estatal|ayuntamiento|gobierno)\b/.test(nombre)) return MOTIVO_GOBIERNO;
  if (deAnimales && p.web_resumen && /\b(gobierno (municipal|del estado|estatal|de [a-z]+)|h\.? ?ayuntamiento|ayuntamiento de|alcaldia de [a-z]+)\b/.test(norm(p.web_resumen))) return MOTIVO_GOBIERNO;
  // Google pone «government_office» entre muchas categorías de comercios; solo cuenta si es de las dos primeras.
  if (tipos.slice(0, 2).some((t) => /^(local_government_office|city_hall|government_office)$/.test(t))) return MOTIVO_GOBIERNO;
  const escuelaTipo = tipos.some((t) => /^(university|school|secondary_school)$/.test(t));
  const siglas = SIGLAS_UNIVERSIDAD.test(nombre) && !/\b(egresad[oa]s?|certificad[oa]s?|formad[oa]s?)\b/.test(nombre);
  if (VETERINARIA_TEXTO.test(todo) && (textos.some((t) => ESCUELA.test(t)) || escuelaTipo || siglas)) return MOTIVO_GOBIERNO;
  // Un refugio o protectora que también cobra (lo dice su nombre o su web) se queda.
  if (textos.some((t) => REFUGIO.test(t)) && !SERVICIO_DE_PAGO.test(todo)) return MOTIVO_GOBIERNO;
  return null;
}

// ── El proceso ───────────────────────────────────────────────────────────────────────────────────────────────────

export type OpcionesCalidad = {
  db: SupabaseClient;
  clasificar: ((lote: ParaClasificar[]) => Promise<Clasificacion[]>) | null;
  /** Para los que tienen web y todavía no tienen su resumen (lo usa la clasificación). */
  resumenWeb?: (url: string) => Promise<string | null>;
  topeClasificar?: number;
  lote?: number;
  presupuestoMs?: number;
  avisar?: (t: string) => void;
  giroDeServicios: (s: Servicio[], respaldo: string) => string;
};

export type ResultadoCalidad = { ciudades: number; clasificados: number; descartados: number; giroCambiado: number; sucursales: number; hotelesPersonas: number; guarderiasInfantiles: number; gobiernoRefugioEscuela: number; errores: string[] };

const COLS = "id, nombre, giro, giro_busqueda, ciudad, ciudad_norm, ciudad_busqueda, estado, direccion, google_tipos, calificacion, resenas, web, web_resumen, instagram, facebook, etapa, principal_id, negocio_cliente_id, clasificado_at, clasificacion_revertida_at, no_agrupar, descarte_tipo, descarte_motivo, etapa_antes_descarte";
type Fila = {
  id: string; nombre: string; giro: string; giro_busqueda: string | null; ciudad: string; ciudad_norm: string | null; ciudad_busqueda: string | null; estado: string | null;
  direccion: string | null; google_tipos: string[]; calificacion: number | null; resenas: number | null; web: string | null; web_resumen: string | null;
  instagram: string | null; facebook: string | null; etapa: string; principal_id: string | null; negocio_cliente_id: string | null;
  clasificado_at: string | null; clasificacion_revertida_at: string | null; no_agrupar: boolean; descarte_tipo: string | null; descarte_motivo: string | null; etapa_antes_descarte: string | null;
};

async function todos(db: SupabaseClient): Promise<Fila[]> {
  const filas: Fila[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await db.from("prospectos").select(COLS).is("deleted_at", null).order("id").range(d, d + 999);
    if (error) throw new Error(error.message);
    filas.push(...((data ?? []) as Fila[]));
    if ((data ?? []).length < 1000) break;
  }
  return filas;
}

async function enParalelo<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

export async function procesarCalidad(o: OpcionesCalidad): Promise<ResultadoCalidad> {
  const db = o.db;
  const inicio = Date.now();
  const queda = () => (o.presupuestoMs ?? 600_000) - (Date.now() - inicio);
  const r: ResultadoCalidad = { ciudades: 0, clasificados: 0, descartados: 0, giroCambiado: 0, sucursales: 0, hotelesPersonas: 0, guarderiasInfantiles: 0, gobiernoRefugioEscuela: 0, errores: [] };
  const anotar = (m: string) => r.errores.length < 30 && r.errores.push(m.slice(0, 300));
  let filas = await todos(db);

  // 1. Ciudad de la dirección. Si choca con otro prospecto del mismo nombre en esa ciudad, es el mismo negocio:
  //    queda como sucursal de ese.
  for (const p of filas) {
    const c = ciudadDeDireccion(p.direccion);
    if (!c) continue;
    if (c.ciudad === p.ciudad && c.estado === p.estado) continue;
    const { error } = await db.from("prospectos").update({ ciudad: c.ciudad, estado: c.estado }).eq("id", p.id);
    if (error && /nombre_ciudad/.test(error.message)) {
      const otro = filas.find((q) => q.id !== p.id && q.ciudad_norm === sinAcentos(c.ciudad) && sinAcentos(q.nombre) === sinAcentos(p.nombre));
      if (otro) await db.from("prospectos").update({ principal_id: otro.id, estado: c.estado }).eq("id", p.id);
    } else if (error) anotar(`Ciudad de ${p.nombre}: ${error.message}`);
    else {
      r.ciudades++;
      await db.from("prospectos_eventos").insert({ prospecto_id: p.id, tipo: "ciudad", texto: `Ciudad tomada de su dirección: ${c.ciudad}${c.estado ? `, ${c.estado}` : ""} (antes ${p.ciudad})` });
    }
  }

  // 2. Clasificación de lo que no se ha clasificado (los clientes no hacen falta; lo revertido a mano no se toca).
  if (o.clasificar) {
    const pendientes = filas.filter((p) => !p.clasificado_at && !p.negocio_cliente_id && !p.clasificacion_revertida_at).slice(0, o.topeClasificar ?? 2000);
    if (o.resumenWeb) {
      const sinResumen = pendientes.filter((p) => p.web && !p.web_resumen);
      await enParalelo(sinResumen, 8, async (p) => {
        if (queda() < 60_000) return;
        const res = await o.resumenWeb!(p.web!);
        if (res) {
          p.web_resumen = res;
          await db.from("prospectos").update({ web_resumen: res }).eq("id", p.id);
        }
      });
    }
    const tam = o.lote ?? 25;
    const lotes: Fila[][] = [];
    for (let i = 0; i < pendientes.length; i += tam) lotes.push(pendientes.slice(i, i + tam));
    await enParalelo(lotes, 4, async (lote) => {
      if (queda() < 30_000) return;
      let res: Clasificacion[];
      try {
        res = await o.clasificar!(lote.map((p) => ({ id: p.id, nombre: p.nombre, tipos: p.google_tipos ?? [], calificacion: p.calificacion, resenas: p.resenas, web: p.web, resumen_web: p.web_resumen, direccion: p.direccion })));
      } catch (e) {
        anotar(`Clasificar: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      for (const c of res) {
        const p = lote.find((x) => x.id === c.id)!;
        const giro = o.giroDeServicios(c.servicios, p.giro);
        const cambio: Record<string, unknown> = { clasificacion: { servicios: c.servicios, es_del_giro: c.es_del_giro, motivo: c.motivo }, clasificado_at: new Date().toISOString(), giro };
        if (!c.es_del_giro && p.etapa !== "descartado") {
          Object.assign(cambio, { etapa_antes_descarte: p.etapa, etapa: "descartado", descarte_tipo: "no_es_del_giro", descarte_motivo: c.motivo });
        }
        const { error } = await db.from("prospectos").update(cambio).eq("id", p.id);
        if (error) {
          anotar(`Guardar clasificación de ${p.nombre}: ${error.message}`);
          continue;
        }
        r.clasificados++;
        if (!c.es_del_giro && p.etapa !== "descartado") r.descartados++;
        if (giro !== p.giro) r.giroCambiado++;
        await db.from("prospectos_eventos").insert({
          prospecto_id: p.id,
          tipo: "clasificacion",
          texto: c.es_del_giro ? `Clasificado como ${giro}: ${c.motivo}` : `Descartado (no es del giro): ${c.motivo}`,
        });
      }
      o.avisar?.(`clasificados ${r.clasificados} · descartados ${r.descartados}`);
    });
  }

  // 2b. Limpieza estricta de hotel y guardería (mascotas.ts): el que no dice nada de mascotas es un hotel para
  //     personas o una guardería infantil. Corre después de la clasificación (que pudo cambiar el giro) y nunca
  //     toca a un cliente ni lo que alguien ya revirtió a mano («Revertir: sí es del giro»).
  filas = await todos(db);
  for (const p of filas) {
    if (p.etapa === "descartado" || p.negocio_cliente_id || p.clasificacion_revertida_at) continue;
    const motivo = revisarHotelGuarderia(p) ?? revisarGobiernoRefugio(p);
    if (!motivo) continue;
    const { error } = await db.from("prospectos").update({ etapa_antes_descarte: p.etapa, etapa: "descartado", descarte_tipo: "no_es_del_giro", descarte_motivo: motivo }).eq("id", p.id);
    if (error) {
      anotar(`Descartar ${p.nombre}: ${error.message}`);
      continue;
    }
    if (motivo === MOTIVO_GUARDERIA) r.guarderiasInfantiles++;
    else if (motivo === MOTIVO_GOBIERNO) r.gobiernoRefugioEscuela++;
    else r.hotelesPersonas++;
    await db.from("prospectos_eventos").insert({ prospecto_id: p.id, tipo: "clasificacion", texto: motivo === MOTIVO_GOBIERNO ? `Descartado (${motivo}): por su nombre o su web es una dependencia de gobierno, un refugio sin servicio de pago o una escuela` : `Descartado (${motivo}): no menciona mascotas en su nombre, categorías de Google, web ni redes` });
  }

  // 3. Sucursales: lo vivo y lo que descartó la clasificación (una sucursal de un negocio del giro con otra
  //    categoría en Google sí es del giro: se le quita el descarte). Sin clientes ni lo separado a mano.
  filas = await todos(db);
  const vivos = filas.filter((p) => !p.negocio_cliente_id && !p.no_agrupar && (p.etapa !== "descartado" || p.descarte_tipo === "no_es_del_giro"));
  const grupos = agruparSucursales(vivos.map((p) => ({ id: p.id, nombre: p.nombre, ciudad_norm: p.ciudad_norm, estado: p.estado, instagram: p.instagram, facebook: p.facebook, resenas: p.resenas, principal_id: p.principal_id, descartado: p.etapa === "descartado" })));
  // Lo que se agrupó con reglas anteriores y ya no se agruparía (ni tiene el mismo nombre que su principal) se suelta.
  for (const p of filas) {
    if (!p.principal_id || grupos.has(p.id) || p.no_agrupar) continue;
    const pr = filas.find((x) => x.id === p.principal_id);
    if (pr && sinAcentos(pr.nombre) === sinAcentos(p.nombre)) continue;
    await db.from("prospectos").update({ principal_id: null }).eq("id", p.id);
    await db.from("prospectos_eventos").insert({ prospecto_id: p.id, tipo: "sucursal", texto: "Ya no se agrupa como sucursal (otra marca)" });
  }
  for (const [id, principal] of grupos) {
    const p = filas.find((x) => x.id === id)!;
    if (p.principal_id === principal) continue;
    const pr0 = filas.find((x) => x.id === principal);
    // Lo que descartó la limpieza de hotel y guardería no se rescata por la marca: no habla de mascotas.
    const deLimpieza = p.descarte_motivo === MOTIVO_HOTEL || p.descarte_motivo === MOTIVO_GUARDERIA || p.descarte_motivo === MOTIVO_GOBIERNO;
    const quitarDescarte = p.etapa === "descartado" && p.descarte_tipo === "no_es_del_giro" && !deLimpieza && pr0?.etapa !== "descartado";
    const { error } = await db
      .from("prospectos")
      .update({ principal_id: principal, ...(quitarDescarte ? { etapa: p.etapa_antes_descarte ?? "nuevo", descarte_tipo: null, descarte_motivo: null, etapa_antes_descarte: null } : {}) })
      .eq("id", id);
    if (error) {
      anotar(`Sucursal ${p.nombre}: ${error.message}`);
      continue;
    }
    // Un principal que ahora es sucursal de otro: sus sucursales se mudan con él.
    await db.from("prospectos").update({ principal_id: principal }).eq("principal_id", id);
    r.sucursales++;
    const pr = filas.find((x) => x.id === principal);
    await db.from("prospectos_eventos").insert({ prospecto_id: id, tipo: "sucursal", texto: `Agrupado como sucursal de ${pr?.nombre ?? "otro prospecto"} (misma marca)` });
  }
  return r;
}
