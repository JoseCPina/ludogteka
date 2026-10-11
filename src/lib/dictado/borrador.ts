// De la transcripción de un dictado a un BORRADOR del SOAP, con Claude.
//
// Reglas que no se rompen: el borrador solo dice lo que el médico dijo (nada inventado: ni datos
// ni dosis ni diagnósticos), los diagnósticos salen SOLO del catálogo del negocio y de la
// plataforma (el modelo escoge nombres exactos de una lista y el servidor los valida), y nada se
// firma: el médico lo revisa, lo corrige y firma como siempre.
import { Anthropic, configWhatsApp } from "@/lib/whatsapp/infra";
import { MODELO_IA } from "@/lib/whatsapp/agente";
import type { BorradorSoap } from "./tipos";

export type NombreDiagnostico = { id: string; origen: "catalogo" | "negocio"; nombre: string };

const HERRAMIENTA = "borrador_soap";
const texto = { type: ["string", "null"], description: "Texto clínico conciso, en español de México. null si no se dijo nada de esto." } as const;
const numero = (descripcion: string) => ({ type: ["number", "null"], description: descripcion }) as const;

const SCHEMA = {
  type: "object",
  properties: {
    motivo: texto,
    anamnesis: texto,
    examen_fisico: texto,
    hallazgos: texto,
    plan: texto,
    tratamiento: { type: ["string", "null"], description: "Medicamentos, dosis, vía y duración EXACTAMENTE como se dictaron. null si no se dictó tratamiento." },
    peso_kg: numero("Peso en kg, solo si se dijo con número."),
    temperatura_c: numero("Temperatura en °C, solo si se dijo con número."),
    frecuencia_cardiaca: numero("Latidos por minuto, solo si se dijo con número."),
    frecuencia_respiratoria: numero("Respiraciones por minuto, solo si se dijo con número."),
    condicion_corporal: numero("Condición corporal de 1 a 9, solo si se dijo."),
    tllc_seg: numero("Tiempo de llenado capilar en segundos, solo si se dijo."),
    mucosas: texto,
    hidratacion: texto,
    diagnosticos: {
      type: "array",
      description: "Diagnósticos que el médico mencionó. 'nombre' debe ser IDÉNTICO a uno de la lista del catálogo.",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          tipo: { type: "string", enum: ["presuntivo", "definitivo"], description: "presuntivo salvo que el médico lo dé por confirmado." },
          nota: { type: ["string", "null"] },
        },
        required: ["nombre", "tipo"],
      },
    },
    diagnosticos_fuera_del_catalogo: {
      type: "array",
      items: { type: "string" },
      description: "Diagnósticos que el médico mencionó y NO aparecen en la lista del catálogo, tal como los dijo.",
    },
  },
  required: ["diagnosticos"],
} as const;

const SISTEMA = `Eres un asistente de redacción para un médico veterinario en México. Recibes la TRANSCRIPCIÓN de lo que el médico dictó durante una consulta y la conviertes en un borrador de nota clínica en formato SOAP, llamando a la herramienta "${HERRAMIENTA}".

Reglas:
- Usa SOLO lo que el médico dijo. No inventes datos, valores, dosis, diagnósticos ni antecedentes. Si algo no se dijo, déjalo en null.
- Redacta en español de México, tono clínico, conciso, en frases completas. Corrige muletillas y errores evidentes de transcripción, sin cambiar el sentido.
- Reparte el contenido: motivo y anamnesis (lo que cuenta el dueño), examen físico y hallazgos (lo que el médico encuentra), plan y tratamiento (lo que indica).
- El tratamiento va tal cual se dictó: medicamento, dosis, vía, frecuencia y duración. No corrijas ni completes dosis.
- Los números (peso, temperatura, frecuencias, etc.) solo si el médico los dijo con cifra.
- Diagnósticos: escoge SOLO nombres que existan en la lista del catálogo y cópialos idénticos. Si el médico mencionó uno que no está en la lista, ponlo en "diagnosticos_fuera_del_catalogo". "presuntivo" salvo que lo dé por confirmado.
- No des consejos, no agregues recomendaciones ni advertencias propias.
- Si la transcripción está vacía o no es una consulta, devuelve todo en null.`;

function limpiarTexto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 4000) : null;
}
function limpiarNumero(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Valida lo que contestó el modelo: solo campos conocidos, números en rango, diagnósticos del catálogo. */
export function validarBorrador(crudo: Record<string, unknown>, catalogo: NombreDiagnostico[]): BorradorSoap {
  const porNombre = new Map(catalogo.map((d) => [normal(d.nombre), d]));
  const diagnosticos: BorradorSoap["diagnosticos"] = [];
  const sinCatalogo: string[] = Array.isArray(crudo.diagnosticos_fuera_del_catalogo)
    ? (crudo.diagnosticos_fuera_del_catalogo as unknown[]).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim().slice(0, 120))
    : [];
  for (const d of Array.isArray(crudo.diagnosticos) ? (crudo.diagnosticos as Record<string, unknown>[]) : []) {
    const nombre = typeof d?.nombre === "string" ? d.nombre : "";
    const hallado = porNombre.get(normal(nombre));
    if (!hallado) {
      if (nombre.trim()) sinCatalogo.push(nombre.trim().slice(0, 120));
      continue;
    }
    if (diagnosticos.some((x) => x.ref_id === hallado.id)) continue;
    diagnosticos.push({
      ref_id: hallado.id,
      origen: hallado.origen,
      nombre: hallado.nombre,
      tipo: d.tipo === "definitivo" ? "definitivo" : "presuntivo",
      nota: limpiarTexto(d.nota) ?? "",
    });
  }
  return {
    motivo: limpiarTexto(crudo.motivo),
    anamnesis: limpiarTexto(crudo.anamnesis),
    examen_fisico: limpiarTexto(crudo.examen_fisico),
    hallazgos: limpiarTexto(crudo.hallazgos),
    plan: limpiarTexto(crudo.plan),
    tratamiento: limpiarTexto(crudo.tratamiento),
    peso_kg: limpiarNumero(crudo.peso_kg, 0.05, 250),
    temperatura_c: limpiarNumero(crudo.temperatura_c, 30, 45),
    frecuencia_cardiaca: limpiarNumero(crudo.frecuencia_cardiaca, 10, 400),
    frecuencia_respiratoria: limpiarNumero(crudo.frecuencia_respiratoria, 2, 200),
    condicion_corporal: limpiarNumero(crudo.condicion_corporal, 1, 9),
    tllc_seg: limpiarNumero(crudo.tllc_seg, 0, 20),
    mucosas: limpiarTexto(crudo.mucosas),
    hidratacion: limpiarTexto(crudo.hidratacion),
    diagnosticos,
    sin_catalogo: [...new Set(sinCatalogo)],
  };
}

export class ErrorBorrador extends Error {}

export async function armarBorrador(opciones: {
  transcripcion: string;
  mascota: { nombre: string; especie: string | null };
  catalogo: NombreDiagnostico[];
}): Promise<{ borrador: BorradorSoap; modelo: string }> {
  const cfg = configWhatsApp();
  if (!cfg.anthropic) throw new ErrorBorrador("El borrador con IA todavía no está configurado en PeluDesk.");
  const ia = new Anthropic(cfg.anthropic, cfg.anthropicWorkspace);
  const lista = opciones.catalogo.map((d) => d.nombre).join(" | ");
  const mensajes = [
    {
      role: "user",
      content:
        `Mascota: ${opciones.mascota.nombre} (${opciones.mascota.especie ?? "perro"}).\n\n` +
        `CATÁLOGO DE DIAGNÓSTICOS (separados por " | "):\n${lista || "(vacío)"}\n\n` +
        `TRANSCRIPCIÓN DEL DICTADO:\n"""\n${opciones.transcripcion.slice(0, 24_000)}\n"""`,
    },
  ];
  const herramienta = { name: HERRAMIENTA, description: "Entrega el borrador SOAP de la consulta.", input_schema: SCHEMA };
  let r;
  try {
    r = await ia.responder(SISTEMA, mensajes, [herramienta], 3000);
  } catch (e) {
    console.error("[dictado] la IA no contestó", e instanceof Error ? e.message : e);
    throw new ErrorBorrador("No pudimos armar el borrador con IA. La transcripción sí quedó: puedes copiarla al expediente.");
  }
  const uso = r.usos.find((u) => u.nombre === HERRAMIENTA);
  if (!uso) throw new ErrorBorrador("La IA no armó el borrador. La transcripción sí quedó: puedes copiarla al expediente.");
  return { borrador: validarBorrador(uso.entrada as Record<string, unknown>, opciones.catalogo), modelo: MODELO_IA };
}
