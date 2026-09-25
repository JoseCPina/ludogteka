export type ResultadoPlataforma = {
  error: string | null;
  exito?: string;
  ir?: string;
  // Link de un solo uso para que el primer admin escoja su contraseña.
  link?: string;
  // Contraseña temporal (soporte).
  password?: string;
  urlWhatsApp?: string;
};

// Zonas horarias que se ofrecen al dar de alta un negocio (México). La
// base acepta cualquier zona válida; esta es la lista corta.
export const ZONAS_MEXICO: { zona: string; etiqueta: string }[] = [
  { zona: "America/Mexico_City", etiqueta: "Centro (CDMX, SLP, Guadalajara, Monterrey…)" },
  { zona: "America/Monterrey", etiqueta: "Monterrey" },
  { zona: "America/Cancun", etiqueta: "Sureste (Cancún, Quintana Roo)" },
  { zona: "America/Chihuahua", etiqueta: "Chihuahua" },
  { zona: "America/Mazatlan", etiqueta: "Pacífico (Sinaloa, Nayarit, BCS)" },
  { zona: "America/Hermosillo", etiqueta: "Sonora" },
  { zona: "America/Tijuana", etiqueta: "Noroeste (Tijuana, Baja California)" },
  { zona: "America/Ciudad_Juarez", etiqueta: "Ciudad Juárez" },
  { zona: "America/Matamoros", etiqueta: "Frontera noreste (Matamoros, Reynosa)" },
];
