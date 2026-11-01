/**
 * Cuántas consultas a la base hace cada pantalla (tiempo del panel, 31 de octubre de 2026). Solo con
 * `PELUDESK_MEDIR=1` (la app compilada en desarrollo para la auditoría `tiempo-panel-dev.mjs`); en producción no existe.
 *
 * La auditoría pide la página con el encabezado `x-peludesk-medir: <id>`; el cliente de Supabase del servidor
 * (`createSupabaseServerClient`) envuelve su `fetch` y anota cada petición a la base bajo ese id; después la auditoría
 * lee `GET /api/medir?id=<id>`. Vive en memoria del proceso (`next start` es un solo proceso); lo de más de 10 minutos
 * se tira. Lo que pide el middleware no se cuenta (corre aparte): son dos viajes fijos (Auth y `acceso_de_sesion`).
 */
export const ENCABEZADO_MEDIR = "x-peludesk-medir";

type Consulta = { que: string; ms: number };
type Registro = { desde: number; consultas: Consulta[] };

// En `globalThis`, no en el módulo: la build de producción carga este módulo por separado para las páginas y para la
// ruta /api/medir, y con un `Map` del módulo la ruta no veía lo que anotaron las páginas (1 de noviembre de 2026).
const global = globalThis as typeof globalThis & { __peludeskMedir?: Map<string, Registro> };
const registros: Map<string, Registro> = (global.__peludeskMedir ??= new Map<string, Registro>());
const VIDA_MS = 10 * 60_000;
const TOPE_IDS = 500;

export function medirActivo(): boolean {
  return process.env.PELUDESK_MEDIR === "1";
}

/** Qué se pidió, sin la consulta completa: `rest:tabla`, `rpc:funcion`, `auth:user`, `storage:…`. */
function resumirUrl(entrada: RequestInfo | URL): string {
  const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  const m = url.match(/\/(rest|auth|storage)\/v1\/(rpc\/)?([^/?]+)/);
  if (!m) return "otro";
  if (m[1] === "rest") return `${m[2] ? "rpc" : "rest"}:${m[3]}`;
  return `${m[1]}:${m[3]}`;
}

function anotar(id: string, que: string, ms: number) {
  let r = registros.get(id);
  if (!r) {
    if (registros.size >= TOPE_IDS) {
      const ahora = Date.now();
      for (const [k, v] of registros) if (ahora - v.desde > VIDA_MS || registros.size >= TOPE_IDS) registros.delete(k);
    }
    r = { desde: Date.now(), consultas: [] };
    registros.set(id, r);
  }
  r.consultas.push({ que, ms: Math.round(ms) });
}

/** Un `fetch` que anota cada llamada bajo `id` (para `global.fetch` del cliente de Supabase). */
export function fetchMedido(id: string): typeof fetch {
  return async (entrada, init) => {
    const t0 = performance.now();
    try {
      return await fetch(entrada, init);
    } finally {
      anotar(id, resumirUrl(entrada), performance.now() - t0);
    }
  };
}

/** Lo anotado bajo un id (null si no hay nada o la medición está apagada). */
export function consultasDe(id: string): { total: number; ms: number; consultas: Consulta[]; porTipo: Record<string, number> } | null {
  const r = registros.get(id);
  if (!r) return null;
  const porTipo: Record<string, number> = {};
  for (const c of r.consultas) porTipo[c.que] = (porTipo[c.que] ?? 0) + 1;
  return { total: r.consultas.length, ms: r.consultas.reduce((a, c) => a + c.ms, 0), consultas: r.consultas, porTipo };
}
