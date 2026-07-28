import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { formatearTelefono } from "@/lib/telefono";
import { ClienteForm } from "../cliente-form";
import { BajaClienteBoton } from "../baja-cliente-boton";
import { actualizarCliente, darDeBajaCliente } from "../actions";

export default async function EditarClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const { id } = await params;
  const { creado } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, email")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!cliente) notFound();

  const actualizarConId = actualizarCliente.bind(null, id);
  const bajaConId = darDeBajaCliente.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">{cliente.nombre}</h1>
        <p className="mt-1 text-n-600">Editar datos del dueño.</p>
      </div>

      {creado === "1" && <Alert variante="exito" titulo="Cliente creado correctamente" />}

      <ClienteForm
        action={actualizarConId}
        valoresIniciales={{
          nombre: cliente.nombre,
          telefono: formatearTelefono(cliente.telefono),
          email: cliente.email,
        }}
        textoBoton="Guardar cambios"
      />

      <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Dar de baja</h2>
        <p className="text-n-600">
          El cliente deja de aparecer en el listado, pero su historial no se borra.
        </p>
        <BajaClienteBoton accion={bajaConId} nombre={cliente.nombre} />
      </div>
    </div>
  );
}
