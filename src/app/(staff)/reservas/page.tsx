import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearDiaSemana, formatearFechaCalendario, hoyNegocio, sumarDiasFecha } from "@/lib/formato";

const ETIQUETA_CATEGORIA: Record<string, string> = {
  guarderia: "Guardería",
  hotel: "Hotel",
};

const DIAS_CALENDARIO = 14;

type FilaPerro = {
  estancia_id: string;
  reserva_id: string;
  perro_id: string;
  perro_nombre: string;
  categoria: string;
  servicio_nombre: string;
};

type FilaCalendario = {
  fecha: string;
  cupo_diurno: number | null;
  ocupado_diurno: number;
  disponible_diurno: number | null;
  cupo_nocturno: number | null;
  ocupado_nocturno: number;
  disponible_nocturno: number | null;
  cupo_estado: string;
};

function BadgeCategoria({ categoria }: { categoria: string }) {
  return (
    <span className="rounded-full bg-azul-suave px-2 py-0.5 text-xs font-semibold text-azul">
      {ETIQUETA_CATEGORIA[categoria] ?? categoria}
    </span>
  );
}

function ListaPerros({
  filas,
  vacio,
  destino,
}: {
  filas: FilaPerro[];
  vacio: string;
  destino: (fila: FilaPerro) => string;
}) {
  if (filas.length === 0) {
    return <p className="text-sm text-n-500">{vacio}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {filas.map((f) => (
        <li key={f.estancia_id}>
          <Link
            href={destino(f)}
            className="flex items-center justify-between gap-3 rounded-md border border-n-200 bg-white px-3 py-2 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave"
          >
            <span className="font-semibold text-n-900">{f.perro_nombre}</span>
            <BadgeCategoria categoria={f.categoria} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CeldaDisponibilidad({
  ocupado,
  cupo,
  disponible,
}: {
  ocupado: number;
  cupo: number | null;
  disponible: number | null;
}) {
  if (cupo === null || disponible === null) {
    return (
      <span className="text-sm font-semibold text-naranja-oscuro">Sin configurar</span>
    );
  }
  const lleno = disponible <= 0;
  return (
    <span
      className={`tabular-nums text-sm font-semibold ${
        lleno ? "text-naranja-oscuro" : "text-n-700"
      }`}
    >
      {ocupado}/{cupo}
      {lleno && <span className="ml-1 font-bold">· Lleno</span>}
    </span>
  );
}

export default async function ReservasPage() {
  const supabase = await createSupabaseServerClient();

  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio();
  const hasta = sumarDiasFecha(hoy, DIAS_CALENDARIO - 1);

  const [{ data: llegadas, error: errorLlegadas }, { data: salidas, error: errorSalidas }, { data: adentro, error: errorAdentro }, { data: calendario, error: errorCalendario }] =
    await Promise.all([
      supabase
        .from("llegadas_hoy")
        .select("estancia_id, reserva_id, perro_id, perro_nombre, categoria, servicio_nombre")
        .order("perro_nombre"),
      supabase
        .from("salidas_hoy")
        .select("estancia_id, reserva_id, perro_id, perro_nombre, categoria, servicio_nombre")
        .order("perro_nombre"),
      supabase
        .from("quienes_estan_adentro")
        .select("estancia_id, reserva_id, perro_id, perro_nombre, categoria, servicio_nombre")
        .order("perro_nombre"),
      supabase.rpc("calendario_ocupacion", { p_desde: hoy, p_hasta: hasta }),
    ]);

  const error = errorLlegadas ?? errorSalidas ?? errorAdentro ?? errorCalendario;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Reservas</h1>
          <p className="mt-1 text-n-600">
            {formatearFechaCalendario(hoy)} — quién llega, quién se va y quién sigue aquí.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/reservas/checkin">
            <Button type="button" variante="secundario">
              Check-in
            </Button>
          </Link>
          <Link href="/reservas/checkout">
            <Button type="button" variante="secundario">
              Check-out
            </Button>
          </Link>
          <Link href="/reservas/series">
            <Button type="button" variante="secundario">
              Series recurrentes
            </Button>
          </Link>
          <Link href="/reservas/nueva">
            <Button type="button">Nueva reserva</Button>
          </Link>
        </div>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la información">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">
                Llegan hoy
              </h2>
              <ListaPerros
                filas={(llegadas as FilaPerro[]) ?? []}
                vacio="Nadie más por llegar."
                destino={(f) => `/reservas/estancias/${f.estancia_id}/checkin`}
              />
            </section>

            <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Se van hoy</h2>
              <ListaPerros
                filas={(salidas as FilaPerro[]) ?? []}
                vacio="Nadie más por salir."
                destino={(f) => `/reservas/estancias/${f.estancia_id}/checkout`}
              />
            </section>

            <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">
                Siguen aquí ahora
              </h2>
              <ListaPerros
                filas={(adentro as FilaPerro[]) ?? []}
                vacio="No hay nadie dentro."
                destino={(f) => `/reservas/estancias/${f.estancia_id}/checkout`}
              />
            </section>
          </div>

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-bold text-n-900">Ocupación de los próximos días</h2>
              <p className="text-sm text-n-600">
                Diurno lo consumen guardería y hotel; nocturno solo hotel — un día puede tener
                lugar de día y estar lleno de noche.
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr>
                    <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                      Fecha
                    </th>
                    <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                      Diurno
                    </th>
                    <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                      Nocturno
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {((calendario as FilaCalendario[]) ?? []).map((d) => (
                    <tr key={d.fecha}>
                      <td className="border-b border-n-200 px-4 py-3 text-n-900">
                        {formatearFechaCalendario(d.fecha)}{" "}
                        <span className="text-n-500">({formatearDiaSemana(d.fecha)})</span>
                      </td>
                      <td className="border-b border-n-200 px-4 py-3">
                        <CeldaDisponibilidad
                          ocupado={d.ocupado_diurno}
                          cupo={d.cupo_diurno}
                          disponible={d.disponible_diurno}
                        />
                      </td>
                      <td className="border-b border-n-200 px-4 py-3">
                        <CeldaDisponibilidad
                          ocupado={d.ocupado_nocturno}
                          cupo={d.cupo_nocturno}
                          disponible={d.disponible_nocturno}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
