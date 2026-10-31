import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ENCABEZADO_RUTA, RUTA_CAMBIO_PORTAL, debeCambiarPassword } from "@/lib/auth/cambio-obligatorio";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { LogoNegocio } from "@/components/marca/logo-negocio";
import { AvisoPlan } from "@/components/aviso-plan";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { PortalShell } from "@/components/chrome/portal-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PwaNegocio } from "@/components/pwa/pwa-negocio";
import { AvisoInstalar } from "@/components/pwa/instalar";
import { AvisoAppPortal } from "@/components/app/aviso-app-portal";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesionConRol();
  if (!sesion) redirect("/login");
  // R35: la segunda red de la contraseña temporal (la primera es el middleware): cubre las pantallas que Next pinta
  // dentro de la respuesta de una acción, que no pasan por el middleware.
  if (debeCambiarPassword(sesion.user) && (await headers()).get(ENCABEZADO_RUTA) !== RUTA_CAMBIO_PORTAL) redirect(RUTA_CAMBIO_PORTAL);
  const negocio = await cargarNegocioLanding();

  // N9: el saludo usa el NOMBRE del expediente de ESTE negocio (el mismo que el cuerpo de la portada). Si no hay
  // nombre, no se saluda con el teléfono ni con el correo: la cabecera queda sin saludo. El correo interno no se
  // enseña nunca — ver el comentario de PortalShell.
  const supabase = await createSupabaseServerClient();
  const { data: cliente } = sesion.clienteId
    ? await supabase.from("clientes").select("nombre").eq("id", sesion.clienteId).maybeSingle()
    : { data: null };
  const nombre = ((cliente?.nombre as string | null | undefined) ?? sesion.nombreCompleto ?? "").trim() || null;

  return (
    <PortalShell marca={<LogoNegocio nombre={negocio.nombre} marca={negocio.marca} variante="barra" />} aviso={<><AvisoAppPortal /><AvisoInstalar /><AvisoPlan esPersonal={false} /></>} nombreCompleto={nombre}>
      <PwaNegocio usuarioId={sesion.user.id} precargar={false} />
      {children}
    </PortalShell>
  );
}
