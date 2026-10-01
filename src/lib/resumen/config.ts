/**
 * Configuración del resumen diario de PeluDesk (Telegram). Lo de la marca y
 * de la campaña vive aquí; lo que cambia la persona (hora, secciones,
 * umbrales, pausa) vive en resumen_ajustes y se edita en /plataforma/resumen.
 */
export const ZONA = "America/Mexico_City";

/** La campaña de PeluDesk en la cuenta publicitaria compartida con Checaíto: SOLO esta se mide. */
export const CAMPANA_ID = "120253088985310589";
export const CAMPANA_NOMBRE_CONTIENE = "PeluDesk";
export const CUENTA_PUBLICITARIA = "act_1352741180271668";
/** utm_campaign de los links de los anuncios (scripts/ads/campana-registros.mjs). */
export const UTM_CAMPANA = "registros-oct26";
export const PRESUPUESTO_MES_PESOS = 8000;
export const RITMO_DIARIO_PESOS = 265;

/** Nombre del anuncio en Meta → su utm_content (el video). */
export const ANUNCIO_UTM: Record<string, string> = {
  "Ese perro no está vacunado": "ese-perro-no-esta-vacunado",
  "Tu corte de caja, sin sorpresas": "corte-de-caja",
  "Un día en tu guardería": "un-dia-en-tu-guarderia",
};

export const SECCIONES = [
  { clave: "publicaciones", texto: "Publicaciones" },
  { clave: "comentarios", texto: "Comentarios" },
  { clave: "chats", texto: "Chats de WhatsApp" },
  { clave: "negocios", texto: "Negocios (registros, pruebas, cobro)" },
  { clave: "seguidores", texto: "Seguidores" },
  { clave: "campana", texto: "Campaña" },
] as const;
export type Seccion = (typeof SECCIONES)[number]["clave"];

export const DEFAULTS = { hora: 8, umbral_gasto: 100, umbral_horas: 2 };
/** Telegram admite 4096; se parte antes para dejar margen al HTML. */
export const TOPE_MENSAJE = 4000;
