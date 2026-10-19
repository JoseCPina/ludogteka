import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiMeta } from "./api";

// Normalización y hash de los datos que se le mandan a Meta para una lista de clientes, como lo pide su
// documentación de audiencias personalizadas: teléfono solo dígitos y con el código de país (52, sin «+» ni el 1 de
// celulares viejos), correo sin espacios y en minúsculas, y los dos en SHA-256 hexadecimal. Sin imports de valores de
// otros archivos: la usan el servidor y las pruebas (`node --experimental-strip-types`).

/** Teléfono de México listo para Meta: «52» + 10 dígitos, o null si no es un número de 10 dígitos. */
export function telefonoParaMeta(valor: string | null | undefined): string | null {
  const d = String(valor ?? "").replace(/\D/g, "");
  if (d.length === 10) return `52${d}`;
  if (d.length === 12 && d.startsWith("52")) return d;
  if (d.length === 13 && d.startsWith("521")) return `52${d.slice(3)}`;
  return null;
}

/** Correo listo para Meta: sin espacios y en minúsculas, o null si no parece un correo. */
export function correoParaMeta(valor: string | null | undefined): string | null {
  const c = String(valor ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) ? c : null;
}

export const sha256 = (texto: string) => createHash("sha256").update(texto, "utf8").digest("hex");

export function hashesDe(telefono: string | null | undefined, correo: string | null | undefined): { telefono: string | null; correo: string | null } {
  const t = telefonoParaMeta(telefono);
  const c = correoParaMeta(correo);
  return { telefono: t ? sha256(t) : null, correo: c ? sha256(c) : null };
}

// Sincronización diaria de las audiencias de Meta con la base de prospectos y los negocios (tarea
// /api/cron/meta-audiencias, después de la limpieza de las 7:00). Arma lo que DEBE estar en cada audiencia, lo
// compara con lo que ya se mandó (meta_audiencias_miembros) y le manda a Meta solo las altas, las bajas y los cambios.
// Sin imports de valores de «@/»: el cliente de la base (llave de servicio) y la API llegan inyectados.

export type Clave = "prospectos" | "veterinarias" | "esteticas" | "hotel_guarderia" | "visitaron" | "en_prueba" | "pagando";
type Deseado = { miembro: string; hash_telefono: string | null; hash_correo: string | null };
type Prospecto = {
  id: string; giro: string; etapa: string; telefono: string | null; whatsapp: string | null; whatsapp_bot: string | null; correo: string | null;
  visitas: number | null; negocio_cliente_id: string | null; publicidad_baja_at: string | null;
};

const ESPERA_CORRIENDO_MS = 15 * 60 * 1000;
const diez = (t: string | null | undefined) => {
  const d = String(t ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
};

async function leerTodo<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if ((data ?? []).length < 1000) return filas;
  }
}

/** Lo que debe estar en cada audiencia, sin tocar Meta. Pura en lo que importa: las reglas de quién entra. */
export function armarDeseados(o: {
  prospectos: Prospecto[];
  negocios: { negocio_id: string; tipo: string; telefonos: string[] | null; correos: string[] | null }[];
  telefonosExcluidos: Set<string>;
}): Record<Clave, Deseado[]> {
  const deseados: Record<Clave, Deseado[]> = { prospectos: [], veterinarias: [], esteticas: [], hotel_guarderia: [], visitaron: [], en_prueba: [], pagando: [] };
  const negociosPagan = new Set(o.negocios.filter((n) => n.tipo === "pagando").map((n) => n.negocio_id));
  const negociosPrueba = new Set(o.negocios.filter((n) => n.tipo === "prueba").map((n) => n.negocio_id));

  for (const n of o.negocios) {
    const tel = (n.telefonos ?? []).find((t) => !o.telefonosExcluidos.has(diez(t) ?? ""));
    if ((n.telefonos ?? []).some((t) => o.telefonosExcluidos.has(diez(t) ?? "")) && !tel) continue;
    const h = hashesDe(tel ?? null, (n.correos ?? [])[0] ?? null);
    if (!h.telefono && !h.correo) continue;
    const fila = { miembro: `negocio:${n.negocio_id}`, hash_telefono: h.telefono, hash_correo: h.correo };
    if (n.tipo === "pagando") deseados.pagando.push(fila);
    else if (n.tipo === "prueba") deseados.en_prueba.push(fila);
  }
  const hashesPagando = new Set(deseados.pagando.flatMap((d) => [d.hash_telefono, d.hash_correo]).filter(Boolean) as string[]);

  for (const p of o.prospectos) {
    if (p.etapa === "descartado" || p.publicidad_baja_at) continue;
    const tel = [p.whatsapp, p.telefono, p.whatsapp_bot].map(diez).find(Boolean) ?? null;
    if ([p.whatsapp, p.telefono, p.whatsapp_bot].some((t) => o.telefonosExcluidos.has(diez(t) ?? ""))) continue;
    const h = hashesDe(tel, p.correo);
    if (!h.telefono && !h.correo) continue;
    const fila = { miembro: `prospecto:${p.id}`, hash_telefono: h.telefono, hash_correo: h.correo };
    const pagaYa = p.etapa === "pagando" || (p.negocio_cliente_id && negociosPagan.has(p.negocio_cliente_id)) || (h.telefono && hashesPagando.has(h.telefono)) || (h.correo && hashesPagando.has(h.correo));
    if (pagaYa) {
      // Un negocio que paga nunca va en las de prospectos; si su negocio no salió arriba, entra por el prospecto.
      if (!(p.negocio_cliente_id && negociosPagan.has(p.negocio_cliente_id))) deseados.pagando.push(fila);
      continue;
    }
    if (p.etapa === "en_prueba" && !(p.negocio_cliente_id && negociosPrueba.has(p.negocio_cliente_id))) deseados.en_prueba.push(fila);
    deseados.prospectos.push(fila);
    if (p.giro === "veterinaria") deseados.veterinarias.push(fila);
    if (p.giro === "estetica") deseados.esteticas.push(fila);
    if (["hotel", "guarderia", "mixto"].includes(p.giro)) deseados.hotel_guarderia.push(fila);
    if ((p.visitas ?? 0) > 0 || p.etapa === "caliente") deseados.visitaron.push(fila);
  }
  return deseados;
}

const filaMeta = (d: { hash_telefono: string | null; hash_correo: string | null }): [string, string] => [d.hash_telefono ?? "", d.hash_correo ?? ""];

export type ResultadoSync = {
  corridaId: string | null;
  estado: "ok" | "con_errores" | "fallida" | "sin_credenciales" | "ocupada";
  resumen: Record<string, Record<string, unknown>>;
  errores: string[];
};

export async function sincronizarAudiencias(o: { db: SupabaseClient; api: ApiMeta | null; origen: "cron" | "manual" | "script" }): Promise<ResultadoSync> {
  const { db, api } = o;
  const { data: abierta } = await db.from("meta_audiencias_corridas").select("id, inicio_at").eq("estado", "corriendo").is("deleted_at", null).order("inicio_at", { ascending: false }).limit(1).maybeSingle();
  if (abierta && Date.now() - new Date(abierta.inicio_at as string).getTime() < ESPERA_CORRIENDO_MS) {
    return { corridaId: null, estado: "ocupada", resumen: {}, errores: ["Ya hay una sincronización corriendo."] };
  }
  const { data: corrida } = await db.from("meta_audiencias_corridas").insert({ origen: o.origen }).select("id").single();
  const corridaId = (corrida?.id as string) ?? null;
  const errores: string[] = [];
  const resumen: Record<string, Record<string, unknown>> = {};
  const cerrar = async (estado: ResultadoSync["estado"]) => {
    if (corridaId) await db.from("meta_audiencias_corridas").update({ estado: estado === "ocupada" ? "fallida" : estado, fin_at: new Date().toISOString(), resumen, errores }).eq("id", corridaId);
    return { corridaId, estado, resumen, errores };
  };

  try {
    const [prospectos, excl, neg, audiencias] = await Promise.all([
      leerTodo<Prospecto>((a, b) => db.from("prospectos").select("id, giro, etapa, telefono, whatsapp, whatsapp_bot, correo, visitas, negocio_cliente_id, publicidad_baja_at").is("deleted_at", null).order("id").range(a, b)),
      leerTodo<{ telefono: string }>((a, b) => db.from("seguimiento_pruebas_exclusiones").select("telefono").is("deleted_at", null).order("id").range(a, b)),
      leerTodo<{ negocio_id: string; tipo: string; telefonos: string[]; correos: string[] }>((a, b) => db.rpc("meta_audiencias_negocios").order("negocio_id").range(a, b)),
      // limite-filas-ok: son las 7 audiencias fijas que siembra la migración
      db.from("meta_audiencias").select("id, clave, nombre, descripcion, audience_id").is("deleted_at", null).order("clave"),
    ]);
    if (audiencias.error) throw new Error(audiencias.error.message);
    const deseados = armarDeseados({
      prospectos,
      negocios: neg,
      telefonosExcluidos: new Set(excl.map((e) => diez(e.telefono)).filter(Boolean) as string[]),
    });

    if (!api) {
      for (const a of audiencias.data ?? []) resumen[a.clave as string] = { calculados: deseados[a.clave as Clave]?.length ?? 0 };
      errores.push("Faltan META_ADS_TOKEN o META_AD_ACCOUNT_ID en el servidor.");
      return await cerrar("sin_credenciales");
    }

    let existentes: { id: string; name: string }[] | null = null;
    let bloqueo: string | null = null;
    for (const a of audiencias.data ?? []) {
      const clave = a.clave as Clave;
      const quiero = deseados[clave] ?? [];
      const r: Record<string, unknown> = { calculados: quiero.length, altas: 0, bajas: 0, cambios: 0, recibidos: 0, invalidos: 0 };
      resumen[clave] = r;
      if (bloqueo) {
        r.error = bloqueo;
        continue;
      }
      try {
        let audienciaId = (a.audience_id as string | null) ?? null;
        if (!audienciaId) {
          existentes ??= await api.listar();
          audienciaId = existentes.find((e) => e.name === a.nombre)?.id ?? (await api.crear(a.nombre as string, (a.descripcion as string) ?? ""));
          await db.from("meta_audiencias").update({ audience_id: audienciaId }).eq("id", a.id);
          r.creada = true;
        }
        const tengo = await leerTodo<{ id: string; miembro: string; hash_telefono: string | null; hash_correo: string | null }>((x, y) =>
          db.from("meta_audiencias_miembros").select("id, miembro, hash_telefono, hash_correo").eq("audiencia_id", a.id).is("deleted_at", null).order("id").range(x, y),
        );
        const porMiembro = new Map(tengo.map((t) => [t.miembro, t]));
        const quieroPor = new Map(quiero.map((q) => [q.miembro, q]));
        const altas = quiero.filter((q) => !porMiembro.has(q.miembro));
        const bajas = tengo.filter((t) => !quieroPor.has(t.miembro));
        const cambiados = quiero.filter((q) => {
          const t = porMiembro.get(q.miembro);
          return t && (t.hash_telefono !== q.hash_telefono || t.hash_correo !== q.hash_correo);
        });
        // Primero lo que sale (bajas y la versión vieja de lo que cambió), luego lo que entra.
        const quitar = [...bajas, ...cambiados.map((q) => porMiembro.get(q.miembro)!)];
        if (quitar.length) await api.usuarios(audienciaId, quitar.map(filaMeta), true);
        const ahora = new Date().toISOString();
        if (quitar.length) {
          const ids = quitar.map((t) => t.id);
          for (let i = 0; i < ids.length; i += 500) await db.from("meta_audiencias_miembros").update({ deleted_at: ahora }).in("id", ids.slice(i, i + 500));
        }
        const poner = [...altas, ...cambiados];
        if (poner.length) {
          const env = await api.usuarios(audienciaId, poner.map(filaMeta));
          r.recibidos = env.recibidos;
          r.invalidos = env.invalidos;
          const filas = poner.map((q) => ({ audiencia_id: a.id, miembro: q.miembro, hash_telefono: q.hash_telefono, hash_correo: q.hash_correo, enviado_at: ahora }));
          for (let i = 0; i < filas.length; i += 500) {
            const { error } = await db.from("meta_audiencias_miembros").insert(filas.slice(i, i + 500));
            if (error) throw new Error(`Registro de miembros: ${error.message}`);
          }
        }
        r.altas = altas.length;
        r.bajas = bajas.length;
        r.cambios = cambiados.length;
        r.enviados = quiero.length;
        const est = await api.estado(audienciaId).catch(() => null);
        r.coincidencias = est ? { min: est.min, max: est.max } : null;
        await db.from("meta_audiencias").update({
          miembros: quiero.length,
          coincidencias_min: est?.min ?? null,
          coincidencias_max: est?.max ?? null,
          estado_meta: est ? { operacion: est.operacion, entrega: est.entrega } : null,
          ultima_sync_at: ahora,
          ultimo_error: null,
        }).eq("id", a.id);
      } catch (e) {
        const texto = e instanceof Error ? e.message : String(e);
        r.error = texto;
        errores.push(`${a.nombre}: ${texto}`);
        await db.from("meta_audiencias").update({ ultimo_error: texto.slice(0, 2000) }).eq("id", a.id);
        // Las condiciones sin aceptar o un token malo valen para todas: no se insiste con las demás.
        const em = e as { terminos?: boolean; codigo?: number | null };
        if (em.terminos || em.codigo === 190 || em.codigo === 200 || em.codigo === 10) bloqueo = texto;
      }
    }
    const fallaron = Object.values(resumen).filter((r) => r.error).length;
    return await cerrar(fallaron === 0 ? "ok" : fallaron === Object.keys(resumen).length ? "fallida" : "con_errores");
  } catch (e) {
    errores.push(e instanceof Error ? e.message : String(e));
    return await cerrar("fallida");
  }
}
