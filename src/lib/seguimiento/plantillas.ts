// Las cuatro plantillas del seguimiento de pruebas (Meta WhatsApp Cloud API,
// WABA de PeluDesk, es_MX). Los textos son EXACTOS: lo que se manda a revisión
// a Meta y lo que se guarda en la conversación (para que el bot sepa qué se le
// dijo a la persona) salen de aquí. Nada de precios ni cifras de negocio.

export type EtapaSeguimiento = "dia5" | "dia10" | "dia15";
export const ETAPAS: EtapaSeguimiento[] = ["dia5", "dia10", "dia15"];
/** Días desde el registro en que se manda cada etapa. */
export const DIA_DE_ETAPA: Record<EtapaSeguimiento, number> = { dia5: 5, dia10: 10, dia15: 15 };

export type PlantillaSeguimiento = {
  nombre: string;
  etapa: EtapaSeguimiento;
  /** «perfil» = el día 5 con el perfil ya completo; «sin_perfil» = el día 5 sin completar. */
  variante?: "sin_perfil" | "perfil";
  categoria: "MARKETING";
  encabezado: string;
  cuerpo: string;
  pie: string;
  botones: { texto: string; payload: string }[];
  /** Valores de ejemplo de las variables, que Meta exige al revisar. */
  ejemplos: string[];
};

const PIE = "PeluDesk · Para estéticas y guarderías caninas";

export const PLANTILLAS: PlantillaSeguimiento[] = [
  {
    nombre: "peludesk_prueba_dia5_v1",
    etapa: "dia5",
    variante: "sin_perfil",
    categoria: "MARKETING",
    encabezado: "Tu prueba de PeluDesk",
    cuerpo:
      "Hola {{1}} 👋\n\nSoy del equipo de PeluDesk. Van 5 días de tu prueba y quería preguntarte:\n\n*¿Te ayudamos con algo?*\n\n🎁 Y un recordatorio: si completas el perfil de *{{2}}* antes del *{{3}}*, tu *página web es gratis de por vida*.\n\nSe completa desde tu panel.",
    pie: PIE,
    botones: [
      { texto: "Necesito ayuda", payload: "seg:dia5:ayuda" },
      { texto: "Ahora no", payload: "seg:dia5:ahora_no" },
    ],
    ejemplos: ["Ana", "Patitas Felices", "miércoles 7 de octubre"],
  },
  {
    nombre: "peludesk_prueba_dia5_perfil_v1",
    etapa: "dia5",
    variante: "perfil",
    categoria: "MARKETING",
    encabezado: "Tu prueba de PeluDesk",
    cuerpo:
      "Hola {{1}} 👋\n\nVan 5 días de tu prueba y vimos que ya completaste el perfil de *{{2}}*. ¡Muy bien! 🙌\n\n🎁 Con eso, tu *página web gratis de por vida* ya es tuya.\n\n*¿Te ayudamos con algo?* Escríbenos aquí mismo.",
    pie: PIE,
    botones: [
      { texto: "Necesito ayuda", payload: "seg:dia5p:ayuda" },
      { texto: "Ahora no", payload: "seg:dia5p:ahora_no" },
    ],
    ejemplos: ["Ana", "Patitas Felices"],
  },
  {
    nombre: "peludesk_prueba_dia10_v1",
    etapa: "dia10",
    categoria: "MARKETING",
    encabezado: "¿Cómo vas con PeluDesk?",
    cuerpo:
      "Hola {{1}} 👋\n\nTe quedan *{{2}} días* de prueba. ¿Cómo vas con *{{3}}*?\n\n*¿Te ayudamos en algo?*\n\nResolvemos dudas y te acompañamos con lo que necesites. Responde a este mensaje y te atendemos.",
    pie: PIE,
    botones: [
      { texto: "Necesito ayuda", payload: "seg:dia10:ayuda" },
      { texto: "Ahora no", payload: "seg:dia10:ahora_no" },
    ],
    ejemplos: ["Ana", "5", "Patitas Felices"],
  },
  {
    nombre: "peludesk_prueba_dia15_v1",
    etapa: "dia15",
    categoria: "MARKETING",
    encabezado: "Último día de tu prueba",
    cuerpo:
      "Hola {{1}} 👋\n\nHoy termina tu prueba de PeluDesk.\n\nMañana tu cuenta queda en *solo lectura*: tus datos se conservan y puedes elegir tu plan cuando quieras.\n\nSi quieres seguir sin pausa, te ayudamos a elegirlo en un minuto.",
    pie: PIE,
    botones: [
      { texto: "Elegir un plan", payload: "seg:dia15:plan" },
      { texto: "Necesito ayuda", payload: "seg:dia15:ayuda" },
      { texto: "Ahora no", payload: "seg:dia15:ahora_no" },
    ],
    ejemplos: ["Ana"],
  },
];

export const plantillaPorNombre = (nombre: string) => PLANTILLAS.find((p) => p.nombre === nombre) ?? null;

/** La plantilla que toca. El día 5 depende de si el perfil ya está completo. */
export function plantillaDeEtapa(etapa: EtapaSeguimiento, perfilCompleto: boolean): PlantillaSeguimiento {
  const p = PLANTILLAS.find((x) => x.etapa === etapa && (etapa !== "dia5" || x.variante === (perfilCompleto ? "perfil" : "sin_perfil")));
  if (!p) throw new Error(`No hay plantilla para ${etapa}`);
  return p;
}

/** Meta no admite saltos de línea, tabulaciones ni 4 espacios seguidos en un valor de variable. */
export function limpiarVariable(v: string): string {
  return v.replace(/\s+/g, " ").trim().slice(0, 60);
}

/** El cuerpo con las variables puestas (lo que la persona ve; se guarda en la conversación). */
export function cuerpoRenderizado(p: PlantillaSeguimiento, parametros: string[]): string {
  return p.cuerpo.replace(/\{\{(\d+)\}\}/g, (_, n) => parametros[Number(n) - 1] ?? "");
}

/** El componente de creación que se manda a Meta (message_templates). */
export function componentesParaMeta(p: PlantillaSeguimiento) {
  return [
    { type: "HEADER", format: "TEXT", text: p.encabezado },
    { type: "BODY", text: p.cuerpo, example: { body_text: [p.ejemplos] } },
    { type: "FOOTER", text: p.pie },
    { type: "BUTTONS", buttons: p.botones.map((b) => ({ type: "QUICK_REPLY", text: b.texto })) },
  ];
}
