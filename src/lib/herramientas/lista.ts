// Las herramientas públicas de peludesk.mx: la lista de la que salen el índice /herramientas, el sitemap, llms.txt,
// los enlaces cruzados y la medición. Una herramienta nueva se agrega aquí (y su ruta en el middleware, en
// PUBLICAS_PLATAFORMA). Sin imports: lo leen las páginas, el bot y las auditorías con Node directo.

export type Herramienta = {
  clave: string;
  ruta: string;
  nombre: string;
  /** Una línea: qué hace. */
  que: string;
  /** Una línea: de dónde salen sus datos. */
  datos: string;
  /** Giros a los que sirve. */
  giros: ("estetica" | "hotel" | "guarderia" | "veterinaria")[];
  /** Está construida y publicada. Las que no, no salen en ningún lado. */
  publicada: boolean;
  /** Lo que la app hace con lo que la persona capturó al abrir su prueba. */
  precarga?: string;
};

export const HERRAMIENTAS: Herramienta[] = [
  {
    clave: "precios-mercado",
    ruta: "/precios-mercado",
    nombre: "Índice PeluDesk de precios",
    que: "Cuánto cobran las estéticas, hoteles, guarderías y veterinarias de tu ciudad por cada servicio, y dónde queda tu precio.",
    datos: "Precios públicos de sitios web y reseñas de Google de negocios reales de México, lo que capturan quienes usan esta herramienta y las tarifas de negocios de PeluDesk que lo autorizan, solo como promedio.",
    giros: ["estetica", "hotel", "guarderia", "veterinaria"],
    publicada: true,
    precarga: "El precio que escribiste queda como tarifa en tu cuenta, marcada «Calculado» hasta que la confirmes.",
  },
  {
    clave: "directorio",
    ruta: "/directorio",
    nombre: "Directorio de negocios",
    que: "Los negocios de cada giro y ciudad, con sus datos de Google; si es el tuyo, lo reclamas y queda como tu página.",
    datos: "Google Maps, mostrados en vivo con su atribución; calificación y reseñas al día de la última búsqueda.",
    giros: ["estetica", "hotel", "guarderia", "veterinaria"],
    publicada: true,
    precarga: "Al reclamar tu ficha y abrir tu prueba, queda publicada como tu página web con la insignia «Negocio verificado».",
  },
  {
    clave: "lista-de-precios",
    ruta: "/lista-de-precios",
    nombre: "Generador de lista de precios",
    que: "Captura tus servicios con precio y recibe tu lista en PDF e imagen, lista para mandar por WhatsApp o imprimir.",
    datos: "Lo que tú capturas; si hay datos, el rango de tu ciudad al lado de cada servicio. La imagen y el PDF se dibujan en tu navegador.",
    giros: ["estetica", "hotel", "guarderia", "veterinaria"],
    publicada: true,
    precarga: "Tus servicios y precios quedan como tarifas en tu cuenta, marcadas «Calculado» hasta que las confirmes.",
  },
  {
    clave: "contrato",
    ruta: "/contrato-guarderia-hotel",
    nombre: "Generador de contrato",
    que: "Un contrato de guardería y hotel (o condiciones de servicio de estética) con tus políticas, en PDF con tu nombre.",
    datos: "La plantilla general de contrato de PeluDesk, con opciones ya redactadas; el PDF se arma en tu navegador.",
    giros: ["hotel", "guarderia", "estetica"],
    publicada: true,
    precarga: "El contrato queda en tu cuenta, listo para que tus clientes lo firmen desde el celular.",
  },
  {
    clave: "mapa-competencia",
    ruta: "/mapa-competencia",
    nombre: "Mapa de competencia",
    que: "Cuántos negocios de tu giro hay a 1, 2 y 5 km de una dirección, su calificación promedio y las zonas con menos cobertura.",
    datos: "Google Maps (los negocios del Directorio PeluDesk con ubicación) y la población municipal del INEGI (Censo 2020).",
    giros: ["estetica", "hotel", "guarderia", "veterinaria"],
    publicada: true,
  },
  {
    clave: "costo-por-servicio",
    ruta: "/costo-por-servicio",
    nombre: "Costo por servicio",
    que: "Cuánto te cuesta de verdad un baño o una noche (insumos, agua, luz, renta, mano de obra) y tu margen contra tu precio y el de tu ciudad.",
    datos: "Precios de referencia de insumos de páginas públicas de Mercado Libre y Amazon México, y el Índice PeluDesk de precios.",
    giros: ["estetica", "hotel", "guarderia", "veterinaria"],
    publicada: false,
  },
  {
    clave: "mensajes-whatsapp",
    ruta: "/mensajes-whatsapp",
    nombre: "Mensajes de WhatsApp",
    que: "Plantillas de confirmación, recordatorio, listo para recoger, cobro pendiente y más, con el nombre de tu negocio, para copiar.",
    datos: "Escritas por PeluDesk; tú les pones tu nombre y el de la mascota. Nada se guarda.",
    giros: ["estetica", "hotel", "guarderia", "veterinaria"],
    publicada: true,
  },
  {
    clave: "diagnostico",
    ruta: "/diagnostico",
    nombre: "Diagnóstico de rentabilidad",
    que: "Diez preguntas sobre tu negocio, un puntaje de 0 a 100 y cuánto dinero se te va al mes, calculado con tus números.",
    datos: "Tus respuestas, con supuestos conservadores que se dicen en cada cuenta.",
    giros: ["estetica", "hotel", "guarderia", "veterinaria"],
    publicada: true,
  },
  {
    clave: "comisiones",
    ruta: "/comisiones-groomers",
    nombre: "Calculadora de comisiones",
    que: "Cuánto se lleva la estilista y cuánto el negocio con la semana que capturas, en los tres esquemas: porcentaje, por servicio o sueldo más comisión.",
    datos: "Lo que tú capturas; nada se guarda.",
    giros: ["estetica"],
    publicada: true,
  },
  {
    clave: "escuela",
    ruta: "/escuela",
    nombre: "Escuela PeluDesk",
    que: "Seis sesiones gratuitas sobre precios, agenda, costos de abrir, caja, clientes que vuelven y lo que te van a pedir.",
    datos: "Las sesiones en vivo, su grabación y la guía escrita de cada tema, con la herramienta que le toca.",
    giros: ["estetica", "hotel", "guarderia", "veterinaria"],
    publicada: true,
  },
];

export const herramientasPublicadas = () => HERRAMIENTAS.filter((h) => h.publicada);
export const herramientaPorClave = (clave: string) => HERRAMIENTAS.find((h) => h.clave === clave) ?? null;
export const esHerramienta = (clave: string) => HERRAMIENTAS.some((h) => h.clave === clave);

/** El link a la prueba gratis desde una herramienta: la fuente queda en el prospecto y en la medición. */
export function registroDesdeHerramienta(clave: string, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ utm_source: "herramientas", utm_medium: clave, ...extra });
  return `/registro?${q}`;
}
