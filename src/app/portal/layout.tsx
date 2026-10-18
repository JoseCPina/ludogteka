import { redirect } from "next/navigation";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { LogoNegocio } from "@/components/marca/logo-negocio";
import { AvisoPlan } from "@/components/aviso-plan";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { PortalShell } from "@/components/chrome/portal-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PwaNegocio } from "@/components/pwa/pwa-negocio";
import { AvisoInstalar } from "@/components/pwa/instalar";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesionConRol();
  if (!sesion) redirect("/login");
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
    <PortalShell marca={<LogoNegocio nombre={negocio.nombre} marca={negocio.marca} variante="barra" />} aviso={<><AvisoInstalar /><AvisoPlan esPersonal={false} /></>} nombreCompleto={nombre}>
      <PwaNegocio usuarioId={sesion.user.id} precargar={false} />
      {children}
    </PortalShell>
  );
}
