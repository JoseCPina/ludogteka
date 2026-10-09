import { redirect } from "next/navigation";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { navStaffPara } from "@/lib/nav/config";
import { StaffShell } from "@/components/chrome/staff-shell";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { LogoNegocio } from "@/components/marca/logo-negocio";
import { AvisoPlan } from "@/components/aviso-plan";
import { ProveedorModulos } from "@/components/modulos-contexto";
import { articulosDelNegocio } from "@/lib/ayuda";
import { AvisoTickets } from "@/components/ayuda/aviso-tickets";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cargarTutorialesVisibles } from "@/lib/tutoriales";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesionConRol();
  if (!sesion) redirect("/login");
  const negocio = await cargarNegocioLanding();
  const conAyuda = sesion.rol === "admin" || sesion.rol === "recepcion";
  // Los videos de la serie que esta persona ve (publicados, de sus módulos).
  // Nunca rompe la pantalla: sin videos, simplemente no hay «¿Cómo se hace?».
  const videos = conAyuda
    ? await cargarTutorialesVisibles(await createSupabaseServerClient(), { rol: sesion.rol, permisos: sesion.permisos, modulos: sesion.modulos }).catch(() => [])
    : [];

  return (
    <StaffShell
      marca={<LogoNegocio nombre={negocio.nombre} marca={negocio.marca} variante="barra" />}
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
      videos={videos.map((v) => ({ slug: v.slug, rutas: v.rutas }))}
      ayuda={conAyuda ? articulosDelNegocio(sesion.modulos).map((a) => ({ slug: a.slug, rutas: a.rutas })) : undefined}
    >
      <ProveedorModulos modulos={sesion.modulos}>{children}</ProveedorModulos>
    </StaffShell>
  );
}
