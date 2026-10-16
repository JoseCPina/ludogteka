// Dos sesiones que no se pisan (N12, QA externa del 16 de octubre de 2026): el personal del negocio y el portal del
// dueño de la mascota viven en el mismo navegador y el mismo dominio, y con UNA cookie de sesión entrar al portal
// (o abrir un link de alta) cerraba la sesión del admin. Cada área guarda su sesión en su propia cookie:
//   · «personal»: la cookie de siempre (sb-<proyecto>-auth-token).
//   · «portal»:   sb-<proyecto>-portal-auth-token.
// El área la decide la RUTA (el middleware la pasa en un encabezado a los componentes de servidor; el navegador la
// saca de location.pathname). Quien inicia sesión cae en el área que le toca por su ROL (cliente → portal).
export type AreaSesion = "personal" | "portal";

export const ENCABEZADO_AREA = "x-sesion-area";

// /alta y /activar son el camino del dueño hacia su portal (crean o reconocen su cuenta y lo dejan adentro).
export function areaDeRuta(pathname: string): AreaSesion {
  return /^\/(portal|alta|activar)(\/|$)/.test(pathname) ? "portal" : "personal";
}

export function areaDeEncabezado(valor: string | null | undefined): AreaSesion {
  return valor === "portal" ? "portal" : "personal";
}

export function nombreCookieSesion(area: AreaSesion): string | undefined {
  if (area === "personal") return undefined;
  const referencia = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  return `sb-${referencia}-portal-auth-token`;
}

export function opcionesCookieSesion(area: AreaSesion): { name: string } | undefined {
  const name = nombreCookieSesion(area);
  return name ? { name } : undefined;
}
