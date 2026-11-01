/**
 * Leer la cartilla de papel con una foto (app para dueños, Fase 1). La IA (Claude, con la imagen) devuelve, por una
 * herramienta obligatoria, las vacunas y desparasitaciones que alcanza a leer: nombre, fecha de aplicación, próxima
 * dosis, lote y laboratorio, cada una con qué tan segura está. El dueño CONFIRMA antes de que nada quede en su
 * cartilla; aquí solo se lee. Se mide el tiempo y los tokens de cada lectura (mascotas_cartilla_fotos).
 */
export type RegistroLeido = {
  tipo: "vacuna" | "desparasitacion";
  nombre: string;
  subtipo?: "interna" | "externa" | "ambas" | null;
  fecha_aplicacion?: string | null; // AAAA-MM-DD
  proxima_dosis?: string | null;
  lote?: string | null;
  laboratorio?: string | null;
  confianza: number; // 0–1
};
export type LecturaCartilla = {
  es_cartilla: boolean;
  nombre_mascota?: string | null;
  especie?: "perro" | "gato" | "otro" | null;
  registros: RegistroLeido[];
  peso_kg?: number | null;
  observaciones?: string | null;
};
export type ResultadoLectura = { lectura: LecturaCartilla; ms: number; tokensIn: number; tokensOut: number; modelo: string };

export const MODELO_CARTILLA = "claude-sonnet-5";
const TOPE_MS = 55_000;

const HERRAMIENTA = {
  name: "registrar_cartilla",
  description: "Lo que se alcanza a leer en la foto de una cartilla de vacunación de una mascota (perro o gato), en México.",
  input_schema: {
    type: "object",
    properties: {
      es_cartilla: { type: "boolean", description: "true si la foto es una cartilla, carnet o certificado de vacunación/desparasitación; false si es otra cosa." },
      nombre_mascota: { type: ["string", "null"], description: "El nombre de la mascota, si aparece." },
      especie: { type: ["string", "null"], enum: ["perro", "gato", "otro", null] },
      peso_kg: { type: ["number", "null"], description: "El último peso anotado, en kg, si aparece." },
      registros: {
        type: "array",
        description: "Cada aplicación de vacuna o desparasitación que se lea (una fila o una etiqueta pegada = un registro). Solo lo que de verdad se ve.",
        items: {
          type: "object",
          properties: {
            tipo: { type: "string", enum: ["vacuna", "desparasitacion"] },
            nombre: { type: "string", description: "El biológico o producto tal como se lee (p. ej. «Antirrábica», «Séxtuple», «Nobivac DHPPi», «Bravecto», «Drontal»). Sin inventar." },
            subtipo: { type: ["string", "null"], enum: ["interna", "externa", "ambas", null], description: "Solo en desparasitación, si se distingue." },
            fecha_aplicacion: { type: ["string", "null"], description: "AAAA-MM-DD. Si solo hay mes y año, usa el día 01. Si no hay año, null." },
            proxima_dosis: { type: ["string", "null"], description: "AAAA-MM-DD de la próxima dosis o refuerzo, si está anotada. No la calcules: solo si se lee." },
            lote: { type: ["string", "null"] },
            laboratorio: { type: ["string", "null"] },
            confianza: { type: "number", minimum: 0, maximum: 1, description: "Qué tan segura es la lectura de ESTE registro (letra, fecha legible). 1 = clarísimo." },
          },
          required: ["tipo", "nombre", "confianza"],
        },
      },
      observaciones: { type: ["string", "null"], description: "Algo que el dueño deba revisar (una fecha borrosa, una etiqueta tapada). Una frase, en español de México." },
    },
    required: ["es_cartilla", "registros"],
  },
};

const SISTEMA = `Lees cartillas de vacunación de mascotas en México (perros y gatos) a partir de una foto. Devuelves SOLO lo que se lee en la imagen, con la herramienta registrar_cartilla.
Reglas:
- Una fila de la tabla o una etiqueta pegada del biológico es un registro. Si una etiqueta trae el nombre comercial (Nobivac, Vanguard, Eurican, Defensor, Bravecto, Drontal, NexGard…), ponlo en «nombre»; si además se lee qué protege (p. ej. «Séxtuple», «Antirrábica», «Triple felina»), agrégalo entre paréntesis.
- Las fechas en México van día/mes/año: 05/03/24 es el 5 de marzo de 2024. Devuélvelas como AAAA-MM-DD. Si un año tiene dos dígitos, es 20AA.
- «Próxima dosis» o «refuerzo» solo si está escrita; no la calcules.
- Sellos y firmas no son registros. Un peso anotado va en peso_kg.
- Si la foto no es una cartilla (otra cosa, borrosa o vacía), es_cartilla = false y registros = [].
- Nunca inventes: lo que no se lea, va en null, y baja la confianza.`;

function urlAnthropic(): string {
  const sust = process.env.VERCEL_ENV !== "production" ? process.env.ANTHROPIC_API_URL?.trim().replace(/\/$/, "") : null;
  return sust || "https://api.anthropic.com";
}

export function hayIA(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function leerCartillaConIA(o: { imagen: Buffer; mediaType: "image/jpeg" | "image/png" | "image/webp"; especie?: string | null; nombre?: string | null }): Promise<ResultadoLectura> {
  const llave = process.env.ANTHROPIC_API_KEY ?? "";
  if (!llave) throw new Error("La lectura por IA no está configurada en este entorno.");
  const inicio = Date.now();
  const contexto = `La mascota se llama ${o.nombre?.trim() || "(sin nombre)"}${o.especie ? ` y es ${o.especie === "gato" ? "gato" : o.especie === "perro" ? "perro" : "otra especie"}` : ""}. Lee la cartilla de la foto.`;
  const r = await fetch(`${urlAnthropic()}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": llave, "anthropic-version": "2023-06-01", ...(process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : {}) },
    body: JSON.stringify({
      model: MODELO_CARTILLA,
      max_tokens: 2500,
      system: SISTEMA,
      tools: [HERRAMIENTA],
      tool_choice: { type: "tool", name: HERRAMIENTA.name },
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: o.mediaType, data: o.imagen.toString("base64") } }, { type: "text", text: contexto }] }],
    }),
    signal: AbortSignal.timeout(TOPE_MS),
  });
  const j = (await r.json().catch(() => ({}))) as { content?: { type: string; name?: string; input?: unknown }[]; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } };
  if (!r.ok) throw new Error(`La IA no pudo leer la foto (${r.status}): ${j.error?.message ?? ""}`.slice(0, 300));
  const uso = j.content?.find((c) => c.type === "tool_use" && c.name === HERRAMIENTA.name);
  const lectura = normalizar((uso?.input ?? {}) as Partial<LecturaCartilla>);
  return { lectura, ms: Date.now() - inicio, tokensIn: Number(j.usage?.input_tokens ?? 0), tokensOut: Number(j.usage?.output_tokens ?? 0), modelo: MODELO_CARTILLA };
}

const fecha = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() < 1990 || d.getFullYear() > 2100) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
};
const texto = (v: unknown, max = 80): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function normalizar(e: Partial<LecturaCartilla>): LecturaCartilla {
  const registros: RegistroLeido[] = [];
  for (const r of Array.isArray(e.registros) ? e.registros : []) {
    const nombre = texto((r as RegistroLeido).nombre);
    if (!nombre) continue;
    const tipo = (r as RegistroLeido).tipo === "desparasitacion" ? "desparasitacion" : "vacuna";
    const sub = (r as RegistroLeido).subtipo;
    registros.push({
      tipo,
      nombre,
      subtipo: tipo === "desparasitacion" && (sub === "interna" || sub === "externa" || sub === "ambas") ? sub : null,
      fecha_aplicacion: fecha((r as RegistroLeido).fecha_aplicacion),
      proxima_dosis: fecha((r as RegistroLeido).proxima_dosis),
      lote: texto((r as RegistroLeido).lote, 40),
      laboratorio: texto((r as RegistroLeido).laboratorio, 60),
      confianza: Math.max(0, Math.min(1, Number((r as RegistroLeido).confianza ?? 0.5) || 0.5)),
    });
  }
  const peso = typeof e.peso_kg === "number" && e.peso_kg > 0 && e.peso_kg < 200 ? Math.round(e.peso_kg * 100) / 100 : null;
  return {
    es_cartilla: e.es_cartilla !== false && (e.es_cartilla === true || registros.length > 0),
    nombre_mascota: texto(e.nombre_mascota, 60),
    especie: e.especie === "perro" || e.especie === "gato" || e.especie === "otro" ? e.especie : null,
    registros: registros.slice(0, 40),
    peso_kg: peso,
    observaciones: texto(e.observaciones, 300),
  };
}
