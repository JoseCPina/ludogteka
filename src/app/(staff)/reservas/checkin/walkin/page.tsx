import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { hoyNegocio } from "@/lib/formato";
import { NuevaReservaForm } from "../../nueva/nueva-reserva-form";

// Punto 3 (walk-in): el perro que llega sin reserva pasa por el MISMO
// formulario y las mismas validaciones (cupo, sanitario, precio) que
// cualquier otra reserva — la única diferencia es el punto de entrada y
// que de aquí se sigue derecho a check-in, no a la ficha de la reserva.
export default async function WalkinPage() {
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
      .in("categoria", ["guarderia", "hotel"])
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Walk-in</h1>
        <p className="mt-1 text-n-600">
          El perro ya está en la puerta. Elige su dueño, marca el servicio y las fechas, y sigue
          directo al check-in.
        </p>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la información">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <NuevaReservaForm
          clientes={clientes ?? []}
          perros={perros ?? []}
          servicios={servicios ?? []}
          seriesActivas={seriesActivasLista}
          esAdmin={sesion?.rol === "admin"}
          hoy={hoy}
        />
      )}
    </div>
  );
}
