import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { zonaActual } from "@/lib/negocio/actual";
import { hoyNegocio } from "@/lib/formato";
import { recoleccionesDelDia } from "@/lib/recoleccion/servidor";
import { Enlace } from "@/components/ui/enlace";
import { Chip, type TonoChip } from "@/components/ui/chip";
import { etiquetaEstadoRecoleccion, horaCorta, linkComoLlegar } from "@/lib/recoleccion/tipos";

const TONO: Record<string, TonoChip> = { pendiente: "info", en_camino: "proceso", recogido: "exito", cancelada: "neutro" };

/**
 * Las recolecciones de hoy en el tablero de recepción: qué hay que recoger, a qué hora y dónde, en el orden de la
 * ruta (punto de partida y cercanía). Sin nada que recoger, no sale nada. El detalle y las acciones van en /recolecciones.
 */
export async function RecoleccionesTablero() {
  const sesion = await obtenerSesionConRol();
  if (!sesion || !["admin", "recepcion"].includes(sesion.rol)) return null;
  const [supabase, zona] = await Promise.all([createSupabaseServerClient(), zonaActual()]);
  const filas = (await recoleccionesDelDia(supabase, hoyNegocio(zona))).filter((f) => f.estado !== "cancelada");
  if (filas.length === 0) return null;
  const pendientes = filas.filter((f) => f.estado !== "recogido").length;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card shadow-tarjeta p-4" data-recolecciones-tablero>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Recolecciones de hoy</h2>
        <Enlace href="/recolecciones" className="text-sm">
          {pendientes === 0 ? "Todas recogidas · ver detalle" : `${pendientes} por recoger · ver la ruta`}
        </Enlace>
      </div>
      <ul className="divide-y divide-border">
        {filas.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-semibold text-n-900">
                {horaCorta(f.hora_estimada) ?? "Sin hora"} · {f.perro_nombre} <span className="font-normal text-n-600">({f.cliente_nombre})</span>
              </p>
              <p className="truncate text-n-600">{f.direccion}{f.distancia_recta_km != null ? ` · ${f.distancia_recta_km} km` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <Chip tono={TONO[f.estado] ?? "neutro"}>{etiquetaEstadoRecoleccion(f.estado)}</Chip>
              <Enlace href={linkComoLlegar(f)} target="_blank" rel="noopener noreferrer" className="text-sm" data-sin-bloqueo>Cómo llegar ↗</Enlace>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
