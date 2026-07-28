import { redirect } from "next/navigation";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { PortalShell } from "@/components/chrome/portal-shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesionConRol();
  if (!sesion) redirect("/login");

  return (
    <PortalShell email={sesion.user.email ?? ""} nombreCompleto={sesion.nombreCompleto}>
      {children}
    </PortalShell>
  );
}
