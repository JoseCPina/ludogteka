import { pesosRecordatorio, precioRecordatorioVigente, type PrecioRecordatorio } from "@/lib/recordatorios/precio";

/**
 * Lo que el sitio público (peludesk.mx) dice de los recordatorios automáticos por WhatsApp: la landing, cada giro,
 * /precios, /alternativas, llms.txt y las preguntas frecuentes. Solo lo que la función hace. Los mensajes gratis y
 * el precio por mensaje salen SIEMPRE de la base (`precioRecordatorioVigente`, tabla `wa_precios`); si la base no
 * tiene precio vigente, los textos dicen «centavos por mensaje» sin cifra.
 */

export const FUNCION_RECORDATORIOS = "Recordatorios automáticos por WhatsApp";

export const TITULO_RECORDATORIOS = "Tus clientes reciben su recordatorio por WhatsApp, solos";

export const BENEFICIOS_RECORDATORIOS: readonly { titulo: string; texto: string }[] = [
  { titulo: "Menos plantones", texto: "Un día antes, a la hora que tú escojas, tu cliente recibe su cita en WhatsApp." },
  { titulo: "Cero mensajes a mano", texto: "Salen solos para estética, consultas, hotel y guardería. Tú no escribes nada." },
  { titulo: "Confirma con un toque", texto: "«Confirmo» y la cita se pone en verde en tu agenda. Si necesita cambiarla, te avisa en tu panel." },
];

/** Qué manda, en una lista corta (páginas, llms-full.txt). */
export const QUE_MANDA_RECORDATORIOS: readonly string[] = [
  "El día anterior, a la hora que escoge el negocio (10:00 en su zona horaria si no escoge otra): el recordatorio de cada cita de estética, cada cita veterinaria (con el nombre del médico) y cada llegada a hotel o guardería.",
  "Al terminar la estética: el aviso de que la mascota ya está lista para recoger.",
  "7 días antes de la próxima vacuna: «¿Te agendamos?», con los botones Agendar y Después.",
  "Sale del número de WhatsApp de PeluDesk, con el nombre del negocio en el texto.",
  "El cliente contesta con un botón: «Confirmo» pone la cita como confirmada (en verde) en la agenda; «Necesito cambiarla» le avisa al negocio en su panel para que le escriba y la cambie.",
  "Si el cliente escribe BAJA, deja de recibirlos. Cada tipo de recordatorio se prende o se apaga en Configuración → Recordatorios.",
];

export type TextosRecordatorios = {
  /** «30 recordatorios gratis al mes; después, centavos por mensaje.» */
  lineaPrecio: string;
  /** «$0.31 + IVA por mensaje adicional.» o null si no hay precio en la base. */
  adicional: string | null;
  /** La celda de PeluDesk en las comparativas. */
  filaComparativa: string;
  /** Cómo se cobra, en un párrafo (preguntas frecuentes, /precios, llms). */
  cobro: string;
  /** La pregunta frecuente completa: cómo funcionan y cuánto cuestan. */
  pregunta: [string, string];
};

export function textosRecordatorios(p: PrecioRecordatorio | null): TextosRecordatorios {
  const gratis = p ? `${p.gratisMes.toLocaleString("es-MX")} recordatorios gratis al mes` : "Recordatorios gratis cada mes";
  const porMensaje = p ? `${pesosRecordatorio(p.precio)} + IVA por mensaje entregado` : "centavos por mensaje entregado, más IVA";
  const cobro =
    `${p ? `Cada negocio tiene ${p.gratisMes.toLocaleString("es-MX")} recordatorios gratis al mes` : "Cada negocio tiene recordatorios gratis cada mes"}, también durante la prueba gratis. ` +
    `Después, ${porMensaje}. Se cobra en la misma factura mensual del plan, tú pones un tope de gasto al mes y los mensajes que no se entregan no se cobran.`;
  return {
    lineaPrecio: `${gratis}; después, centavos por mensaje.`,
    adicional: p ? `${pesosRecordatorio(p.precio)} + IVA por mensaje adicional.` : null,
    filaComparativa: p
      ? `Sí, ${p.gratisMes.toLocaleString("es-MX")} gratis al mes; después, ${pesosRecordatorio(p.precio)} + IVA por mensaje entregado. El cliente confirma con un botón.`
      : "Sí, con recordatorios gratis cada mes; después, centavos por mensaje. El cliente confirma con un botón.",
    cobro,
    pregunta: [
      "¿Cómo funcionan los recordatorios por WhatsApp y cuánto cuestan?",
      "PeluDesk los manda solo, el día anterior y a la hora que escojas (10:00 si no escoges otra), para cada cita de estética, cita veterinaria y llegada a hotel o guardería. " +
        "También avisa cuando la mascota ya está lista para recoger y, 7 días antes, de su próxima vacuna. Salen del número de WhatsApp de PeluDesk con el nombre de tu negocio. " +
        "Tu cliente contesta con un botón: «Confirmo» pone la cita en verde en tu agenda y «Necesito cambiarla» te avisa en tu panel para que le escribas. Si escribe BAJA, deja de recibirlos. " +
        `Cada tipo se prende o se apaga en Configuración → Recordatorios. ${cobro}`,
    ],
  };
}

/** Los textos con el precio vigente de la base (tolera que la tabla no exista: textos sin cifra). */
export async function recordatoriosVigentes(): Promise<TextosRecordatorios> {
  return textosRecordatorios(await precioRecordatorioVigente());
}
