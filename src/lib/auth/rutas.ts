export function rutaPorRol(rol: string | null | undefined): string {
  switch (rol) {
    case "admin":
      return "/admin";
    case "recepcion":
      return "/recepcion";
    case "estetica":
      return "/estetica";
    default:
      return "/portal";
  }
}

/**
 * QA S53 (N156): la zona de una persona del personal (su inicio, la etiqueta bajo su nombre y si le toca el aviso de
 * «Estética apagada») sale de su ROL, de los MÓDULOS activos del negocio y de su designación de médico, en un solo
 * lugar. Antes salían del rol a secas: el médico veterinario invitado con el rol de estética (no hay otro rol para
 * invitarlo) veía «ESTÉTICA» bajo su nombre y el aviso de que Estética está apagada en una clínica que nunca la tuvo,
 * aunque el middleware (QA S16, N80) ya lo mandaba a la agenda clínica.
 */
export type SesionDeZona = {
  rol: string;
  modulos: readonly string[];
  accesoVeterinaria?: boolean;
  esMedico?: boolean;
};

const ETIQUETAS_ROL: Record<string, string> = {
  admin: "Admin",
  recepcion: "Recepción",
  estetica: "Estética",
};

function esteticaSinModulo(s: SesionDeZona): boolean {
  return s.rol === "estetica" && !s.modulos.includes("estetica");
}

function trabajaEnVeterinaria(s: SesionDeZona): boolean {
  return s.modulos.includes("veterinaria") && (s.esMedico === true || s.accesoVeterinaria === true);
}

/** A dónde entra: /admin, /recepcion, /estetica; estética sin su módulo va a Veterinaria (si trabaja ahí) o a su asistencia. */
export function inicioDeSesion(s: SesionDeZona): string {
  if (esteticaSinModulo(s)) {
    if (trabajaEnVeterinaria(s)) return "/veterinaria";
    if (s.modulos.includes("empleados")) return "/mi-trabajo";
  }
  return rutaPorRol(s.rol);
}

/** La etiqueta bajo el nombre: lo que la persona ES en este negocio, nunca un módulo que no tiene. */
export function etiquetaDeSesion(s: SesionDeZona): string {
  if (s.esMedico === true && s.modulos.includes("veterinaria")) return "Médico veterinario";
  if (esteticaSinModulo(s)) {
    if (trabajaEnVeterinaria(s)) return "Veterinaria";
    if (s.modulos.includes("empleados")) return "Equipo";
  }
  return ETIQUETAS_ROL[s.rol] ?? s.rol;
}

/** El aviso «El módulo de Estética está apagado» es solo para quien de verdad se quedó sin su zona. */
export function avisarEsteticaApagada(s: SesionDeZona): boolean {
  return esteticaSinModulo(s) && !trabajaEnVeterinaria(s);
}
