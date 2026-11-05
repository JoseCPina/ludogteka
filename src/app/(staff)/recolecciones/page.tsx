import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { accesoDeSesion, puedeAbrir } from "@/lib/auth/acceso";
import { zonaActual } from "@/lib/negocio/actual";
import { hoyNegocio, sumarDiasFecha, formatearFechaCalendario } from "@/lib/formato";
import { recoleccionesDelDia, puntosDePartida } from "@/lib/recoleccion/servidor";
import { EnlacePestana } from "@/components/ui/enlace-pestana";
import { EnlaceOTexto } from "@/components/acceso-contexto";
import { Field } from "@/components/ui/field";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import { ListaRecolecciones } from "./lista-recolecciones";

export const metadata = { title: "Recolecciones" };

// La ruta del día: las recolecciones de una fecha, agrupadas por punto de partida y ordenadas por cercanía, con «Cómo
// llegar», salir / recogido y cancelar con motivo. Hoy por omisión; ayer y mañana a un toque; cualquier día con el filtro.
export default async function RecoleccionesPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const sesion = await obtenerSesionConRol();
  if (!sesion || !puedeAbrir(accesoDeSesion(sesion), "/recolecciones")) redirect("/recepcion");
  const zona = await zonaActual();
  const hoy = hoyNegocio(zona);
  const { fecha: fechaParam } = await searchParams;
  const fecha = fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : hoy;
  const supabase = await createSupabaseServerClient();
  const [filas, puntos] = await Promise.all([recoleccionesDelDia(supabase, fecha), puntosDePartida(supabase)]);
  const sinUbicar = !puntos.negocio?.lat;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Recolecciones</h1>
        <p className="mt-1 max-w-3xl text-n-600">
          Lo que la camioneta recoge {fecha === hoy ? "hoy" : `el ${formatearFechaCalendario(fecha)}`}, en el orden de la ruta: primero lo que sale del local, luego lo que sale de la base, de lo más cerca a lo más lejos.
          Cada recolección viene de su reserva o cita; el cargo ya está en la cuenta.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Día">
          <EnlacePestana href={`/recolecciones?fecha=${sumarDiasFecha(hoy, -1)}`} activo={fecha === sumarDiasFecha(hoy, -1)}>Ayer</EnlacePestana>
          <EnlacePestana href="/recolecciones" activo={fecha === hoy}>Hoy</EnlacePestana>
          <EnlacePestana href={`/recolecciones?fecha=${sumarDiasFecha(hoy, 1)}`} activo={fecha === sumarDiasFecha(hoy, 1)}>Mañana</EnlacePestana>
        </nav>
        <form method="get" role="search" className="flex flex-wrap items-end gap-2">
          <Field label="Otro día" name="fecha" type="date" defaultValue={fecha} />
          <BotonEnviar variante="secundario" tamano="compacto">Ver</BotonEnviar>
        </form>
      </div>
      {sinUbicar && (
        <p className="text-sm text-ambar-oscuro">
          El negocio no está ubicado en el mapa: la ruta no puede ordenarse por cercanía ni calcular km solos. Un admin lo ubica en <EnlaceOTexto href="/admin#ubicacion">su panel</EnlaceOTexto>, en la sección «Ubicación».
        </p>
      )}
      <ListaRecolecciones filas={filas} fecha={fecha} puedeEditar={sesion.rol === "admin" || sesion.rol === "recepcion"} />
    </div>
  );
}
