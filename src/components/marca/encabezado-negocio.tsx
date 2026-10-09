import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { LogoNegocio, type VarianteLogo } from "./logo-negocio";

// La marca del negocio del dominio, lista para ponerse arriba de una
// pantalla que ve el público (login, alta por link, sin acceso). Lee su
// configuración una vez por petición (cargarNegocioLanding va en caché).
// `banner`: dentro de una franja con el color de su marca (alta por link).
export async function EncabezadoNegocio({ banner = false, variante, className = "" }: { banner?: boolean; variante?: VarianteLogo; className?: string }) {
  const negocio = await cargarNegocioLanding();
  return <LogoNegocio nombre={negocio.nombre} marca={negocio.marca} variante={variante ?? (banner ? "banner" : "encabezado")} className={className} />;
}
