// El guion de ventas del bot de WhatsApp de PeluDesk (25 de octubre de 2026): una conversación de enganche hasta el
// registro. Todo lo que el bot DICE está aquí, fijo; la IA solo entiende lo que escribe la persona y elige la rama
// (ventas/servidor.ts), nunca redacta. Las cifras: el precio sale de la base (planes) y los datos por tamaño se
// calculan con la cifra que dio la persona; ninguna la escribe el modelo. Los recordatorios (estética, veterinaria,
// hotel y guardería) salen solos, automáticos, el día anterior (Recordatorios por WhatsApp); su precio por mensaje
// lo dice la respuesta fija de recordatorios (respuestas-fijas.ts), con la cifra de la base.
//
//   1. Entrada (info, hola, precio, qué es, me interesa, audio, sticker, emoji): qué es PeluDesk y el giro con
//      botones. Si ya se sabe el giro (prospecto por ref, anuncio o teléfono), salta al 2.
//   2. Por giro: el dolor y la solución en una respuesta corta, y una pregunta de calificación.
//   3. Con su respuesta: un dato para su tamaño y el cierre con el botón «Probar gratis» (WhatsApp Flow).
//   4. Objeciones con respuesta fija, siempre terminando en el botón; preguntas de funciones con la respuesta fija.
//   6. A una persona: si lo pide, si tiene varias sucursales o si el bot no supo contestar dos veces seguidas.
// Sin imports: lo usan el servidor y la auditoría (`node` quita los tipos solo).

export type Giro = "estetica" | "hotel_guarderia" | "veterinaria" | "varios";
export type Sistema = "papel" | "excel" | "otro_sistema" | "ninguno";
export type Etapa = "nueva" | "giro" | "calificacion" | "cierre" | "cerrada";
export type Rama =
  | "entrada"
  | "giro"
  | "calificacion"
  | "prueba"
  | "precio"
  | "otro_sistema"
  | "sin_tiempo"
  | "lo_pienso"
  | "no_interesa"
  | "funcion"
  | "ya_cuenta"
  | "cliente_mascota"
  | "humano"
  | "sucursales"
  | "cortesia"
  | "desconocido";
export const RAMAS: Rama[] = ["entrada", "giro", "calificacion", "prueba", "precio", "otro_sistema", "sin_tiempo", "lo_pienso", "no_interesa", "funcion", "ya_cuenta", "cliente_mascota", "humano", "sucursales", "cortesia", "desconocido"];
export type PuntoVentas = "cierre" | "objecion" | "funcion" | "ya_cuenta" | "cliente" | "seguimiento";

export interface Clasificacion {
  rama: Rama;
  giro?: Giro | null;
  numero?: number | null;
  sistema?: Sistema | null;
  funcion?: string | null;
  /** Llegó preguntando el precio: la entrada lleva la línea del precio. */
  precioAlEntrar?: boolean;
}

export interface EstadoVentas {
  etapa: Etapa;
  giro: Giro | null;
  desconocidas: number;
}

export type Pieza =
  | { tipo: "texto"; cuerpo: string }
  | { tipo: "botones"; cuerpo: string; botones: { id: string; titulo: string }[] }
  | { tipo: "flow"; cuerpo: string; punto: PuntoVentas }
  | { tipo: "humano"; acuse: string; resumen: string }
  | { tipo: "baja"; cuerpo: string };

export interface ContextoGuion {
  /** Precio mensual sin IVA de la base (null si no se pudo leer: la línea va sin cifra). */
  mensual: number | null;
  /** El link de la demo del giro (Patitas & Co.), o el general si no se sabe el giro. */
  demo(giro: Giro | null): string;
  /** La respuesta fija de una función (conocimiento.ts y respuestas-fijas.ts), o null si no existe. */
  funcion(clave: string): string | null;
}

export interface Decision {
  rama: Rama;
  piezas: Pieza[];
  estado: EstadoVentas;
  /** Lo que se guarda en el prospecto y en wa_ventas. */
  calificacion?: { numero: number | null; sistema: Sistema | null; texto: string };
  giroNuevo?: Giro;
  /** «Lo pienso»: seguimiento a 2 días. */
  programarSeguimiento?: boolean;
}

// ───────────────────────────── textos fijos

const pesos = (n: number) => `$${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;

export const BOTONES_GIRO = [
  { id: "giro_estetica", titulo: "Estética" },
  { id: "giro_hotel", titulo: "Hotel o guardería" },
  { id: "giro_veterinaria", titulo: "Veterinaria" },
];

export const QUE_ES = "PeluDesk es el sistema para estéticas, hoteles y veterinarias de mascotas: agenda, cobros y recordatorios por WhatsApp.";
export const PREGUNTA_GIRO = "¿Qué tipo de negocio tienes?";

export function lineaPrecio(mensual: number | null): string {
  return mensual
    ? `Cuesta ${pesos(mensual)} + IVA al mes por negocio, con todo incluido, y los primeros 15 días son gratis, sin tarjeta.`
    : "Es un solo plan con todo incluido, y los primeros 15 días son gratis, sin tarjeta.";
}

export const CIERRE = "Pruébalo gratis 15 días, sin tarjeta; en 2 minutos ya tienes tu agenda.";

export const PASO2: Record<Giro, { mensaje: string; pregunta: string }> = {
  estetica: {
    mensaje:
      "Tus clientes te piden cita por WhatsApp y en PeluDesk la agendas en segundos; el recordatorio sale solo, automático, el día anterior, y tu cliente confirma con un botón: hay menos plantones. Cobras y haces tu corte de caja sin libreta.",
    pregunta: "¿Cuántas citas atiendes a la semana?",
  },
  hotel_guarderia: {
    mensaje:
      "En PeluDesk el recordatorio de la llegada sale solo, automático, el día anterior, y el dueño confirma con un botón. Cada reserva tiene su check-in con foto de llegada, el dueño firma el contrato desde su celular y le mandas el reporte del día de su perro por WhatsApp.",
    pregunta: "¿Cuántos perros tienes en temporada alta?",
  },
  veterinaria: {
    mensaje:
      "En PeluDesk tienes el expediente, el carnet de vacunas, las recetas y la caja en un solo lugar. El recordatorio de la cita sale solo, automático, el día anterior (y el de la próxima vacuna, 7 días antes), y el dueño confirma con un botón.",
    pregunta: "¿Llevan el expediente en papel o en algún sistema?",
  },
  varios: {
    mensaje:
      "En PeluDesk llevas en un solo lugar la agenda de estética y las reservas de hotel o guardería: recordatorio automático el día anterior, check-in con foto, contrato firmado desde el celular del dueño, cobros y corte de caja.",
    pregunta: "¿Cuántos perros atiendes a la semana entre todo?",
  },
};

/**
 * Plantones al mes que se evitan recordando cada cita el día anterior: SUPUESTO COMERCIAL fijo (2.5 % de las citas
 * de un mes de 4.3 semanas), no una medición. Con 40 citas a la semana da 4.
 */
export const TASA_PLANTONES_EVITADOS = 0.025;
export function plantonesEvitados(citasSemana: number): number {
  return Math.max(1, Math.round(citasSemana * 4.3 * TASA_PLANTONES_EVITADOS));
}

/** El dato concreto del paso 3, con la cifra que dio la persona (o sin cifra si no la dio). */
export function datoPorTamano(giro: Giro, numero: number | null, sistema: Sistema | null): string {
  const n = numero && numero > 0 && numero <= 5000 ? Math.round(numero) : null;
  switch (giro) {
    case "estetica": {
      if (!n) return "El recordatorio del día anterior a cada cita es lo que más baja los plantones, y en PeluDesk sale solo, automático.";
      const p = plantonesEvitados(n);
      return `Con ${n} citas a la semana, el recordatorio automático del día anterior te ahorra unos ${p === 1 ? "un plantón" : `${p} plantones`} al mes.`;
    }
    case "hotel_guarderia":
    case "varios":
      return n
        ? `Con ${n} perros, son ${n} reportes del día que mandas desde la app en vez de escribirlos uno por uno, y ${n} contratos firmados sin papel.`
        : "Cada perro trae su reporte del día y su contrato firmado desde el celular del dueño, sin papel.";
    case "veterinaria":
      if (sistema === "papel") return "Pasar del papel al expediente es lo que más se nota: cada vacuna queda en el carnet y el recordatorio de la próxima sale solo, 7 días antes.";
      if (sistema === "excel") return "Tus pacientes los subes desde tu Excel con el importador y, desde ahí, cada vacuna queda en el carnet con su recordatorio automático.";
      if (sistema === "otro_sistema") return "Si exportas tus clientes de tu sistema a Excel, los subes con el importador y arrancas con todo tu historial de clientes.";
      return "Desde la primera consulta, cada vacuna queda en el carnet y el recordatorio de la próxima sale solo, 7 días antes.";
  }
}

export const OBJECIONES = {
  precio: (mensual: number | null) =>
    mensual
      ? `PeluDesk cuesta ${pesos(mensual)} + IVA al mes por negocio, con todo incluido: menos que un plantón a la semana. La prueba es de 15 días y sin tarjeta.`
      : "Es un solo plan con todo incluido, menos que un plantón a la semana. La prueba es de 15 días y sin tarjeta.",
  otro_sistema:
    "Tus clientes y mascotas los subes desde un Excel o CSV con el importador, y si hace falta te ayudamos a dejar tu archivo listo: migrar toma un día. Pruébalo 15 días gratis con tus propios datos.",
  sin_tiempo: "La cuenta se abre desde aquí en 2 minutos, sin salir de WhatsApp, y este chat te acompaña con lo que necesites para arrancar.",
  lo_pienso: (demo: string) =>
    `Claro. Mientras, mira cómo se ve con un negocio de ejemplo (es Patitas & Co., no un cliente real):\n${demo}\n\nEn dos días te escribo por si te quedó alguna duda. Y si te decides antes, aquí está:`,
};

export const TEXTO_NO_INTERESA = "Listo, te damos de baja: no te volvemos a escribir y dejamos de mostrarte nuestra publicidad. Si más adelante nos necesitas, escríbenos aquí mismo.";
export const TEXTO_YA_CUENTA =
  "Si este número ya tiene un negocio en PeluDesk, toca «Probar gratis» y te mando tu liga para entrar (no se abre otro). Si tu cuenta está con otro número, entra en la dirección de tu negocio con /login o escríbenos desde ese número.";
export const TEXTO_CLIENTE_MASCOTA =
  "Este WhatsApp es de PeluDesk, el sistema que usan estéticas, hoteles y veterinarias. Tu cita y los datos de tu mascota los ve tu negocio: escríbele a su número. Y si tú también tienes un negocio de mascotas, aquí está:";
export const TEXTO_NO_LO_TENGO = "Eso no lo tengo a la mano para contestarte bien.";
export const TEXTO_PRUEBA = `Va. ${CIERRE}`;
export const TEXTO_CORTESIA = "Con gusto. Cuando quieras, aquí está:";
export const ACUSE_HUMANO = "Te paso con alguien del equipo de PeluDesk; te escribe por aquí en horario hábil.";
export const ACUSE_SUCURSALES = "Para varias sucursales te atiende alguien del equipo de PeluDesk; te escribe por aquí en horario hábil.";
export const ACUSE_DESCONOCIDA = "Eso te lo contesta alguien del equipo de PeluDesk; te escribe por aquí en horario hábil.";

// Seguimientos (ventas/servidor.ts los manda).
export const SEGUIMIENTO_FLOW = "¿Te quedaste a medias? Termina tu registro aquí; es un minuto.";
export const seguimientoSinGiro = (demo: string) => `¿Lo quieres ver funcionando? Aquí está PeluDesk con un negocio de ejemplo (Patitas & Co.):\n${demo}\n\n${PREGUNTA_GIRO}`;
/** La plantilla MARKETING de los seguimientos fuera de la ventana de 24 h (Meta la tiene que aprobar). */
export const PLANTILLA_VENTAS = "peludesk_ventas_seguimiento_v1";
export const PLANTILLA_VENTAS_CUERPO =
  "Hola, te escribe el equipo de PeluDesk. Hace unos días platicamos de tu negocio: si quieres probarlo, la prueba es de 15 días, gratis y sin tarjeta, y tu cuenta se abre desde este chat.";
export const PLANTILLA_VENTAS_PIE = "Responde BAJA si no quieres más mensajes";
export const PLANTILLA_VENTAS_BOTON = "Probar gratis";

// ───────────────────────────── entender (reglas; lo que no cuadra va a la IA)

export const normal = (t: string) =>
  (t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¡!¿?.,;:)(*_~"'«»-]+/g, " ").replace(/\s+/g, " ").trim();

const NUMEROS: Record<string, number> = {
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15,
  veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100,
};

/** La primera cifra del texto («40», «unas 40», «cuarenta», «entre 30 y 40» → 30). */
export function numeroDe(texto: string): number | null {
  const t = normal(texto);
  const d = t.match(/\b(\d{1,5})\b/);
  if (d) return Number(d[1]);
  for (const p of t.split(" ")) if (NUMEROS[p] !== undefined) return NUMEROS[p];
  return null;
}

export function sistemaDe(texto: string): Sistema | null {
  const t = normal(texto);
  if (/\b(papel|libreta|cuaderno|a mano|fisico|tarjetas|carpeta)/.test(t)) return "papel";
  if (/\b(excel|hoja de calculo|sheets|hojas de google)/.test(t)) return "excel";
  if (/\b(sistema|software|programa|app|aplicacion|plataforma|qvet|vetter|vetlogic)/.test(t)) return "otro_sistema";
  if (/\b(nada|ninguno|ninguna|no llevamos|no tenemos|apenas (vamos a )?(empez|abr))/.test(t)) return "ninguno";
  return null;
}

export function giroDe(texto: string): Giro | null {
  const t = normal(texto);
  const est = /\b(estetica|esteticas|grooming|groomer|bano y corte|banos|peluqueria|peluquero|corte de pelo)\b/.test(t);
  const hot = /\b(hotel|hoteles|guarderia|guarderias|pension|hospedaje|daycare|kinder canino)\b/.test(t);
  const vet = /\b(veterinaria|veterinario|veterinarias|clinica|consultorio|mvz|hospital veterinario)\b/.test(t);
  const n = [est, hot, vet].filter(Boolean).length;
  if (n > 1) return "varios";
  return est ? "estetica" : hot ? "hotel_guarderia" : vet ? "veterinaria" : null;
}

/** Palabras de cada función: la clave es la de la respuesta fija (ContextoGuion.funcion). */
export const FUNCIONES_PALABRAS: [string, RegExp][] = [
  ["factura", /\b(factura|facturan|cfdi)\b/],
  ["sms", /\bsms\b/],
  ["terminal", /\b(terminal|mercado pago|clip|tarjeta de credito|pago con tarjeta)\b/],
  ["recordatorios", /\b(recordatorio|recordatorios|avisos? por whats|confirmacion de cita)/],
  ["contratos", /\b(contrato|contratos|firma digital|firmar)\b/],
  ["reporte", /\b(reporte del dia|reporte diario|reportes? de comportamiento|bitacora)\b/],
  ["fotos", /\b(fotos?|videos?)\b/],
  ["portal", /\b(portal|app para (mis )?clientes|mis clientes (vean|ven|pueden))\b/],
  ["pagina", /\b(pagina web|pagina|sitio web|web)\b/],
  ["inventario", /\b(inventario|insumos|productos|croquetas)\b/],
  ["empleados", /\b(empleados?|nomina|asistencia|comisiones|estilistas?)\b/],
  ["caja", /\b(caja|corte|cobros?|cobrar|efectivo|transferencia)\b/],
  ["expediente", /\b(expediente|historia clinica|historial clinico)\b/],
  ["carnet", /\b(carnet|cartilla|vacunas?|desparasitacion)\b/],
  ["recetas", /\b(receta|recetas|controlados|sitpv)\b/],
  ["migracion", /\b(importar|importa|migrar|migracion|pasar mis (clientes|datos))\b/],
  ["agenda", /\b(agenda|citas en linea|agendar)\b/],
  ["cancelacion", /\b(cancelar|cancelacion|plazo forzoso|contrato forzoso)\b/],
  ["soporte", /\b(soporte|capacitacion|me ayudan|ayuda para empezar)\b/],
  ["anual", /\b(anual|al ano|por ano)\b/],
  ["app", /\b(se instala|instalar|android|iphone|celular|tablet|computadora)\b/],
];

function funcionDe(t: string): string | null {
  for (const [clave, re] of FUNCIONES_PALABRAS) if (re.test(t)) return clave;
  return null;
}

const esPregunta = (crudo: string, t: string) => /\?/.test(crudo) || /^(tiene|tienen|se puede|puedo|hace|hacen|incluye|como|que tal|sirve|manda|mandan|lleva|maneja)\b/.test(t);
const soloEmoji = (crudo: string) => {
  const s = (crudo ?? "").replace(/\s/g, "");
  return s.length > 0 && !/[\p{L}\p{N}]/u.test(s);
};

/** El texto que el webhook guarda cuando llega audio, foto o sticker sin texto. */
export const SIN_TEXTO = "[mensaje sin texto]";

/**
 * La rama por reglas, con el paso en que va la conversación. null = no está claro: la decide la IA (con las mismas
 * ramas). Nada de aquí redacta: solo clasifica.
 */
export function clasificarFijo(crudo: string, estado: EstadoVentas, tambienCliente = false): Clasificacion | null {
  if (!crudo || crudo === SIN_TEXTO || soloEmoji(crudo)) return { rama: estado.etapa === "nueva" ? "entrada" : "cortesia" };
  const t = normal(crudo);
  if (!t) return { rama: "entrada" };

  if (/\b(hablar con (alguien|una persona|un asesor|un humano|un agente|ustedes|un vendedor)|asesor|asesora|persona real|un humano|llamenme|llamame|me pueden llamar|me llaman|marcame|quiero una llamada)\b/.test(t)) return { rama: "humano" };
  if (/\b(sucursales|varias tiendas|varios locales|varias clinicas|\d+ (locales|sucursales|clinicas|tiendas)|otra sucursal|franquicia)\b/.test(t)) return { rama: "sucursales" };
  if (/\b(no me interesa|no estoy interesad[oa]|no lo necesito|no gracias|no por ahora no|no busco|ya no me escriban|no me escriban)\b/.test(t)) return { rama: "no_interesa" };
  if (/\b(ya tengo (una )?cuenta|ya tengo peludesk|ya (soy|estoy) (registrad|client)|ya me registre|no puedo entrar|olvide mi contrasena|mi contrasena)\b/.test(t)) return { rama: "ya_cuenta" };
  if (/\b((cita|bano|corte|consulta|vacuna|reservacion|reserva)s? (para|de) (mi|mis) |(mi|mis) (perro|perrito|perrita|mascota|gato|gatito|cachorro|perros|mascotas)\b|recoger a mi)/.test(t)) return { rama: "cliente_mascota" };

  // La respuesta a la pregunta de calificación del paso 2.
  if (estado.etapa === "calificacion" && estado.giro) {
    if (estado.giro === "veterinaria") {
      const s = sistemaDe(crudo);
      if (s) return { rama: "calificacion", sistema: s };
    } else {
      const n = numeroDe(crudo);
      if (n !== null && !/\$|pesos|precio|cuesta/.test(t)) return { rama: "calificacion", numero: n };
    }
  }

  if (/\b(lo pienso|lo voy a pensar|dejame pensarlo|lo checo|lo reviso|dejame ver|despues te|luego te|mas tarde|otro dia|lo consulto|lo platico)\b/.test(t) || (t.length <= 30 && /\b(ahorita no|ahora no|despues|luego|en otro momento)\b/.test(t))) return { rama: "lo_pienso" };
  if (/\b(no tengo tiempo|no me da tiempo|estoy ocupad|ando ocupad|muy ocupad|sin tiempo|no tengo chance)\b/.test(t)) return { rama: "sin_tiempo" };
  if (/\b((ya )?(uso|usamos|tengo|tenemos|manejo|manejamos|llevo|llevamos) (otro|un|una) (sistema|programa|software|app|aplicacion|agenda)|uso excel|en excel|agenda de papel|libreta|cuaderno|google calendar|ya tengo sistema)\b/.test(t)) return { rama: "otro_sistema" };
  const precio = /\b(precio|precios|cuesta|cuestan|costo|cuanto (es|sale|cobran|vale|seria|pago|cobra)|cuanto|caro|cara|mensualidad|cobran)\b/.test(t);
  if (precio && !/\b(recordatorio|sms|terminal|factura)/.test(t)) return estado.etapa === "nueva" ? { rama: "entrada", precioAlEntrar: true } : { rama: "precio" };

  const funcion = funcionDe(t);
  if (funcion && esPregunta(crudo, t)) return { rama: "funcion", funcion };

  const giro = giroDe(crudo);
  if (giro) return { rama: "giro", giro };
  if (/^(giro_estetica|estetica)$/.test(t)) return { rama: "giro", giro: "estetica" };

  if (/\b(probar|prueba|pruebo|registrar|registrarme|registro|crear (mi )?cuenta|abrir (mi )?cuenta|quiero empezar|como empiezo|darme de alta|lo quiero|me apunto)\b/.test(t)) return { rama: "prueba" };
  if (/^(hola|holaa|holi|ola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|info|informacion|mas informacion|quiero informacion|quiero info|me interesa|me interesa (la informacion|saber mas)|que es|que es peludesk|de que se trata|como funciona|hola buenas|hola buen dia|hola buenas tardes|hola info|hola quiero informacion|vi su anuncio)( .{0,40})?$/.test(t) || /\b(vi (la|su|tu) pagina|vi (el|su) anuncio|ref [a-z0-9]{5})\b/.test(t)) return { rama: "entrada" };
  if (/^(gracias|muchas gracias|ok|okay|va|vale|si|claro|perfecto|listo|de acuerdo|sale|esta bien|bueno)( gracias)?$/.test(t)) return { rama: "cortesia" };
  if (funcion) return { rama: "funcion", funcion };
  if (tambienCliente && /\b(cita|turno|mi perro|mi mascota)\b/.test(t)) return { rama: "cliente_mascota" };
  return null;
}

// ───────────────────────────── decidir

/** Lo que sigue según el paso en que iba (después de contestar una función o una pregunta que no supo). */
function retomar(estado: EstadoVentas, previo: string): Pieza[] {
  if (!estado.giro) return [{ tipo: "botones", cuerpo: [previo, PREGUNTA_GIRO].filter(Boolean).join("\n\n"), botones: BOTONES_GIRO }];
  if (estado.etapa === "calificacion") return [{ tipo: "texto", cuerpo: [previo, PASO2[estado.giro].pregunta].filter(Boolean).join("\n\n") }];
  return [{ tipo: "flow", cuerpo: [previo, CIERRE].filter(Boolean).join("\n\n"), punto: "cierre" }];
}

export function decidir(c: Clasificacion, previo: EstadoVentas, ctx: ContextoGuion, textoPersona: string): Decision {
  const estado: EstadoVentas = { ...previo, etapa: previo.etapa === "cerrada" ? "nueva" : previo.etapa };
  if (c.rama !== "desconocido") estado.desconocidas = 0;
  const flow = (cuerpo: string, punto: PuntoVentas): Pieza => ({ tipo: "flow", cuerpo, punto });
  const resumen = (motivo: string) => `${motivo}. Último mensaje: «${(textoPersona || "").slice(0, 200)}»${estado.giro ? ` · giro ${estado.giro}` : ""}`;

  switch (c.rama) {
    case "humano":
      return { rama: c.rama, estado, piezas: [{ tipo: "humano", acuse: ACUSE_HUMANO, resumen: resumen("Pide hablar con una persona") }] };
    case "sucursales":
      return { rama: c.rama, estado, piezas: [{ tipo: "humano", acuse: ACUSE_SUCURSALES, resumen: resumen("Negocio con varias sucursales") }] };
    case "no_interesa":
      return { rama: c.rama, estado: { ...estado, etapa: "cerrada" }, piezas: [{ tipo: "baja", cuerpo: TEXTO_NO_INTERESA }] };
    case "desconocido": {
      const n = previo.desconocidas + 1;
      if (n >= 2) return { rama: c.rama, estado: { ...estado, desconocidas: 0 }, piezas: [{ tipo: "humano", acuse: ACUSE_DESCONOCIDA, resumen: resumen("El bot no supo contestar dos veces seguidas") }] };
      return { rama: c.rama, estado: { ...estado, desconocidas: n }, piezas: retomar(estado, TEXTO_NO_LO_TENGO) };
    }
    case "ya_cuenta":
      return { rama: c.rama, estado, piezas: [flow(TEXTO_YA_CUENTA, "ya_cuenta")] };
    case "cliente_mascota":
      return { rama: c.rama, estado, piezas: [flow(TEXTO_CLIENTE_MASCOTA, "cliente")] };
    case "precio":
      return { rama: c.rama, estado, piezas: [flow(OBJECIONES.precio(ctx.mensual), "objecion")] };
    case "otro_sistema":
      return { rama: c.rama, estado, piezas: [flow(OBJECIONES.otro_sistema, "objecion")] };
    case "sin_tiempo":
      return { rama: c.rama, estado, piezas: [flow(OBJECIONES.sin_tiempo, "objecion")] };
    case "lo_pienso":
      return { rama: c.rama, estado, programarSeguimiento: true, piezas: [flow(OBJECIONES.lo_pienso(ctx.demo(estado.giro)), "objecion")] };
    case "funcion": {
      const r = (c.funcion && ctx.funcion(c.funcion)) || null;
      if (!r) return decidir({ rama: "desconocido" }, previo, ctx, textoPersona);
      if (!estado.giro) return { rama: c.rama, estado, piezas: retomar(estado, r) };
      return { rama: c.rama, estado, piezas: [flow(`${r}\n\n${CIERRE}`, "funcion")] };
    }
    case "giro": {
      const giro = c.giro ?? null;
      if (!giro) return decidir({ rama: "desconocido" }, previo, ctx, textoPersona);
      const p = PASO2[giro];
      return { rama: c.rama, giroNuevo: giro, estado: { ...estado, giro, etapa: "calificacion" }, piezas: [{ tipo: "texto", cuerpo: `${p.mensaje}\n\n${p.pregunta}` }] };
    }
    case "calificacion": {
      if (!estado.giro) return decidir({ rama: "entrada" }, previo, ctx, textoPersona);
      const dato = datoPorTamano(estado.giro, c.numero ?? null, c.sistema ?? null);
      return {
        rama: c.rama,
        estado: { ...estado, etapa: "cierre" },
        calificacion: { numero: c.numero ?? null, sistema: c.sistema ?? null, texto: (textoPersona || "").slice(0, 300) },
        piezas: [flow(`${dato}\n\n${CIERRE}`, "cierre")],
      };
    }
    case "prueba":
      return { rama: c.rama, estado: { ...estado, etapa: "cierre" }, piezas: [flow(TEXTO_PRUEBA, "cierre")] };
    case "cortesia":
      if (estado.etapa === "giro" || estado.etapa === "calificacion" || (estado.etapa === "nueva" && !estado.giro)) {
        return decidir({ rama: "entrada" }, previo, ctx, textoPersona);
      }
      return { rama: c.rama, estado: { ...estado, etapa: "cierre" }, piezas: [flow(TEXTO_CORTESIA, "cierre")] };
    case "entrada":
    default: {
      if (estado.giro) {
        if (estado.etapa === "calificacion") return { rama: "entrada", estado, piezas: [{ tipo: "texto", cuerpo: PASO2[estado.giro].pregunta }] };
        if (estado.etapa === "cierre") return { rama: "entrada", estado, piezas: [flow(CIERRE, "cierre")] };
        // Ya se sabe su giro (prospecto por ref, anuncio o teléfono): el paso 2 de una vez.
        const p = PASO2[estado.giro];
        const cuerpo = [QUE_ES, c.precioAlEntrar ? lineaPrecio(ctx.mensual) : null, p.mensaje, p.pregunta].filter(Boolean).join("\n\n");
        return { rama: "entrada", estado: { ...estado, etapa: "calificacion" }, piezas: [{ tipo: "texto", cuerpo }] };
      }
      const cuerpo = [QUE_ES, c.precioAlEntrar ? lineaPrecio(ctx.mensual) : null, PREGUNTA_GIRO].filter(Boolean).join("\n");
      return { rama: "entrada", estado: { ...estado, etapa: "giro" }, piezas: [{ tipo: "botones", cuerpo, botones: BOTONES_GIRO }] };
    }
  }
}
