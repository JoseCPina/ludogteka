import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const ETIQUETA_CATEGORIA: Record<string, string> = { guarderia: "Guardería", hotel: "Hotel" };

export default async function CheckinListaPage() {
  const supabase = await createSupabaseServerClient();
  const { data: llegadas, error } = await supabase
    .from("llegadas_hoy")
    .select("estancia_id, perro_id, perro_nombre, categoria, servicio_nombre")
    .order("perro_nombre");

  const perroIds = [...new Set((llegadas ?? []).map((l) => l.perro_id))];
  const { data: contratoEstados } = perroIds.length
    ? await supabase.from("perros_contrato_estado").select("perro_id, estado").in("perro_id", perroIds)
    : { data: [] as { perro_id: string; estado: string }[] };
  const estadoContratoPorPerro = new Map(
    (contratoEstados ?? []).map((c) => [c.perro_id, c.estado])
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Check-in</h1>
          <p className="mt-1 text-n-600">Perros que llegan hoy y todavía no hacen check-in.</p>
        </div>
        <Link href="/reservas/checkin/walkin">
          <Button type="button" variante="secundario">
            Walk-in (sin reserva)
          </Button>
        </Link>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la información">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : !llegadas || llegadas.length === 0 ? (
        <p className="text-n-600">Nadie más por llegar hoy.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {llegadas.map((l) => (
            <li key={l.estancia_id}>
              <Link
                href={`/reservas/estancias/${l.estancia_id}/checkin`}
                className="flex items-center justify-between gap-3 rounded-md border border-n-200 bg-white px-4 py-3 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave"
              >
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-n-900">{l.perro_nombre}</span>
                  {estadoContratoPorPerro.get(l.perro_id) === "sin_contrato" && (
                    <span
                      className="rounded-full bg-amarillo-suave px-2 py-0.5 text-xs font-semibold text-amarillo-oscuro"
                      title="Aviso legal, no bloquea el check-in"
                    >
                      Sin contrato
                    </span>
                  )}
                  {estadoContratoPorPerro.get(l.perro_id) === "requiere_actualizacion" && (
                    <span
                      className="rounded-full bg-azul-suave px-2 py-0.5 text-xs font-semibold text-azul-oscuro"
                      title="Aviso legal, no bloquea el check-in — pide firma actualizada"
                    >
                      Requiere actualización
                    </span>
                  )}
                </span>
                <span className="rounded-full bg-azul-suave px-2 py-0.5 text-xs font-semibold text-azul">
                  {ETIQUETA_CATEGORIA[l.categoria] ?? l.categoria}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
