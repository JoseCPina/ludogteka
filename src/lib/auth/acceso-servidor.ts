import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { accesoDeSesion, puedeAbrir } from "@/lib/auth/acceso";

/** En una página de servidor: `const puede = await puedeAbrirEnServidor(); puede("/clientes/nuevo")`. */
export async function puedeAbrirEnServidor(): Promise<(href: string) => boolean> {
  const acceso = accesoDeSesion(await obtenerSesionConRol());
  return (href) => puedeAbrir(acceso, href);
}
