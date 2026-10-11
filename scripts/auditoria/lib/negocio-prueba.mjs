// Qué negocio de prueba usa una auditoría (SOLO DESARROLLO).
//
// Dos carriles trabajan sobre la misma base de desarrollo y sus auditorías escriben a la vez:
//   · carril A (la nube): Huellitas (`huellitas`);
//   · carril B (la PC):   Patitas Pruebas B (`patitas-pruebas-b`), sembrado con
//                         `node scripts/plataforma/sembrar-pruebas-b.mjs`.
// Orden de elección: `--negocio <slug>` (o `--negocio=<slug>`), luego la variable AUDITORIA_NEGOCIO_SLUG,
// y si no, el carril: en la nube (CLAUDE_CODE_REMOTE=true) Huellitas; en la PC, patitas-pruebas-b.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SLUG_CARRIL_A = "huellitas";
export const SLUG_CARRIL_B = "patitas-pruebas-b";

/** Valor de un argumento `--nombre valor` o `--nombre=valor`; undefined si no viene. */
export function argumento(nombre, argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${nombre}`) return argv[i + 1];
    if (argv[i].startsWith(`--${nombre}=`)) return argv[i].slice(nombre.length + 3);
  }
  return undefined;
}

export const esNube = () => process.env.CLAUDE_CODE_REMOTE === "true";

/** Slug del negocio de prueba que usa esta corrida. `nombre` es el argumento (por omisión `negocio`). */
export function slugDePrueba(nombre = "negocio") {
  const dado = argumento(nombre) ?? (nombre === "negocio" ? process.env.AUDITORIA_NEGOCIO_SLUG : undefined);
  if (dado) return String(dado).trim().toLowerCase();
  return esNube() ? SLUG_CARRIL_A : SLUG_CARRIL_B;
}

/** Archivo con los ids que deja negocio-prueba-dev.mjs (el de Huellitas conserva su nombre de siempre). */
export const archivoDatos = (slug) =>
  path.join(os.tmpdir(), slug === SLUG_CARRIL_A ? "peludesk-negocio-b.json" : `peludesk-negocio-${slug}.json`);

export function datosDelNegocio(slug) {
  const archivo = archivoDatos(slug);
  if (!fs.existsSync(archivo)) {
    const como = slug === SLUG_CARRIL_B ? "node scripts/plataforma/sembrar-pruebas-b.mjs" : `node scripts/auditoria/negocio-prueba-dev.mjs --slug ${slug}`;
    throw new Error(`Faltan los datos del negocio de prueba «${slug}» (${archivo}). Sémbralo con: ${como}`);
  }
  return JSON.parse(fs.readFileSync(archivo, "utf8"));
}

/** Host de desarrollo del negocio: `<slug>.localhost`. */
export const hostDe = (slug) => `${slug}.localhost`;

/** Fila del negocio (id, nombre) por slug, con el cliente `A` de sesiones-dev; falla con un mensaje claro. */
export async function negocioPorSlug(A, slug) {
  const { data, error } = await A.from("negocios").select("id, nombre, slug").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`negocio ${slug}: ${error.message}`);
  if (!data) {
    const como = slug === SLUG_CARRIL_B ? "node scripts/plataforma/sembrar-pruebas-b.mjs" : `node scripts/auditoria/negocio-prueba-dev.mjs --slug ${slug}`;
    throw new Error(`No existe el negocio de prueba «${slug}». Sémbralo con: ${como}`);
  }
  return data;
}

/** Marca de texto que lleva TODO lo sembrado en un negocio de prueba (para que `entre-negocios` lo encuentre si se filtra). */
export const marcaDe = (slug) => (slug === SLUG_CARRIL_A ? "ZZSECRETOB" : `ZZSECRETO${slug.replace(/[^a-z0-9]/g, "").toUpperCase()}`);
