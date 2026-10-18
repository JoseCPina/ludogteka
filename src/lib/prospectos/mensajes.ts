// Los mensajes de «Contactar hoy»: cortos, como los escribiría una persona, distintos por giro y canal, con el
// nombre del negocio, una cosa concreta que les resuelve PeluDesk y el link a su página. Los redacta la IA en lotes
// (para que no se repitan entre sí); si la IA falla, salen de plantillas variadas. Sin imports de valores.

import type { LlamarIA } from "./ia";

export type TipoMensaje = "primero" | "seguimiento_1" | "seguimiento_2";
export type ParaMensaje = {
  id: string;
  nombre: string;
  giro: string;
  ciudad: string;
  canal: "whatsapp" | "instagram";
  tipo: TipoMensaje;
  link: string;
  calificacion: number | null;
  resenas: number | null;
  mensajeAnterior?: string | null;
};

// Solo lo que PeluDesk hace (si cambia una función, se cambia aquí y en src/lib/whatsapp/conocimiento.ts).
export const LO_QUE_RESUELVE: Record<string, string[]> = {
  guarderia: [
    "el registro de entradas y salidas con el carnet de vacunas revisado en el check-in",
    "los pases y mensualidades: cuántos días le quedan a cada perro sin llevar la cuenta a mano",
    "el reporte del día con fotos que le mandas al dueño por WhatsApp",
    "los contratos firmados en el celular del dueño",
  ],
  hotel: [
    "las reservas por noche con el cupo de toda la casa, sin empalmar",
    "el check-in y check-out con pertenencias, vacunas y quién recoge al perro",
    "el cobro de la estancia y el corte de caja del día",
    "las fotos y videos del perro que le mandas al dueño mientras está hospedado",
  ],
  estetica: [
    "la agenda por estilista, sin citas empalmadas",
    "los precios por raza, talla y tipo de pelo ya calculados al agendar",
    "el cobro y el corte de caja sin cuentas a mano",
    "la ficha de cada perro con su historial de servicios",
  ],
  veterinaria: [
    "el expediente de cada paciente con sus consultas y vacunas",
    "el carnet de vacunas con QR y el recordatorio de la próxima dosis",
    "las recetas y el inventario de medicamentos por lote",
    "la agenda por médico y el cobro de la consulta en caja",
  ],
  mixto: [
    "guardería, hotel y estética en un solo sistema, con la caja de todo junta",
    "las reservas, el check-in con vacunas y el cobro en el mismo lugar",
    "el portal donde cada dueño ve las citas y reservas de su perro",
  ],
};

const HERRAMIENTA = {
  name: "mensajes",
  description: "Devuelve un mensaje por cada prospecto, uno por id.",
  input_schema: {
    type: "object",
    properties: { mensajes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, texto: { type: "string" } }, required: ["id", "texto"] } } },
    required: ["mensajes"],
  },
};

export function sistemaMensajes(firma: string) {
  return `Escribes mensajes en frío de ${firma}, de PeluDesk (un sistema mexicano para guarderías, hoteles, estéticas caninas y veterinarias), a dueños de esos negocios. Los manda ${firma} a mano, uno por uno, por WhatsApp o por mensaje directo de Instagram.

Reglas:
- Español de México, de tú, como lo escribiría una persona: natural, cálido, directo. Nada de publicidad, mayúsculas, signos de exclamación seguidos, «estimado», «oferta», «promoción», «increíble», «revolucionario» ni listas.
- Corto: WhatsApp de 2 a 4 renglones (máximo 330 caracteres sin contar el link); Instagram máximo 280 caracteres sin el link.
- Menciona el nombre del negocio tal como viene (puedes simplificarlo si es muy largo) y UNA sola cosa concreta que PeluDesk les resuelve, escogida de la lista que viene con cada negocio. No inventes nada más del negocio ni de PeluDesk; no digas precios. Si tiene 4.5 o más con 20 reseñas o más, puedes mencionar que tienen muy buenas reseñas.
- Di que les armaste una vista previa de cómo se vería su negocio en PeluDesk y pon el link EXACTO que viene, una sola vez, al final o en su propio renglón.
- Puedes decir que se prueba 15 días gratis sin tarjeta, pero no en todos.
- Varía: cada mensaje debe empezar distinto y estar redactado distinto de los demás del lote (saludos, orden, palabras). No uses la misma frase dos veces en el lote. Alterna la entrada: unos empiezan por su negocio, otros con una pregunta corta, otros presentándote; no más de dos del lote empiezan con «Hola, soy ${firma}» o parecido. Firma como ${firma} solo a veces, y nunca con cargo.
- Que se entienda qué es PeluDesk (un sistema para su negocio) aunque no lo conozcan.
- Seguimiento 1 (no contestó al primero): una línea o dos, sin repetir el primero, con otro ángulo (otra cosa que les resuelve) y el link otra vez.
- Seguimiento 2 (último): muy breve y amable, deja la puerta abierta sin presionar («si no es buen momento, no pasa nada»), con el link.
- Máximo un emoji, y no en todos.`;
}

export async function redactarLote(lista: ParaMensaje[], llamar: LlamarIA, firma: string, modelo?: string): Promise<Map<string, string>> {
  const r = new Map<string, string>();
  if (lista.length === 0) return r;
  const usuario = lista
    .map((p, i) =>
      [
        `id: ${p.id}`,
        `negocio: ${p.nombre} (${p.giro === "mixto" ? "varios servicios" : p.giro}, ${p.ciudad})`,
        `canal: ${p.canal === "whatsapp" ? "WhatsApp" : "Instagram"}`,
        `tipo: ${p.tipo === "primero" ? "primer mensaje" : p.tipo === "seguimiento_1" ? "seguimiento 1" : "seguimiento 2 (último)"}`,
        p.calificacion != null ? `Google: ${p.calificacion} con ${p.resenas ?? 0} reseñas` : null,
        `qué le resuelve PeluDesk (escoge una, de preferencia la número ${(i % (LO_QUE_RESUELVE[p.giro] ?? LO_QUE_RESUELVE.mixto).length) + 1}): ${(LO_QUE_RESUELVE[p.giro] ?? LO_QUE_RESUELVE.mixto).map((x, k) => `${k + 1}) ${x}`).join("; ")}`,
        p.mensajeAnterior ? `lo que ya se le mandó: ${p.mensajeAnterior.replace(/\s+/g, " ").slice(0, 400)}` : null,
        `link: ${p.link}`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
  const res = (await llamar({ sistema: sistemaMensajes(firma), usuario: `Escribe un mensaje para cada uno de estos ${lista.length}:\n\n${usuario}`, herramienta: HERRAMIENTA, modelo, maxTokens: 300 + lista.length * 220 })) as {
    mensajes?: { id?: string; texto?: string }[];
  };
  for (const m of res.mensajes ?? []) {
    const p = lista.find((x) => x.id === m.id);
    const texto = (m.texto ?? "").trim();
    // El link tiene que ir tal cual; si la IA lo cambió o lo quitó, ese mensaje sale de plantilla.
    if (p && texto && texto.includes(p.link) && texto.length <= 900) r.set(p.id, texto);
  }
  return r;
}

// ── Plantillas de respaldo (variadas por prospecto) ───────────────────────────────────────────────────────────────

const hash = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const escoge = <T>(lista: T[], semilla: string, sal = 0) => lista[(hash(semilla) + sal) % lista.length];

export function mensajeDePlantilla(p: ParaMensaje, firma: string): string {
  const cosas = LO_QUE_RESUELVE[p.giro] ?? LO_QUE_RESUELVE.mixto;
  const cosa = escoge(cosas, p.id);
  const otra = escoge(cosas, p.id, 1);
  const n = p.nombre;
  if (p.tipo === "seguimiento_1") {
    return escoge(
      [
        `Hola de nuevo, ${n}. Por si se perdió mi mensaje: PeluDesk también les resuelve ${otra}. Su vista previa sigue aquí: ${p.link}`,
        `¿Pudieron ver la vista previa de ${n}? Algo que les puede servir mucho es ${otra}. ${p.link}`,
        `Te escribo otra vez por ${n}. Además de lo que te conté, PeluDesk lleva ${otra}. Échale un ojo: ${p.link}`,
      ],
      p.id
    );
  }
  if (p.tipo === "seguimiento_2") {
    return escoge(
      [
        `Última vez que te molesto, lo prometo. Si en algún momento quieren probar PeluDesk en ${n}, aquí queda su vista previa: ${p.link}`,
        `Si no es buen momento, no pasa nada. La vista previa de ${n} se queda aquí por si la quieren ver después: ${p.link}`,
        `Solo para cerrar: si les interesa, se prueba 15 días gratis sin tarjeta. ${p.link} Un saludo, ${firma}`,
      ],
      p.id
    );
  }
  const saludo = escoge([`Hola, ${n}`, `Qué tal, equipo de ${n}`, `Buen día, ${n}`, `Hola, ¿qué tal? Les escribo a ${n}`], p.id);
  const cuerpo = escoge(
    [
      `Soy ${firma}, de PeluDesk. Hacemos un sistema para negocios como el suyo que les lleva ${cosa}.`,
      `Les escribe ${firma} de PeluDesk: es un sistema que les ayuda con ${cosa}.`,
      `Me llamo ${firma} y trabajo en PeluDesk, un sistema que se encarga de ${cosa}.`,
    ],
    p.id,
    2
  );
  const cierre = escoge(
    [`Les armé una vista previa de cómo se vería ${n} en PeluDesk:`, `Les preparé cómo se vería su negocio en PeluDesk, por si lo quieren ver:`, `Armé una vista previa con sus datos:`],
    p.id,
    3
  );
  return p.canal === "instagram" ? `${saludo} 👋 ${cuerpo} ${cierre} ${p.link}` : `${saludo}. ${cuerpo}\n\n${cierre}\n${p.link}`;
}
