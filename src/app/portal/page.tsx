import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { MisDatosForm } from "./mis-datos-form";

export default async function PortalPage() {
  const sesion = await obtenerSesionConRol();
  if (!sesion) return null;

  if (!sesion.clienteId) {
    return (
      <div className="max-w-sm">
        <Alert variante="advertencia" titulo="Tu cuenta aún no está vinculada">
          Todavía no encontramos tu expediente de cliente. Contacta a recepción para que asocien
          tu cuenta.
        </Alert>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: cliente, error } = await supabase
    .from("clientes")
    .select("nombre, telefono, email")
    .eq("id", sesion.clienteId)
    .single();

  if (error || !cliente) {
    return (
      <div className="max-w-sm">
        <Alert variante="error" titulo="No pudimos cargar tu expediente">
          Recarga la página. Si el problema sigue, contacta a recepción.
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Hola, {cliente.nombre}</h1>
        <p className="mt-1 text-n-600">Este es tu portal.</p>
      </div>

      <MisDatosForm nombre={cliente.nombre} telefono={cliente.telefono} email={cliente.email} />

      <div>
        <h2 className="mb-4 text-lg font-bold text-n-900">Tus perros</h2>
        <div className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-white p-8 text-center">
          <p className="text-n-600">Aquí van a aparecer tus perros.</p>
        </div>
      </div>
    </div>
  );
}
