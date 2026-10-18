// Catálogos del CRM de prospectos (/plataforma/prospectos). Sin imports: también los lee
// scripts/prospectos/buscar.mjs con Node directo.

export const GIROS = [
  { clave: "guarderia", texto: "Guardería" },
  { clave: "hotel", texto: "Hotel" },
  { clave: "estetica", texto: "Estética" },
  { clave: "veterinaria", texto: "Veterinaria" },
  { clave: "mixto", texto: "Mixto" },
] as const;

export const ETAPAS = [
  { clave: "nuevo", texto: "Nuevo" },
  { clave: "contactado", texto: "Contactado" },
  { clave: "caliente", texto: "Caliente" },
  { clave: "respondio", texto: "Respondió" },
  { clave: "en_prueba", texto: "En prueba" },
  { clave: "pagando", texto: "Pagando" },
  { clave: "descartado", texto: "Descartado" },
] as const;

export const CANALES = [
  { clave: "whatsapp", texto: "WhatsApp" },
  { clave: "llamada", texto: "Llamada" },
  { clave: "correo", texto: "Correo" },
  { clave: "instagram", texto: "Instagram" },
  { clave: "facebook", texto: "Facebook" },
  { clave: "visita", texto: "Visita" },
  { clave: "otro", texto: "Otro" },
] as const;

export type Giro = (typeof GIROS)[number]["clave"];
export type Etapa = (typeof ETAPAS)[number]["clave"];

const textoDe = (lista: readonly { clave: string; texto: string }[], clave: string | null | undefined) =>
  lista.find((x) => x.clave === clave)?.texto ?? clave ?? "";

export const textoGiro = (g: string | null | undefined) => textoDe(GIROS, g);
export const textoEtapa = (e: string | null | undefined) => textoDe(ETAPAS, e);
export const textoCanal = (c: string | null | undefined) => textoDe(CANALES, c);

export const esGiro = (g: string): g is Giro => GIROS.some((x) => x.clave === g);
export const esEtapa = (e: string): e is Etapa => ETAPAS.some((x) => x.clave === e);
export const esCanal = (c: string) => CANALES.some((x) => x.clave === c);
