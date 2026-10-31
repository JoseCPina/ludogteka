// Una corrida de prospección: busca en Google Places las combinaciones ciudad + consulta que llevan más tiempo
// sin buscarse (hasta el tope de búsquedas del día), registra cada lugar en la base (que decide si es nuevo,
// duplicado o ya es negocio de PeluDesk), completa correo/Instagram/Facebook/WhatsApp desde la web de los que
// tengan y deja el registro en prospeccion_corridas.
// Sin imports de valores: la búsqueda y la revisión de la web llegan como parámetros, para que la tarea de
// Vercel (/api/cron/prospectos) y scripts/prospectos/buscar.mjs usen exactamente lo mismo.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LugarGoogle } from "./places";
import type { ContactosWeb } from "./web";

export type Ajustes = { ciudades: string[]; consultas: Record<string, string[]>; tope_busquedas_dia: number; paginas_por_consulta: number; pausado: boolean };

export type OpcionesCorrida = {
  db: SupabaseClient;
  apiKey: string | null;
  buscar: (consulta: string, pageToken: string | null) => Promise<{ lugares: LugarGoogle[]; siguiente: string | null }>;
  revisarWeb: (url: string) => Promise<ContactosWeb & { error: string | null }>;
  origen: "cron" | "manual" | "script";
  /** Si no viene, el de los ajustes. */
  tope?: number;
  /** Solo estas ciudades / giros (las del ajuste si no viene). */
  ciudades?: string[];
  giros?: string[];
  /** Tiempo total disponible; la revisión de webs se corta antes. */
  presupuestoMs?: number;
  /** Máximo de webs a revisar en esta corrida (las que queden se revisan en la siguiente). */
  topeWebs?: number;
  avisar?: (texto: string) => void;
  /** La ciudad y el estado salen de la dirección (calidad.ts: ciudadDeDireccion); la de la búsqueda queda aparte. */
  ciudadDe?: (direccion: string | null) => { ciudad: string; estado: string | null } | null;
};

export type ResultadoCorrida = {
  id: string | null;
  estado: "terminada" | "fallida" | "sin_llave" | "pausada";
  busquedas: number;
  resultados: number;
  nuevos: number;
  duplicados: number;
  clientes: number;
  errores: number;
  websRevisadas: number;
  porCiudadGiro: Record<string, number>;
  error?: string;
};

const GIROS_BUSQUEDA = ["guarderia", "hotel", "estetica", "veterinaria"];

export async function leerAjustes(db: SupabaseClient): Promise<Ajustes> {
  const { data, error } = await db.from("prospeccion_ajustes").select("ciudades, consultas, tope_busquedas_dia, paginas_por_consulta, pausado").eq("id", 1).maybeSingle();
  if (error || !data) throw new Error(`No se pudieron leer los ajustes de prospección: ${error?.message ?? "sin fila"}`);
  return data as Ajustes;
}

async function enParalelo<T>(items: T[], n: number, fn: (x: T) => Promise<void>, seguir: () => boolean) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length && seguir()) await fn(items[i++]);
    })
  );
}

export async function correrProspeccion(o: OpcionesCorrida): Promise<ResultadoCorrida> {
  const inicio = Date.now();
  const presupuesto = o.presupuestoMs ?? 270_000;
  const queda = () => presupuesto - (Date.now() - inicio);
  const db = o.db;
  const r: ResultadoCorrida = { id: null, estado: "terminada", busquedas: 0, resultados: 0, nuevos: 0, duplicados: 0, clientes: 0, errores: 0, websRevisadas: 0, porCiudadGiro: {} };
  const errores: string[] = [];
  // Los nuevos de esta corrida, por si su web dice que ya son de PeluDesk (dejan de contar como nuevos).
  const nuevosDeEsta = new Map<string, string>();
  const anotar = (m: string) => {
    r.errores++;
    if (errores.length < 25) errores.push(m.slice(0, 300));
  };

  const ajustes = await leerAjustes(db);
  const guardar = async (fin: boolean) => {
    const fila = {
      estado: r.estado,
      busquedas: r.busquedas,
      resultados: r.resultados,
      nuevos: r.nuevos,
      duplicados: r.duplicados,
      clientes: r.clientes,
      errores: r.errores,
      webs_revisadas: r.websRevisadas,
      detalle: { por_ciudad_giro: r.porCiudadGiro, errores, tope: o.tope ?? ajustes.tope_busquedas_dia },
      error: r.error ?? null,
      ...(fin ? { fin_at: new Date().toISOString() } : {}),
    };
    if (!r.id) {
      const { data, error } = await db.from("prospeccion_corridas").insert({ origen: o.origen, ...fila, estado: fin ? r.estado : "corriendo" }).select("id").single();
      if (error) throw new Error(`No se pudo registrar la corrida: ${error.message}`);
      r.id = data.id as string;
    } else {
      const { error } = await db.from("prospeccion_corridas").update(fin ? fila : { ...fila, estado: "corriendo" }).eq("id", r.id);
      if (error) throw new Error(`No se pudo actualizar la corrida: ${error.message}`);
    }
  };

  if (ajustes.pausado && o.origen === "cron") {
    r.estado = "pausada";
    await guardar(true);
    return r;
  }
  if (!o.apiKey) {
    r.estado = "sin_llave";
    r.error = "Falta GOOGLE_PLACES_API_KEY: no se buscó nada.";
    await guardar(true);
    return r;
  }
  await guardar(false);

  try {
    // Combinaciones ciudad + consulta, la que lleva más sin buscarse primero.
    const ciudades = (o.ciudades?.length ? o.ciudades : ajustes.ciudades).map((c) => c.trim()).filter(Boolean);
    const giros = (o.giros?.length ? o.giros : GIROS_BUSQUEDA).filter((g) => GIROS_BUSQUEDA.includes(g));
    const combos = ciudades.flatMap((ciudad) => giros.flatMap((giro) => (ajustes.consultas[giro] ?? []).map((consulta) => ({ ciudad, giro, consulta }))));
    if (combos.length) {
      const { error } = await db.from("prospeccion_cursores").upsert(combos, { onConflict: "ciudad,consulta", ignoreDuplicates: true });
      if (error) throw new Error(`Cursores: ${error.message}`);
    }
    const { data: cursores, error: ec } = await db
      .from("prospeccion_cursores")
      .select("id, ciudad, consulta, giro, ultima_at")
      .in("ciudad", ciudades)
      .order("ultima_at", { ascending: true, nullsFirst: true })
      .order("id")
      .limit(1000);
    if (ec) throw new Error(`Cursores: ${ec.message}`);
    const validos = new Set(combos.map((c) => `${c.ciudad}|${c.consulta}`));
    const pendientes = (cursores ?? []).filter((c) => validos.has(`${c.ciudad}|${c.consulta}`));

    const tope = Math.max(0, o.tope ?? ajustes.tope_busquedas_dia);
    let fatal = false;
    for (const c of pendientes) {
      if (r.busquedas >= tope || fatal || queda() < 60_000) break;
      let token: string | null = null;
      let encontrados = 0;
      for (let pagina = 0; pagina < ajustes.paginas_por_consulta && r.busquedas < tope; pagina++) {
        let res: Awaited<ReturnType<OpcionesCorrida["buscar"]>>;
        r.busquedas++;
        try {
          res = await o.buscar(`${c.consulta} en ${c.ciudad}`, token);
        } catch (e) {
          anotar(`«${c.consulta}» en ${c.ciudad}: ${e instanceof Error ? e.message : String(e)}`);
          if (e && typeof e === "object" && "fatal" in e && (e as { fatal: boolean }).fatal) fatal = true;
          break;
        }
        for (const l of res.lugares) {
          if (l.cerrado) continue;
          r.resultados++;
          encontrados++;
          const { data, error } = await db.rpc("prospecto_registrar", {
            p: { nombre: l.nombre, giro: c.giro, ciudad: o.ciudadDe?.(l.direccion)?.ciudad ?? c.ciudad, estado: o.ciudadDe?.(l.direccion)?.estado ?? null, ciudad_busqueda: c.ciudad, direccion: l.direccion, telefono: l.telefono, web: l.web, calificacion: l.calificacion, resenas: l.resenas, google_place_id: l.id, google_tipos: l.tipos, fuente: "google_places" },
          });
          if (error) {
            anotar(`${l.nombre}: ${error.message}`);
            continue;
          }
          const { resultado, id } = data as { resultado: string; id: string | null };
          if (resultado === "nuevo") {
            r.nuevos++;
            const k = `${c.ciudad}|${c.giro}`;
            r.porCiudadGiro[k] = (r.porCiudadGiro[k] ?? 0) + 1;
            if (id) nuevosDeEsta.set(id, k);
            // La ubicación viene en la misma búsqueda (campo location): para el mapa de competencia.
            if (id && typeof l.lat === "number" && typeof l.lng === "number") await db.from("prospectos").update({ lat: l.lat, lng: l.lng, ubicado_at: new Date().toISOString() }).eq("id", id);
          } else if (resultado === "cliente") r.clientes++;
          else r.duplicados++;
        }
        token = res.siguiente;
        if (!token) break;
      }
      await db.from("prospeccion_cursores").update({ ultima_at: new Date().toISOString(), resultados: encontrados }).eq("id", c.id);
      o.avisar?.(`${c.ciudad} · ${c.consulta}: ${encontrados} lugares (búsquedas ${r.busquedas}/${tope})`);
      if (r.busquedas % 10 === 0) await guardar(false);
    }

    // Webs pendientes (de esta corrida o de las anteriores que no alcanzaron).
    const topeWebs = o.topeWebs ?? 400;
    if (topeWebs > 0 && queda() > 20_000) {
      const { data: porRevisar, error: ew } = await db
        .from("prospectos")
        .select("id, web")
        .is("deleted_at", null)
        .is("web_revisada_at", null)
        .not("web", "is", null)
        .order("created_at")
        .order("id")
        .limit(topeWebs);
      if (ew) anotar(`Webs: ${ew.message}`);
      await enParalelo(
        (porRevisar ?? []) as { id: string; web: string }[],
        8,
        async (p) => {
          const c = await o.revisarWeb(p.web);
          const { data, error } = await db.rpc("prospecto_completar_web", { p_id: p.id, p: c });
          if (error) anotar(`Web ${p.web}: ${error.message}`);
          else {
            r.websRevisadas++;
            if ((data as { cliente?: boolean })?.cliente) {
              r.clientes++;
              const k = nuevosDeEsta.get(p.id);
              if (k) {
                r.nuevos--;
                r.porCiudadGiro[k]--;
              }
            }
          }
        },
        () => queda() > 15_000
      );
    }

    const { error: er } = await db.rpc("prospectos_revisar_clientes");
    if (er) anotar(`Revisar clientes: ${er.message}`);
    if (fatal && r.nuevos === 0 && r.duplicados === 0) {
      r.estado = "fallida";
      r.error = errores[0];
    }
  } catch (e) {
    r.estado = "fallida";
    r.error = e instanceof Error ? e.message : String(e);
  }
  await guardar(true);
  return r;
}
