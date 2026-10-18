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

export type ResultadoCalidad = { ciudades: number; clasificados: number; descartados: number; giroCambiado: number; sucursales: number; errores: string[] };

const COLS = "id, nombre, giro, giro_busqueda, ciudad, ciudad_norm, ciudad_busqueda, estado, direccion, google_tipos, calificacion, resenas, web, web_resumen, instagram, facebook, etapa, principal_id, negocio_cliente_id, clasificado_at, clasificacion_revertida_at, no_agrupar, descarte_tipo, etapa_antes_descarte";
type Fila = {
  id: string; nombre: string; giro: string; giro_busqueda: string | null; ciudad: string; ciudad_norm: string | null; ciudad_busqueda: string | null; estado: string | null;
  direccion: string | null; google_tipos: string[]; calificacion: number | null; resenas: number | null; web: string | null; web_resumen: string | null;
  instagram: string | null; facebook: string | null; etapa: string; principal_id: string | null; negocio_cliente_id: string | null;
  clasificado_at: string | null; clasificacion_revertida_at: string | null; no_agrupar: boolean; descarte_tipo: string | null; etapa_antes_descarte: string | null;
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
  const r: ResultadoCalidad = { ciudades: 0, clasificados: 0, descartados: 0, giroCambiado: 0, sucursales: 0, errores: [] };
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
    const quitarDescarte = p.etapa === "descartado" && p.descarte_tipo === "no_es_del_giro" && pr0?.etapa !== "descartado";
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
