import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { AgendarForm } from "./agendar-form";

export default async function AgendarPage() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();

  const [
    { data: clientes, error: errorClientes },
    { data: perros, error: errorPerros },
    { data: servicios, error: errorServicios },
    { data: empleados, error: errorEmpleados },
    { data: estanciasEnCurso, error: errorEstancias },
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
      .select("id, nombre")
      .eq("categoria", "estetica")
      .is("deleted_at", null)
      .order("orden"),
    supabase
      .from("profiles")
      .select("id, nombre_completo")
      .in("rol", ["estetica", "admin"])
      .is("deleted_at", null)
      .order("nombre_completo"),
    supabase
      .from("estancias")
      .select("id, perro_id, servicios(nombre)")
      .eq("estado", "en_curso")
      .is("deleted_at", null),
  ]);

  const error = errorClientes ?? errorPerros ?? errorServicios ?? errorEmpleados ?? errorEstancias;

  const estanciasLista = (estanciasEnCurso ?? []).map((e) => {
    const servicio = Array.isArray(e.servicios) ? e.servicios[0] : e.servicios;
    return { id: e.id as string, perroId: e.perro_id as string, servicioNombre: servicio?.nombre ?? "—" };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Agendar cita</h1>
        <p className="mt-1 text-n-600">Estética — baño, corte y demás servicios del catálogo.</p>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la información">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <AgendarForm
          clientes={clientes ?? []}
          perros={perros ?? []}
          servicios={servicios ?? []}
          empleados={empleados ?? []}
          estanciasEnCurso={estanciasLista}
          rolActual={sesion?.rol ?? "cliente"}
          userIdActual={sesion?.user.id ?? ""}
        />
      )}
    </div>
  );
}
