import { busquedaPorHost } from "./host";

export type NegocioBasico = {
  id: string;
  slug: string;
  nombre: string;
  dominio: string | null;
  // La dirección con la que el negocio se presenta (https://www.ludogteka.mx),
  // cuando no es simplemente https://<dominio>.
  url_publica?: string | null;
  zona_horaria: string;
  // El ícono de la pestaña: negocios.marca.favicon, o el que se arma con
  // la inicial y el color del negocio (/icono-negocio).
  icono?: string | null;
};

// Los encabezados con los que el middleware le pasa el negocio al resto de
// la petición. El middleware BORRA los que traiga el navegador antes de
// poner los suyos: nadie puede fijar el negocio desde afuera.
export const ENCABEZADOS_NEGOCIO = {
  id: "x-negocio-id",
  slug: "x-negocio-slug",
  nombre: "x-negocio-nombre",
  dominio: "x-negocio-dominio",
  url: "x-negocio-url",
  zona: "x-negocio-zona",
  icono: "x-negocio-icono",
} as const;

// La petición es de la administración de PeluDesk (sin negocio).
export const ENCABEZADO_PLATAFORMA = "x-plataforma";

// Un ícono de la configuración del negocio: una ruta del propio sitio
// (/iconos/…) o una dirección https. Cualquier otra cosa, el generado.
function iconoValido(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (/^\/(?!\/)[\w\-./]+$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v)) return v;
  return null;
}

// Caché por instancia: el dominio de un negocio casi nunca cambia, y el
// middleware corre en cada petición.
const CACHE = new Map<string, { valor: NegocioBasico | null; hasta: number }>();
const VIDA_MS = 60_000;

export async function resolverNegocio(host: string | null): Promise<NegocioBasico | null> {
  const busqueda = busquedaPorHost(host);
  if (!busqueda) return null;
  const llave = `${busqueda.slug ?? ""}|${busqueda.dominio ?? ""}`;
  const guardado = CACHE.get(llave);
  if (guardado && guardado.hasta > Date.now()) return guardado.valor;

  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/negocio_por_host`, {
    method: "POST",
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_slug: busqueda.slug, p_dominio: busqueda.dominio }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!r.ok) throw new Error(`No se pudo resolver el negocio (${r.status})`);
  const filas = (await r.json()) as (NegocioBasico & { marca?: { favicon?: string } | null })[];
  const fila = filas[0] ?? null;
  const valor: NegocioBasico | null = fila
    ? {
        id: fila.id,
        slug: fila.slug,
        nombre: fila.nombre,
        dominio: fila.dominio,
        url_publica: fila.url_publica ?? null,
        zona_horaria: fila.zona_horaria,
        icono: iconoValido(fila.marca?.favicon),
      }
    : null;
  CACHE.set(llave, { valor, hasta: Date.now() + VIDA_MS });
  return valor;
}
