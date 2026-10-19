// Audiencias personalizadas de tipo «lista de clientes» en la cuenta publicitaria de PeluDesk, por la Graph API.
// Sin imports de «@/»: el token, la cuenta, la URL y el fetch llegan inyectados (la tarea los arma con las variables
// del servidor y las pruebas con un doble). El token nunca se escribe en un error ni en un registro.

export const VERSION_GRAPH = "v25.0";
export const GRAPH_URL = "https://graph.facebook.com";
/** Lo que Meta pide declarar: de dónde salieron los datos de la lista («de socios/propios»). */
export const ORIGEN_DATOS = "BOTH_USER_AND_PARTNER_PROVIDED";
export const ESQUEMA = ["PHONE", "EMAIL"] as const;
export const LOTE = 10_000;

export class ErrorMeta extends Error {
  codigo: number | null;
  subcodigo: number | null;
  terminos: boolean;
  constructor(mensaje: string, codigo: number | null = null, subcodigo: number | null = null, terminos = false) {
    super(mensaje);
    this.codigo = codigo;
    this.subcodigo = subcodigo;
    this.terminos = terminos;
  }
}

/** Meta no deja usar listas de clientes sin aceptar sus condiciones: el error se reconoce por su texto. */
export const esDeTerminos = (texto: string, subcodigo: number | null) =>
  /terms|t[ée]rminos|condiciones/i.test(texto) || [1870034, 1870090, 1713092].includes(subcodigo ?? 0);

export type ConfigMeta = { token: string; cuenta: string; url?: string; fetch?: typeof fetch };

export const cuentaAct = (c: string) => (c.trim().startsWith("act_") ? c.trim() : `act_${c.trim()}`);

export function crearApiMeta(cfg: ConfigMeta) {
  const base = `${(cfg.url ?? GRAPH_URL).replace(/\/$/, "")}/${VERSION_GRAPH}`;
  const f = cfg.fetch ?? fetch;

  async function llamar(metodo: "GET" | "POST" | "DELETE", ruta: string, params: Record<string, string> = {}) {
    const cuerpo = new URLSearchParams({ ...params, access_token: cfg.token });
    const url = metodo === "GET" ? `${base}/${ruta}?${cuerpo}` : `${base}/${ruta}`;
    let r: Response;
    try {
      r = await f(url, { method: metodo, body: metodo === "GET" ? undefined : cuerpo, signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      throw new ErrorMeta(`No se pudo hablar con Meta: ${e instanceof Error ? e.message : String(e)}`);
    }
    const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || datos.error) {
      const err = (datos.error ?? {}) as { message?: string; code?: number; error_subcode?: number; error_user_msg?: string; error_user_title?: string };
      const texto = [err.error_user_title, err.error_user_msg, err.message].filter(Boolean).join(" · ") || `HTTP ${r.status}`;
      const sub = err.error_subcode ?? null;
      throw new ErrorMeta(`[${err.code ?? r.status}${sub ? `/${sub}` : ""}] ${texto}`, err.code ?? r.status, sub, esDeTerminos(texto, sub));
    }
    return datos;
  }

  return {
    /** Las audiencias de la cuenta, por nombre (para no duplicar una que ya existe). */
    async listar(): Promise<{ id: string; name: string }[]> {
      const todas: { id: string; name: string }[] = [];
      let despues: string | null = null;
      for (let i = 0; i < 20; i++) {
        const d = await llamar("GET", `${cuentaAct(cfg.cuenta)}/customaudiences`, { fields: "id,name", limit: "200", ...(despues ? { after: despues } : {}) });
        todas.push(...((d.data as { id: string; name: string }[]) ?? []));
        despues = ((d.paging as { cursors?: { after?: string }; next?: string } | undefined)?.next && (d.paging as { cursors?: { after?: string } }).cursors?.after) || null;
        if (!despues) break;
      }
      return todas;
    },
    async crear(nombre: string, descripcion: string): Promise<string> {
      const d = await llamar("POST", `${cuentaAct(cfg.cuenta)}/customaudiences`, {
        name: nombre,
        description: descripcion,
        subtype: "CUSTOM",
        customer_file_source: ORIGEN_DATOS,
      });
      return String(d.id);
    },
    /** Agrega (o quita) filas [hashTelefono, hashCorreo]; vacío = "" (esquema de varias llaves). */
    async usuarios(audiencia: string, filas: [string, string][], quitar = false): Promise<{ recibidos: number; invalidos: number }> {
      let recibidos = 0;
      let invalidos = 0;
      for (let i = 0; i < filas.length; i += LOTE) {
        const d = await llamar(quitar ? "DELETE" : "POST", `${audiencia}/users`, { payload: JSON.stringify({ schema: ESQUEMA, data: filas.slice(i, i + LOTE) }) });
        recibidos += Number(d.num_received ?? 0);
        invalidos += Number(d.num_invalid_entries ?? 0);
      }
      return { recibidos, invalidos };
    },
    async estado(audiencia: string) {
      const d = await llamar("GET", audiencia, { fields: "name,approximate_count_lower_bound,approximate_count_upper_bound,operation_status,delivery_status" });
      const n = (v: unknown) => (typeof v === "number" && v >= 0 ? v : null);
      return {
        min: n(d.approximate_count_lower_bound),
        max: n(d.approximate_count_upper_bound),
        operacion: d.operation_status ?? null,
        entrega: d.delivery_status ?? null,
      };
    },
  };
}

export type ApiMeta = ReturnType<typeof crearApiMeta>;
