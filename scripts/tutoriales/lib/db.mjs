// Conexión del corredor de tutoriales a la base y a Storage.
//
// DESARROLLO (.env.local) es donde se graba y donde vive la cola
// (`tutoriales_progreso`). PRODUCCIÓN solo recibe lo ya terminado: los
// archivos públicos, el catálogo y los masters, con `--prod`; la llave de
// servicio se lee al vuelo del CLI de Supabase y nunca se imprime ni se
// guarda.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const REF_DEV = "sgfolltpvktbsiisfuzq";
const REF_PROD = "xdsxjhytggpsgrmfuuff";

function envLocal() {
  return Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
}

export function conectar(prod = false) {
  if (prod) {
    const keys = JSON.parse(execFileSync("node", ["node_modules/supabase/dist/supabase.js", "projects", "api-keys", "--project-ref", REF_PROD, "-o", "json"], { encoding: "utf8" }));
    const llave = keys.find((k) => k.name === "service_role" && k.type === "legacy")?.api_key;
    if (!llave) throw new Error("No pude leer la llave de servicio de producción.");
    const url = `https://${REF_PROD}.supabase.co`;
    return { prod: true, ref: REF_PROD, url, cliente: createClient(url, llave, { auth: { persistSession: false, autoRefreshToken: false } }) };
  }
  const env = envLocal();
  if (!env.NEXT_PUBLIC_SUPABASE_URL.includes(REF_DEV)) throw new Error(".env.local no apunta a desarrollo.");
  return { prod: false, ref: REF_DEV, url: env.NEXT_PUBLIC_SUPABASE_URL, cliente: createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

export async function rpc(c, fn, args) {
  const { data, error } = await c.cliente.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

/** Sube un archivo local a un bucket (reemplaza si existe). */
export async function subir(c, bucket, ruta, archivo, contentType) {
  const cuerpo = fs.readFileSync(archivo);
  const { error } = await c.cliente.storage.from(bucket).upload(ruta, cuerpo, { contentType, upsert: true, cacheControl: "3600" });
  if (error) throw new Error(`subir ${bucket}/${ruta}: ${error.message}`);
  return cuerpo.length;
}

/** Cuánto ocupa hoy Storage (bytes) y por bucket, según la API de gestión no; con la secret key se suma lo listado. */
export async function usoStorage(c, buckets) {
  let total = 0;
  const porBucket = {};
  for (const b of buckets) {
    let suma = 0;
    const recorrer = async (prefijo) => {
      const { data } = await c.cliente.storage.from(b).list(prefijo, { limit: 1000 });
      for (const e of data ?? []) {
        if (e.id) suma += e.metadata?.size ?? 0;
        else await recorrer(prefijo ? `${prefijo}/${e.name}` : e.name);
      }
    };
    await recorrer("");
    porBucket[b] = suma;
    total += suma;
  }
  return { total, porBucket };
}
