// El WhatsApp Flow «PeluDesk · Prueba gratis»: su Flow JSON (lo sube scripts/whatsapp/flow.mjs) y lo que decide cada
// pantalla del intercambio de datos. Sin imports de valores: lo usan la ruta, el script de Meta y la auditoría.
//
//   GIRO          lista de una sola opción (estética, hotel o guardería, veterinaria, varios)
//   DATOS         nombre del negocio, ciudad, nombre de quien lo registra, correo (opcional)
//   CONFIRMACION  resumen, casilla de términos y aviso, botón «Crear mi cuenta»
//
// El teléfono NO es un campo: es el de WhatsApp, el que Meta verificó, y lo pone el servidor (wa_flow_sesiones).

export const NOMBRE_FLOW = "PeluDesk · Prueba gratis";
export const CTA_FLOW = "Probar gratis";
export const VERSION_FLOW_JSON = "7.1";

export type Giro = "estetica" | "hotel_guarderia" | "veterinaria" | "varios";

export const GIROS: { id: Giro; title: string; servicios: string[] }[] = [
  { id: "estetica", title: "Estética canina", servicios: ["estetica"] },
  { id: "hotel_guarderia", title: "Hotel o guardería", servicios: ["guarderia", "hotel"] },
  { id: "veterinaria", title: "Veterinaria", servicios: ["veterinaria"] },
  { id: "varios", title: "Varios", servicios: ["estetica", "guarderia", "hotel"] },
];

export const esGiro = (x: unknown): x is Giro => GIROS.some((g) => g.id === x);
export const serviciosDeGiro = (g: Giro): string[] => GIROS.find((x) => x.id === g)!.servicios;
export const tituloDeGiro = (g: Giro): string => GIROS.find((x) => x.id === g)!.title;

/** El giro del CRM de prospectos (guarderia, hotel, estetica, veterinaria, mixto) en el del Flow. */
export function giroDeProspecto(giro: string | null | undefined): Giro | "" {
  switch (giro) {
    case "estetica":
      return "estetica";
    case "guarderia":
    case "hotel":
      return "hotel_guarderia";
    case "veterinaria":
      return "veterinaria";
    case "mixto":
      return "varios";
    default:
      return "";
  }
}

export type DatosFlow = { giro: Giro | ""; negocio: string; ciudad: string; nombre: string; correo: string };
export const DATOS_VACIOS: DatosFlow = { giro: "", negocio: "", ciudad: "", nombre: "", correo: "" };

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Lo que llega en el payload de una pantalla, recortado (nunca se confía en el largo que mande el cliente). */
export function leerDatos(p: Record<string, unknown> | null | undefined): DatosFlow {
  const giro = p?.giro;
  return {
    giro: esGiro(giro) ? giro : "",
    negocio: texto(p?.negocio, 80),
    ciudad: texto(p?.ciudad, 80),
    nombre: texto(p?.nombre, 80),
    correo: texto(p?.correo, 120).toLowerCase(),
  };
}

export type ErroresDatos = Partial<Record<"giro" | "negocio" | "ciudad" | "nombre" | "correo", string>>;

/** Las mismas reglas que /registro (nombre del negocio de 3 a 60 letras, nombre de la persona de 3 o más). */
export function validarDatos(d: DatosFlow): ErroresDatos {
  const e: ErroresDatos = {};
  if (!d.giro) e.giro = "Escoge el tipo de negocio.";
  if (d.negocio.length < 3 || d.negocio.length > 60) e.negocio = "Escribe el nombre de tu negocio (de 3 a 60 letras).";
  if (d.ciudad.length < 2) e.ciudad = "Escribe la ciudad de tu negocio.";
  if (d.nombre.length < 3) e.nombre = "Escribe tu nombre.";
  if (d.correo && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(d.correo)) e.correo = "Revisa tu correo o déjalo vacío.";
  return e;
}

export function resumenDatos(d: DatosFlow): string {
  return [
    `Negocio: ${d.negocio}`,
    `Giro: ${d.giro ? tituloDeGiro(d.giro) : "—"}`,
    `Ciudad: ${d.ciudad}`,
    `A nombre de: ${d.nombre}`,
    d.correo ? `Correo: ${d.correo}` : null,
    "Tu cuenta es tu número de WhatsApp. Son 15 días gratis, sin tarjeta.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Datos con los que se abre la pantalla de datos (los errores vacíos: el campo no marca nada). */
export function datosPantallaDatos(d: DatosFlow, errores: ErroresDatos = {}) {
  return {
    giro: d.giro,
    negocio: d.negocio,
    ciudad: d.ciudad,
    nombre: d.nombre,
    correo: d.correo,
    error_negocio: errores.negocio ?? "",
    error_ciudad: errores.ciudad ?? "",
    error_nombre: errores.nombre ?? "",
    error_correo: errores.correo ?? "",
  };
}

export function datosPantallaGiro(d: DatosFlow) {
  return { giros: GIROS.map(({ id, title }) => ({ id, title })), giro: d.giro, negocio: d.negocio, ciudad: d.ciudad, nombre: d.nombre, correo: d.correo };
}

export function datosPantallaConfirmacion(d: DatosFlow) {
  return { resumen: resumenDatos(d), giro: d.giro, negocio: d.negocio, ciudad: d.ciudad, nombre: d.nombre, correo: d.correo };
}

const cadena = (ejemplo: string) => ({ type: "string", __example__: ejemplo });

/** El Flow JSON que se sube a Meta. `urlTerminos` y `urlAviso`: los documentos legales de peludesk.mx. */
export function flowJson(urlTerminos: string, urlAviso: string) {
  const pasar = { giro: "${data.giro}", negocio: "${data.negocio}", ciudad: "${data.ciudad}", nombre: "${data.nombre}", correo: "${data.correo}" };
  return {
    version: VERSION_FLOW_JSON,
    data_api_version: "3.0",
    routing_model: { GIRO: ["DATOS"], DATOS: ["CONFIRMACION"], CONFIRMACION: [] },
    screens: [
      {
        id: "GIRO",
        title: "Prueba gratis",
        data: {
          giros: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } }, __example__: GIROS.map(({ id, title }) => ({ id, title })) },
          giro: cadena("estetica"),
          negocio: cadena("Huellitas"),
          ciudad: cadena("San Luis Potosí"),
          nombre: cadena("Ana López"),
          correo: cadena(""),
        },
        layout: {
          type: "SingleColumnLayout",
          children: [
            { type: "TextSubheading", text: "¿Qué tipo de negocio tienes?" },
            { type: "TextBody", text: "Con esto dejamos listo lo que vas a usar. Lo puedes cambiar después." },
            { type: "RadioButtonsGroup", name: "giro", label: "Tu negocio", required: true, "data-source": "${data.giros}", "init-value": "${data.giro}" },
            {
              type: "Footer",
              label: "Continuar",
              "on-click-action": { name: "navigate", next: { type: "screen", name: "DATOS" }, payload: { ...pasar, giro: "${form.giro}", error_negocio: "", error_ciudad: "", error_nombre: "", error_correo: "" } },
            },
          ],
        },
      },
      {
        id: "DATOS",
        title: "Tu negocio",
        data: {
          giro: cadena("estetica"),
          negocio: cadena("Huellitas"),
          ciudad: cadena("San Luis Potosí"),
          nombre: cadena("Ana López"),
          correo: cadena(""),
          error_negocio: cadena(""),
          error_ciudad: cadena(""),
          error_nombre: cadena(""),
          error_correo: cadena(""),
        },
        layout: {
          type: "SingleColumnLayout",
          children: [
            { type: "TextInput", name: "negocio", label: "Nombre del negocio", "input-type": "text", required: true, "max-chars": 60, "init-value": "${data.negocio}", "error-message": "${data.error_negocio}" },
            { type: "TextInput", name: "ciudad", label: "Ciudad", "input-type": "text", required: true, "max-chars": 80, "init-value": "${data.ciudad}", "error-message": "${data.error_ciudad}" },
            { type: "TextInput", name: "nombre", label: "Tu nombre", "input-type": "text", required: true, "max-chars": 80, "init-value": "${data.nombre}", "error-message": "${data.error_nombre}" },
            {
              type: "TextInput",
              name: "correo",
              label: "Correo (opcional)",
              "input-type": "email",
              required: false,
              "max-chars": 120,
              "helper-text": "Para mandarte avisos de tu cuenta.",
              "init-value": "${data.correo}",
              "error-message": "${data.error_correo}",
            },
            {
              type: "Footer",
              label: "Continuar",
              "on-click-action": {
                name: "data_exchange",
                payload: { pantalla: "DATOS", giro: "${data.giro}", negocio: "${form.negocio}", ciudad: "${form.ciudad}", nombre: "${form.nombre}", correo: "${form.correo}" },
              },
            },
          ],
        },
      },
      {
        id: "CONFIRMACION",
        title: "Confirma tus datos",
        terminal: true,
        success: true,
        data: {
          resumen: cadena("Negocio: Huellitas"),
          giro: cadena("estetica"),
          negocio: cadena("Huellitas"),
          ciudad: cadena("San Luis Potosí"),
          nombre: cadena("Ana López"),
          correo: cadena(""),
        },
        layout: {
          type: "SingleColumnLayout",
          children: [
            { type: "TextSubheading", text: "Así se abre tu cuenta" },
            { type: "TextBody", text: "${data.resumen}" },
            {
              type: "OptIn",
              name: "acepto",
              label: "Acepto los términos y el aviso de privacidad de PeluDesk.",
              required: true,
              "on-click-action": { name: "open_url", url: urlTerminos },
            },
            { type: "EmbeddedLink", text: "Leer el aviso de privacidad", "on-click-action": { name: "open_url", url: urlAviso } },
            {
              type: "Footer",
              label: "Crear mi cuenta",
              "on-click-action": { name: "data_exchange", payload: { pantalla: "CONFIRMACION", ...pasar, acepto: "${form.acepto}" } },
            },
          ],
        },
      },
    ],
  };
}
