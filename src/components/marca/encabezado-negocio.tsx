import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { MarcaDelNegocio } from "./marca-negocio";

// La marca del negocio del dominio, lista para ponerse arriba de una
// pantalla que ve el público (login, alta por link, sin acceso). Lee su
// configuración una vez por petición (cargarNegocioLanding va en caché).
export async function EncabezadoNegocio({ tamano = "grande", className = "" }: { tamano?: "normal" | "grande"; className?: string }) {
  const negocio = await cargarNegocioLanding();
  return <MarcaDelNegocio nombre={negocio.nombre} marca={negocio.marca} tamano={tamano} className={className} />;
}
