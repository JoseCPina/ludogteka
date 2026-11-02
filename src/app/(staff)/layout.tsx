import { textoSinNombre } from "@/lib/personal/nombres";
import { redirect } from "next/navigation";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { navStaffPara } from "@/lib/nav/config";
import { StaffShell } from "@/components/chrome/staff-shell";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { LogoNegocio } from "@/components/marca/logo-negocio";
import { AvisoPlan } from "@/components/aviso-plan";
import { ProveedorModulos } from "@/components/modulos-contexto";
import { ProveedorAcceso } from "@/components/acceso-contexto";
import { accesoDeSesion } from "@/lib/auth/acceso";
import { articulosDelNegocio } from "@/lib/ayuda";
import { AvisoTickets } from "@/components/ayuda/aviso-tickets";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tutorialesDeSesion } from "@/lib/tutoriales/de-sesion";
import { PwaNegocio } from "@/components/pwa/pwa-negocio";
import { AvisoInstalar } from "@/components/pwa/instalar";
import { PedirNombre } from "@/components/personal/pedir-nombre";
import { PestanaConcurrencia } from "@/components/concurrencia/pestana";
import { ProveedorEscritura } from "@/components/escritura-contexto";
import { bloqueoDeEscritura } from "@/lib/cobro/bloqueo-escritura-servidor";
import { avisarEsteticaApagada, etiquetaDeSesion } from "@/lib/auth/rutas";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesionConRol();
  if (!sesion) redirect("/login");
  const conAyuda = sesion.rol === "admin" || sesion.rol === "recepcion";
  // QA S19 (rendimiento): el negocio, «Tus negocios» y los videos se piden a la vez (antes, uno tras otro en cada
  // pantalla y en cada acción que la repinta).
  // Los videos de la serie que esta persona ve (publicados, de sus módulos).
  // Nunca rompe la pantalla: sin videos, simplemente no hay «¿Cómo se hace?».
  // «Tus negocios»: donde trabaja esta persona, con las sucursales del mismo dueño juntas.
  const supabase = await createSupabaseServerClient();
  const [negocio, { data: suyos }, videos, bloqueo] = await Promise.all([
    cargarNegocioLanding(),
    supabase.rpc("mis_negocios"),
    conAyuda
      ? tutorialesDeSesion()
      : Promise.resolve([]),
    // QA N151: prueba vencida o falta de pago → todo lo que escribe se ve deshabilitado (el mismo indicador que la franja).
    bloqueoDeEscritura(),
  ]);
  // QA S53 (N156): la zona (inicio, etiqueta, aviso de Estética apagada) sale del rol, los módulos y la designación de médico.
  const zonaSesion = { rol: sesion.rol, modulos: sesion.modulos, accesoVeterinaria: sesion.accesoVeterinaria, esMedico: sesion.esMedico };
  const negocios = ((suyos ?? []) as { id: string; nombre: string; rol: string; grupo_id: string; grupo_nombre: string; es_principal: boolean }[])
    .filter((n) => ["admin", "recepcion", "estetica"].includes(n.rol))
    .map((n) => ({ id: n.id, nombre: n.nombre, grupoId: n.grupo_id, grupoNombre: n.grupo_nombre, esPrincipal: n.es_principal, actual: n.id === negocio.id }));

  return (
    <StaffShell
      marca={<LogoNegocio nombre={negocio.nombre} marca={negocio.marca} variante="barra" />}
      aviso={
        <>
          <AvisoInstalar />
          <AvisoPlan esPersonal />
          {avisarEsteticaApagada(zonaSesion) && (
            <p role="status" className="rounded-lg border border-ambar-oscuro/30 bg-ambar-suave px-4 py-3 text-sm text-ambar-oscuro" data-modulo-apagado-aviso>
              El módulo de Estética está apagado en este negocio. Lo enciende quien administra, en «Módulos y plan». Mientras tanto puedes usar lo que sí tienes en el menú.
            </p>
          )}
          {conAyuda && <AvisoTickets />}
        </>
      }
      rol={sesion.rol}
      etiquetaRol={etiquetaDeSesion(zonaSesion)}
      nombreCompleto={sesion.nombreCompleto ?? textoSinNombre(sesion.user.email, sesion.rol === "admin")}
      items={navStaffPara(sesion.rol, sesion.permisos, sesion.modulos, sesion.accesoVeterinaria, sesion.esMedico)}
      negocios={negocios}
      videos={videos.map((v) => ({ slug: v.slug, rutas: v.rutas }))}
      ayuda={conAyuda ? articulosDelNegocio(sesion.modulos).map((a) => ({ slug: a.slug, rutas: a.rutas })) : undefined}
    >
      <PwaNegocio usuarioId={sesion.user.id} />
      {/* N120: el id de esta pestaña viaja en cada petición (control de concurrencia por pestaña). */}
      <PestanaConcurrencia />
      {/* N24: una cuenta del personal sin nombre lo escribe una vez antes de seguir. */}
      {!sesion.nombreCompleto && ["admin", "recepcion", "estetica"].includes(sesion.rol) ? (
        <PedirNombre />
      ) : (
        <ProveedorModulos modulos={sesion.modulos}>
          <ProveedorAcceso acceso={accesoDeSesion(sesion)!}>
            <ProveedorEscritura bloqueo={bloqueo}>{children}</ProveedorEscritura>
          </ProveedorAcceso>
        </ProveedorModulos>
      )}
    </StaffShell>
  );
}
