import type { ClaveModulo } from "@/lib/plan/modulos";

/**
 * Políticas y reglas del negocio que se le dicen al dueño: en el alta por
 * link, en el complemento y en su portal.
 *
 * Nada de esto vive en el código para un negocio en particular: cada
 * negocio escribe lo suyo en Administración → Políticas y reglas
 * (`negocio_politicas.textos`, una clave por regla) y lo que no escribe
 * sale con el texto por omisión de aquí, que es NEUTRO: solo afirma lo que
 * la app hace igual para todos (la evaluación de comportamiento y el
 * bloqueo por celo o gestación los aplica la base a cualquier negocio) o
 * cómo se agenda (por WhatsApp, porque el portal no agenda). Una regla
 * propia de un negocio (perros agresivos, qué pasa después del cierre,
 * cancelaciones) va vacía por omisión y no se muestra.
 *
 * Cada regla dice con qué módulos tiene sentido: sin hotel no se habla de
 * la noche de hotel, sin guardería no se da el horario de guardería, sin
 * estética no sale lo de estética. Lo que decide el catálogo de vacunas y
 * el horario NO está aquí: sale de `tipos_requisito_sanitario` y de
 * `horario_semana`, como siempre.
 */
export type ClavePolitica =
  | "evaluacion"
  | "celo_gestantes"
  | "agresivos"
  | "despues_del_cierre"
  | "como_reservar"
  | "como_agendar_estetica"
  | "cancelaciones"
  | "recoleccion";

export type Politica = {
  clave: ClavePolitica;
  etiqueta: string;
  ayuda: string;
  /** Se muestra si el negocio tiene prendido ALGUNO de estos (vacío: siempre). */
  alguno?: ClaveModulo[];
  /** …y TODOS estos. */
  todos?: ClaveModulo[];
  /** Texto por omisión (neutro). Vacío: no se muestra hasta que el negocio escriba el suyo. */
  omision: string;
};

export const CATALOGO_POLITICAS: Politica[] = [
  {
    clave: "evaluacion",
    etiqueta: "Evaluación de comportamiento",
    ayuda: "La app no deja reservar guardería ni hotel a un perro sin evaluación registrada (un admin puede autorizar una excepción). Aquí dices cómo la haces.",
    alguno: ["guarderia", "hotel"],
    omision: "Antes de su primera estancia le hacemos una evaluación de comportamiento.",
  },
  {
    clave: "celo_gestantes",
    etiqueta: "Perras en celo o gestantes",
    ayuda: "La app no deja reservar guardería ni hotel a una perra marcada en celo o gestante. Aquí se lo dices al dueño.",
    alguno: ["guarderia", "hotel"],
    omision: "No recibimos perras en celo ni gestantes mientras dure esa etapa.",
  },
  {
    clave: "agresivos",
    etiqueta: "Perros agresivos o con alertas",
    ayuda: "Tu regla sobre perros agresivos o con alguna condición que no recibes. Vacío: no se menciona.",
    alguno: ["guarderia", "hotel"],
    omision: "",
  },
  {
    clave: "despues_del_cierre",
    etiqueta: "Si el perro sigue después del cierre de guardería",
    ayuda: "Qué pasa cuando no recogen al perro antes de que cierre la guardería (por ejemplo, que se queda a dormir y se cobra como noche de hotel). Solo se muestra con guardería y hotel prendidos, junto al horario.",
    todos: ["guarderia", "hotel"],
    omision: "",
  },
  {
    clave: "como_reservar",
    etiqueta: "Cómo se reserva guardería u hotel",
    ayuda: "El portal del dueño no reserva ni cancela: aquí le dices cómo hacerlo.",
    alguno: ["guarderia", "hotel"],
    omision: "Para reservar, cambiar o cancelar nos escribes por WhatsApp.",
  },
  {
    clave: "como_agendar_estetica",
    etiqueta: "Cómo se agenda una cita de estética",
    ayuda: "El portal del dueño no agenda citas: aquí le dices cómo hacerlo.",
    alguno: ["estetica"],
    omision: "Para agendar, cambiar o cancelar una cita nos escribes por WhatsApp.",
  },
  {
    clave: "cancelaciones",
    etiqueta: "Cancelaciones y anticipos",
    ayuda: "Tu política de cancelación (con cuánto tiempo, si el anticipo se devuelve). Vacío: no se menciona.",
    omision: "",
  },
  {
    clave: "recoleccion",
    etiqueta: "Recolección a domicilio",
    ayuda: "Cómo funciona tu recolección (zonas, horarios, cómo se cobra). Vacío: no se menciona. Solo con recolección prendida.",
    alguno: ["recoleccion"],
    omision: "",
  },
];

export type TextosPoliticas = Partial<Record<ClavePolitica, string>>;

/** ¿Esta regla aplica con estos módulos prendidos? */
export function politicaAplica(p: Politica, modulos: readonly string[]): boolean {
  if (p.alguno && !p.alguno.some((m) => modulos.includes(m))) return false;
  if (p.todos && !p.todos.every((m) => modulos.includes(m))) return false;
  return true;
}

/** El texto vigente de una regla: el del negocio si escribió (aunque sea vacío), si no el neutro. */
export function textoPolitica(textos: TextosPoliticas, clave: ClavePolitica): string {
  const propio = textos[clave];
  if (typeof propio === "string") return propio.trim();
  return CATALOGO_POLITICAS.find((p) => p.clave === clave)?.omision ?? "";
}

/**
 * Las reglas que se le enseñan al dueño con estos módulos: solo las que
 * aplican y tienen texto, en el orden del catálogo.
 */
export function politicasVisibles(textos: TextosPoliticas, modulos: readonly string[]): { clave: ClavePolitica; etiqueta: string; texto: string }[] {
  return CATALOGO_POLITICAS.filter((p) => politicaAplica(p, modulos))
    .map((p) => ({ clave: p.clave, etiqueta: p.etiqueta, texto: textoPolitica(textos, p.clave) }))
    .filter((p) => p.texto.length > 0);
}

export const LARGO_MAXIMO_POLITICA = 600;
