import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearFechaCalendario, hoyNegocio, sumarDiasFecha } from "@/lib/formato";
import type { ModuloEstancia } from "@/lib/modulos";
import { BotonNuevoCliente } from "@/components/boton-nuevo-cliente";
import { tipoLinkDeModulo } from "@/lib/alta/tipos-link";
import { TablaOcupacion, type FilaCalendario } from "./tabla-ocupacion";

const DIAS_CALENDARIO = 14;

type FilaPerro = {
  estancia_id: string;
  reserva_id: string;
  perro_id: string;
  perro_nombre: string;
  categoria: string;
  servicio_nombre: string;
};

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
            <span className="text-xs text-n-500">{f.servicio_nombre}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// El tablero del día de un módulo. Las tres listas van filtradas por su
// categoría (el staff que atiende guardería no quiere ver a los de hotel
// en su lista de llegadas), pero la ocupación de abajo es de toda la casa
// — ver el comentario de TablaOcupacion.
export async function TableroModulo({ modulo }: { modulo: ModuloEstancia }) {
  const supabase = await createSupabaseServerClient();

  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio();
  const hasta = sumarDiasFecha(hoy, DIAS_CALENDARIO - 1);

  const columnas = "estancia_id, reserva_id, perro_id, perro_nombre, categoria, servicio_nombre";
  const [
    { data: llegadas, error: errorLlegadas },
    { data: salidas, error: errorSalidas },
    { data: adentro, error: errorAdentro },
    { data: calendario, error: errorCalendario },
  ] = await Promise.all([
    supabase.from("llegadas_hoy").select(columnas).eq("categoria", modulo.categoria).order("perro_nombre"),
    supabase.from("salidas_hoy").select(columnas).eq("categoria", modulo.categoria).order("perro_nombre"),
    supabase
      .from("quienes_estan_adentro")
      .select(columnas)
      .eq("categoria", modulo.categoria)
      .order("perro_nombre"),
    supabase.rpc("calendario_ocupacion", { p_desde: hoy, p_hasta: hasta }),
  ]);

  const error = errorLlegadas ?? errorSalidas ?? errorAdentro ?? errorCalendario;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">{modulo.etiqueta}</h1>
          <p className="mt-1 text-n-600">
            {formatearFechaCalendario(hoy)} — quién llega, quién se va y quién sigue aquí.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <BotonNuevoCliente tipo={tipoLinkDeModulo(modulo.categoria)} />
          <Link href={`${modulo.base}/checkin`}>
            <Button type="button" variante="secundario">
              Check-in
            </Button>
          </Link>
          <Link href={`${modulo.base}/checkout`}>
            <Button type="button" variante="secundario">
              Check-out
            </Button>
          </Link>
          <Link href={`${modulo.base}/series`}>
            <Button type="button" variante="secundario">
              Series recurrentes
            </Button>
          </Link>
          <Link href={`${modulo.base}/nueva`}>
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
              <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Llegan hoy</h2>
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

          <TablaOcupacion filas={(calendario as FilaCalendario[]) ?? []} modulo={modulo} />
        </>
      )}
    </div>
  );
}
