import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { hoyNegocio } from "@/lib/formato";
import { cargarExtras } from "@/lib/extras/servidor";
import { ListaExtras } from "./lista-extras";

/**
 * Los servicios extra del día en el tablero de recepción: la tarea que el personal
 * marca hecha (y el cargo entra a la cuenta). Si el módulo está apagado o no hay nada,
 * no sale nada.
 */
export async function ExtrasTablero() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  if (!sesion || !(sesion.modulos ?? []).some((m: string) => m === "guarderia" || m === "hotel")) return null;
  const [zona, negocio] = await Promise.all([zonaActual(), negocioActual()]);
  const filas = (await cargarExtras(supabase, { fecha: hoyNegocio(zona) })).filter((f) => f.estado !== "cancelado");
  if (filas.length === 0) return null;
  const pendientes = filas.filter((f) => f.estado === "pendiente" || f.estado === "en_camino").length;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4" data-extras-tablero>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-n-900">Servicios extra de hoy</h2>
        <Link href="/extras" className="text-sm font-semibold text-morado hover:underline">
          {pendientes === 0 ? "Todo hecho · ver detalle" : `${pendientes} por hacer · ver todo`}
        </Link>
      </div>
      <ListaExtras filas={filas} negocio={negocio.nombre} puedeAgregar={tienePermiso(sesion, "agregar_servicios_extra")} />
    </section>
  );
}
