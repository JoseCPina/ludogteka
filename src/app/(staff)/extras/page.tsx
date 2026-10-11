import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { cargarExtras } from "@/lib/extras/servidor";
import { ListaExtras } from "@/components/extras/lista-extras";

// Los servicios extra del día: las tareas (paseo, baño de salida, medicamento…) y la
// hoja de traslados (dirección, hora y estado). Se puede ver otro día con ?fecha=.
export default async function ExtrasPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha: fechaParam } = await searchParams;
  const zona = await zonaActual();
  const hoy = hoyNegocio(zona);
  const fecha = fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : hoy;
  const supabase = await createSupabaseServerClient();
  const [sesion, negocio, filas] = await Promise.all([
    obtenerSesionConRol(),
    negocioActual(),
    // Solo el día de hoy arrastra lo pendiente de días anteriores.
    cargarExtras(supabase, { fecha }),
  ]);
  const puedeAgregar = tienePermiso(sesion, "agregar_servicios_extra");
  const puedeCatalogo = tienePermiso(sesion, "editar_catalogo_extras");
  const traslados = filas.filter((f) => f.tipo === "traslado");
  const tareas = filas.filter((f) => f.tipo !== "traslado");
  const pendientes = filas.filter((f) => f.estado === "pendiente" || f.estado === "en_camino").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Servicios extra</h1>
          <p className="mt-1 text-n-600">
            {formatearFechaCalendario(fecha)} · {pendientes === 0 ? "nada pendiente" : `${pendientes} por hacer`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
          <Link href={`/extras?fecha=${shiftDia(fecha, -1)}`} className="text-morado hover:underline">
            ← Día anterior
          </Link>
          {fecha !== hoy && (
            <Link href="/extras" className="text-morado hover:underline">
              Hoy
            </Link>
          )}
          <Link href={`/extras?fecha=${shiftDia(fecha, 1)}`} className="text-morado hover:underline">
            Día siguiente →
          </Link>
          {puedeCatalogo && (
            <Link href="/extras/catalogo" className="rounded-md border-[1.5px] border-borde bg-white px-3 py-2 text-n-900 hover:bg-n-100">
              Catálogo de servicios extra
            </Link>
          )}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Tareas del día</h2>
        <ListaExtras filas={tareas} negocio={negocio.nombre} puedeAgregar={puedeAgregar} vacio="No hay tareas de servicios extra para este día." />
      </section>

      <section className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Traslados</h2>
        <p className="text-sm text-n-600">
          Hoja del día: dirección, horario y estado. Cuando sale el traslado se le avisa al dueño por WhatsApp.
        </p>
        <ListaExtras filas={traslados} negocio={negocio.nombre} puedeAgregar={puedeAgregar} vacio="No hay traslados para este día." />
      </section>

      <p className="text-sm text-n-600">
        Para agregar un servicio extra o programarlo, abre el check-in o el check-out de la estancia.
      </p>
    </div>
  );
}

function shiftDia(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
