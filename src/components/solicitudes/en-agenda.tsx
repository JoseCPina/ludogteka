import { createSupabaseServerClient } from "@/lib/supabase/server";
import { puedeAbrirEnServidor } from "@/lib/auth/acceso-servidor";
import { zonaActual } from "@/lib/negocio/actual";
import { formatearFecha, formatearFechaCalendario } from "@/lib/formato";
import { Enlace } from "@/components/ui/enlace";

type Fila = { id: string; es_cliente_nuevo?: boolean; tipo: string; perro_nombre: string; servicio_nombre: string; fecha_entrada: string | null; fecha_salida: string | null; inicio: string | null };

/** En la agenda, las solicitudes de lugar sin responder: no ocupan cupo, pero quien agenda las tiene que ver. */
export async function SolicitudesEnAgenda({ tipo }: { tipo: "estancia" | "cita" }) {
  const puede = await puedeAbrirEnServidor();
  if (!puede("/solicitudes")) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("solicitudes_del_negocio", { p_solo_pendientes: true });
  const filas = ((data ?? []) as Fila[]).filter((f) => f.tipo === tipo);
  if (filas.length === 0) return null;
  const zona = await zonaActual();
  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-3" data-solicitudes-agenda>
      <p className="text-sm font-bold text-n-900">{filas.length === 1 ? "1 solicitud de lugar sin responder" : `${filas.length} solicitudes de lugar sin responder`}</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-sm text-n-700">
        {filas.slice(0, 5).map((f) => (
          <li key={f.id}>
            {f.es_cliente_nuevo ? "Cliente nuevo" : "Solicitud"}: {f.perro_nombre} · {f.servicio_nombre} · {f.inicio ? formatearFecha(f.inicio, zona) : f.fecha_entrada ? formatearFechaCalendario(f.fecha_entrada) : ""}
          </li>
        ))}
      </ul>
      <Enlace href="/solicitudes">Revisar solicitudes</Enlace>
    </section>
  );
}
