import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { hoyNegocio } from "@/lib/formato";
import type { ModuloEstancia } from "@/lib/modulos";
import { NuevaReservaForm } from "../nueva/nueva-reserva-form";

// Sirve a los dos puntos de entrada del mismo formulario: la reserva
// normal y el walk-in (el perro ya está en la puerta). La única
// diferencia entre ambos sigue siendo el punto de entrada y a dónde se
// sigue después, igual que cuando eran una sola pantalla.
//
// Los servicios se filtran a la categoría del módulo: en Guardería no
// tiene por qué aparecer "Hotel noche" en el selector. Eso es lo único
// que hace de este formulario un formulario "de guardería" — el modelo
// de datos no cambia, sigue creando una fila de `estancias`.
export async function PaginaNuevaReserva({
  modulo,
  esWalkin = false,
}: {
  modulo: ModuloEstancia;
  esWalkin?: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();

  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio();

  const [
    { data: clientes, error: errorClientes },
    { data: perros, error: errorPerros },
    { data: servicios, error: errorServicios },
    { data: seriesActivas, error: errorSeries },
  ] = await Promise.all([
    supabase.from("clientes").select("id, nombre, telefono").is("deleted_at", null).order("nombre"),
    supabase
      .from("perros")
      .select("id, cliente_id, nombre")
      .is("deleted_at", null)
      .eq("fallecido", false)
      .order("nombre"),
    supabase
      .from("servicios")
      .select("id, nombre, categoria")
      .eq("categoria", modulo.categoria)
      .is("deleted_at", null)
      .order("orden"),
    supabase.from("series_recurrentes").select("perro_id, dias_semana, servicios(nombre)").is("deleted_at", null),
  ]);

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
        <Link href={modulo.base} className="text-sm font-semibold text-azul hover:underline">
          ← {modulo.etiqueta}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">
          {esWalkin ? `Walk-in — ${modulo.etiqueta}` : `Nueva reserva — ${modulo.etiqueta}`}
        </h1>
        <p className="mt-1 text-n-600">
          {esWalkin
            ? "El perro ya está en la puerta. Elige su dueño, marca el servicio y las fechas, y sigue directo al check-in."
            : `Uno o varios perros de la misma familia en la misma reserva. Solo servicios de ${modulo.etiqueta.toLowerCase()}.`}
        </p>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la información">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : sinServicios ? (
        <Alert variante="advertencia" titulo={`No hay servicios de ${modulo.etiqueta.toLowerCase()} dados de alta`}>
          Un admin tiene que crear el servicio en Servicios antes de poder reservar aquí.
        </Alert>
      ) : (
        <NuevaReservaForm
          clientes={clientes ?? []}
          perros={perros ?? []}
          servicios={servicios ?? []}
          seriesActivas={seriesActivasLista}
          esAdmin={sesion?.rol === "admin"}
          hoy={hoy}
          base={modulo.base}
        />
      )}
    </div>
  );
}
