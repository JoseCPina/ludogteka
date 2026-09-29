import { redirect } from "next/navigation";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { navStaffPara } from "@/lib/nav/config";
import { StaffShell } from "@/components/chrome/staff-shell";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { MarcaDelNegocio } from "@/components/marca/marca-negocio";
import { AvisoPlan } from "@/components/aviso-plan";
import { ProveedorModulos } from "@/components/modulos-contexto";
import { articulosDelNegocio } from "@/lib/ayuda";
import { AvisoTickets } from "@/components/ayuda/aviso-tickets";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesionConRol();
  if (!sesion) redirect("/login");
  const negocio = await cargarNegocioLanding();
  const conAyuda = sesion.rol === "admin" || sesion.rol === "recepcion";

  return (
    <StaffShell
      marca={<MarcaDelNegocio nombre={negocio.nombre} marca={negocio.marca} />}
      aviso={
        <>
          <AvisoPlan esPersonal />
          {conAyuda && <AvisoTickets />}
        </>
      }
      rol={sesion.rol}
      email={sesion.user.email ?? ""}
      nombreCompleto={sesion.nombreCompleto}
      items={navStaffPara(sesion.rol, sesion.permisos, sesion.modulos)}
      ayuda={conAyuda ? articulosDelNegocio(sesion.modulos).map((a) => ({ slug: a.slug, rutas: a.rutas })) : undefined}
    >
      <ProveedorModulos modulos={sesion.modulos}>{children}</ProveedorModulos>
    </StaffShell>
  );
}
