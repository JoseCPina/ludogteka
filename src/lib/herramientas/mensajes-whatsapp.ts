// Las plantillas de mensajes de WhatsApp (/mensajes-whatsapp): 20 por giro, con las variables que la persona llena
// ({{negocio}}, {{cliente}}, {{mascota}}, {{dia}}, {{hora}}, {{servicio}}, {{monto}}). Español de México, cortos,
// sin signos de más. Sin imports: lo leen las páginas, el sitemap y el bot. Las que PeluDesk manda solas (recordatorio,
// listo para recoger, vacuna) se marcan `automatico` para el cierre «o que salgan solas».
import type { GiroMercado } from "@/lib/mercado/catalogo";

export type PlantillaMensaje = { slug: string; nombre: string; cuando: string; texto: string; automatico?: boolean };

type Voc = { servicio: string; cita: string; mascota: string; lugar: string };
const VOC: Record<GiroMercado, Voc> = {
  estetica: { servicio: "baño y corte", cita: "cita", mascota: "perro", lugar: "la estética" },
  hotel: { servicio: "hospedaje", cita: "reservación", mascota: "perro", lugar: "el hotel" },
  guarderia: { servicio: "día de guardería", cita: "reservación", mascota: "perro", lugar: "la guardería" },
  veterinaria: { servicio: "consulta", cita: "consulta", mascota: "mascota", lugar: "la clínica" },
};

function base(v: Voc): PlantillaMensaje[] {
  return [
    { slug: "confirmacion", nombre: "Confirmación", cuando: "Al agendar", texto: `Hola {{cliente}}, de {{negocio}}: quedó la ${v.cita} de {{mascota}} para {{servicio}} el {{dia}} a las {{hora}}. Si necesitas cambiarla, contéstanos por aquí.` },
    { slug: "recordatorio", nombre: "Recordatorio del día anterior", cuando: "Un día antes", automatico: true, texto: `Hola {{cliente}}, te recordamos la ${v.cita} de {{mascota}} mañana {{dia}} a las {{hora}} en {{negocio}}. ¿Nos confirmas?` },
    { slug: "recordatorio-mismo-dia", nombre: "Recordatorio del mismo día", cuando: "En la mañana", texto: `Buenos días {{cliente}}. Hoy esperamos a {{mascota}} a las {{hora}} en {{negocio}}. Cualquier cosa, por aquí.` },
    { slug: "listo-para-recoger", nombre: "Listo para recoger", cuando: "Al terminar", automatico: true, texto: `Hola {{cliente}}, {{mascota}} ya está listo en {{negocio}}. Te esperamos cuando puedas pasar.` },
    { slug: "cobro-pendiente", nombre: "Cobro pendiente", cuando: "Después del servicio", texto: `Hola {{cliente}}, de {{negocio}}: queda pendiente el pago de {{servicio}} de {{mascota}} por {{monto}}. Te paso los datos para transferir o lo pagas al pasar. Gracias.` },
    { slug: "recordatorio-de-pago", nombre: "Segundo aviso de pago", cuando: "Una semana después", texto: `Hola {{cliente}}, te escribimos de {{negocio}} para recordarte el saldo de {{monto}} por {{servicio}} de {{mascota}}. Si ya lo pagaste, ignora este mensaje y gracias.` },
    { slug: "pedir-resena", nombre: "Pedir reseña", cuando: "Al día siguiente", texto: `Hola {{cliente}}, ¿cómo le fue a {{mascota}} después de su visita a {{negocio}}? Si te gustó, nos ayuda mucho una reseña en Google. Aquí el link: ` },
    { slug: "bienvenida", nombre: "Bienvenida a un cliente nuevo", cuando: "Después de la primera visita", texto: `Hola {{cliente}}, gracias por confiarnos a {{mascota}}. Somos {{negocio}}. Por aquí puedes agendar, preguntar precios y avisarnos cualquier cosa de {{mascota}}.` },
    { slug: "vacuna-proxima", nombre: "Vacuna próxima", cuando: "Siete días antes", automatico: true, texto: `Hola {{cliente}}, según el carnet de {{mascota}} la próxima vacuna toca el {{dia}}. ¿Te agendamos? Responde por aquí.` },
    { slug: "cambio-de-cita", nombre: "Cambio de cita", cuando: "Cuando el negocio necesita mover la cita", texto: `Hola {{cliente}}, de {{negocio}}: necesitamos mover la ${v.cita} de {{mascota}} del {{dia}} a las {{hora}}. ¿Te queda bien? Si no, dinos qué día te acomoda. Una disculpa.` },
    { slug: "no-llego", nombre: "No llegó a su cita", cuando: "Después de la hora", texto: `Hola {{cliente}}, hoy esperábamos a {{mascota}} a las {{hora}} en {{negocio}}. ¿Todo bien? Si quieres, te buscamos otro horario.` },
    { slug: "seguimiento", nombre: "Seguimiento después del servicio", cuando: "Dos días después", texto: `Hola {{cliente}}, ¿cómo sigue {{mascota}} después de su ${v.servicio}? Si notas algo raro, escríbenos a {{negocio}}.` },
    { slug: "promocion-temporada", nombre: "Promoción de temporada", cuando: "Cuando hay promoción", texto: `Hola {{cliente}}, en {{negocio}} tenemos promoción este mes en {{servicio}}: {{monto}}. Si quieres lugar para {{mascota}}, contéstanos y te apartamos.` },
    { slug: "cumpleanos", nombre: "Cumpleaños de la mascota", cuando: "El día de su cumpleaños", texto: `Hola {{cliente}}, hoy {{mascota}} cumple años. Felicidades de parte de todo el equipo de {{negocio}}.` },
    { slug: "horario-festivo", nombre: "Horario en días festivos", cuando: "Antes de un puente o fiesta", texto: `Hola {{cliente}}, te avisamos de {{negocio}}: el {{dia}} tendremos horario especial de {{hora}}. Si necesitas algo para {{mascota}} esos días, agenda con tiempo.` },
    { slug: "cliente-que-no-regresa", nombre: "Cliente que no ha vuelto", cuando: "Tres meses sin visita", texto: `Hola {{cliente}}, hace tiempo que no vemos a {{mascota}} en {{negocio}}. ¿Cómo está? Si quieres agendar, por aquí te apartamos lugar.` },
    { slug: "nuevo-servicio", nombre: "Servicio nuevo", cuando: "Cuando se agrega un servicio", texto: `Hola {{cliente}}, en {{negocio}} ya tenemos {{servicio}}. Si te interesa para {{mascota}}, cuéntanos y te decimos precio y horarios.` },
    { slug: "agradecimiento", nombre: "Agradecimiento", cuando: "Al cerrar una buena visita", texto: `Gracias por tu visita, {{cliente}}. Nos dio gusto ver a {{mascota}}. Cualquier cosa, aquí estamos en {{negocio}}.` },
    { slug: "datos-de-pago", nombre: "Datos para transferir", cuando: "Cuando piden cómo pagar", texto: `Hola {{cliente}}, para pagar {{servicio}} de {{mascota}} ({{monto}}) puedes transferir a la cuenta de {{negocio}}: [banco, CLABE, nombre]. Mándanos el comprobante por aquí.` },
    { slug: "aviso-de-cierre", nombre: "Aviso de cierre temporal", cuando: "Vacaciones o mantenimiento", texto: `Hola {{cliente}}, {{negocio}} estará cerrado del {{dia}} al {{hora}}. Si necesitas algo para {{mascota}} antes, agenda por aquí. Gracias por tu comprensión.` },
  ];
}

const EXTRA: Record<GiroMercado, PlantillaMensaje[]> = {
  estetica: [
    { slug: "pelo-maltratado", nombre: "Aviso de pelo maltratado", cuando: "Al revisar al perro", texto: `Hola {{cliente}}, {{mascota}} llegó con nudos y el servicio llevará más tiempo. El recargo es de {{monto}}. ¿Lo autorizas? Si prefieres, rapamos las zonas con nudos sin recargo.` },
    { slug: "foto-del-resultado", nombre: "Foto del resultado", cuando: "Al terminar", texto: `Hola {{cliente}}, así quedó {{mascota}}. Ya puedes pasar por él a {{negocio}}.` },
  ],
  hotel: [
    { slug: "reporte-de-estancia", nombre: "Reporte de la estancia", cuando: "Cada día del hospedaje", texto: `Hola {{cliente}}, {{mascota}} comió bien, jugó y durmió tranquilo. Te mandamos foto. Saludos de {{negocio}}.` },
    { slug: "checkout", nombre: "Día de salida", cuando: "La mañana de la salida", texto: `Hola {{cliente}}, hoy {{mascota}} regresa a casa. Puedes pasar por él a {{negocio}} desde las {{hora}}. Te contamos cómo le fue.` },
  ],
  guarderia: [
    { slug: "cartilla-de-vacunas", nombre: "Falta la cartilla de vacunas", cuando: "Antes del primer día", texto: `Hola {{cliente}}, para recibir a {{mascota}} en {{negocio}} necesitamos su cartilla con vacunas vigentes. ¿Nos la mandas por aquí en foto?` },
    { slug: "paquete-por-terminar", nombre: "Paquete por terminarse", cuando: "Cuando quedan 2 días", texto: `Hola {{cliente}}, a {{mascota}} le quedan 2 días de su paquete en {{negocio}}. Si quieres renovar, dinos y te lo dejamos listo.` },
  ],
  veterinaria: [
    { slug: "indicaciones", nombre: "Indicaciones después de la consulta", cuando: "Al salir de la consulta", texto: `Hola {{cliente}}, te dejo las indicaciones de {{mascota}}: {{servicio}}. Si notas algo raro, escríbenos a {{negocio}}.` },
    { slug: "resultados-listos", nombre: "Resultados listos", cuando: "Cuando llegan los estudios", texto: `Hola {{cliente}}, ya tenemos los resultados de {{mascota}}. ¿Pasas a {{negocio}} o te los comentamos por aquí?` },
  ],
};

export const GIROS_MENSAJES: GiroMercado[] = ["estetica", "hotel", "guarderia", "veterinaria"];

export function plantillasDe(giro: GiroMercado): PlantillaMensaje[] {
  return [...base(VOC[giro]), ...EXTRA[giro]];
}

/** Todas las plantillas distintas (por slug), para las páginas indexables y el sitemap. */
export function todasLasPlantillas(): { slug: string; nombre: string; cuando: string; giros: GiroMercado[] }[] {
  const mapa = new Map<string, { slug: string; nombre: string; cuando: string; giros: GiroMercado[] }>();
  for (const g of GIROS_MENSAJES) for (const p of plantillasDe(g)) {
    const v = mapa.get(p.slug) ?? { slug: p.slug, nombre: p.nombre, cuando: p.cuando, giros: [] };
    v.giros.push(g);
    mapa.set(p.slug, v);
  }
  return [...mapa.values()];
}

export const plantillaPorSlug = (slug: string) => todasLasPlantillas().find((p) => p.slug === slug) ?? null;

export type ValoresMensaje = { negocio: string; cliente: string; mascota: string; dia: string; hora: string; servicio: string; monto: string };
export const VALORES_EJEMPLO: ValoresMensaje = { negocio: "tu negocio", cliente: "Ana", mascota: "Rocky", dia: "jueves 5 de noviembre", hora: "11:00", servicio: "baño completo", monto: "$350" };

export function llenar(texto: string, v: Partial<ValoresMensaje>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (v[k as keyof ValoresMensaje] || VALORES_EJEMPLO[k as keyof ValoresMensaje]) ?? `{{${k}}}`);
}
