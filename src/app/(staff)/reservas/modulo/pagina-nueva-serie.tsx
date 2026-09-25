import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { armarClientesBuscables } from "@/lib/clientes/buscables";
import { hoyNegocio } from "@/lib/formato";
import type { ModuloEstancia } from "@/lib/modulos";
import { cargarServiciosOfrecibles } from "@/lib/servicios/ofrecibles";
import { diasSinGuarderia } from "@/lib/horario";
import { NuevaSerieForm } from "../series/nueva/nueva-serie-form";
import { cargarPaquetesDePerros } from "@/lib/bonos/cargar-paquetes";
import { zonaActual } from "@/lib/negocio/actual";

export async function PaginaNuevaSerie({ modulo }: { modulo: ModuloEstancia }) {
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();

  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio(zona);

  const [
    { data: clientes, error: errorClientes },
    { data: perros, error: errorPerros },
    { servicios, error: errorServicios },
    { data: seriesActivas, error: errorSeries },
    cerrados,
  ] = await Promise.all([
    supabase.from("clientes").select("id, nombre, telefono").is("deleted_at", null).order("nombre"),
    supabase
      .from("perros")
      .select("id, cliente_id, nombre")
      .is("deleted_at", null)
      .eq("fallecido", false)
      .order("nombre"),
    // Una serie es de días completos: la guardería por hora se queda
    // fuera (generar_estancias_serie no sabe de horas, y no tiene por qué).
    cargarServiciosOfrecibles(supabase, [modulo.categoria], { excluirUnidades: ["hora"] }),
    supabase
      .from("series_recurrentes")
      .select("perro_id, dias_semana, servicios(nombre)")
      .is("deleted_at", null),
    diasSinGuarderia(supabase, hoy),
  ]);
  const paquetes = await cargarPaquetesDePerros(supabase);

  const error = errorClientes ?? errorPerros ?? errorServicios ?? errorSeries;

  const seriesActivasLista = (seriesActivas ?? []).map((s) => {
    const servicio = Array.isArray(s.servicios) ? s.servicios[0] : s.servicios;
    return {
      perroId: s.perro_id as string,
      diasSemana: s.dias_semana as number[],
      servicioNombre: servicio?.nombre ?? "—",
    };
  });

  const sinServicios = !error && (servicios ?? []).length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`${modulo.base}/series`} className="text-sm font-semibold text-azul hover:underline">
          ← Series de {modulo.etiqueta.toLowerCase()}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">
          Nueva serie recurrente — {modulo.etiqueta}
        </h1>
        <p className="mt-1 text-n-600">
          Un perro que viene siempre los mismos días — se genera un horizonte de 8 semanas.
        </p>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la información">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : sinServicios ? (
        <Alert variante="advertencia" titulo={`No hay servicios de ${modulo.etiqueta.toLowerCase()} dados de alta`}>
          Un admin tiene que crear el servicio en Servicios antes de poder armar una serie aquí.
        </Alert>
      ) : (
        <NuevaSerieForm
          clientes={armarClientesBuscables((clientes ?? []) as { id: string; nombre: string; telefono: string }[], (perros ?? []) as { id: string; cliente_id: string; nombre: string }[])}
          perros={perros ?? []}
          servicios={servicios ?? []}
          seriesActivas={seriesActivasLista}
          paquetes={paquetes}
          hoy={hoy}
          base={modulo.base}
          diasSinGuarderia={cerrados}
        />
      )}
    </div>
  );
}
