import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { ProveedorForm } from "../proveedor-form";
import { BajaServicioBoton } from "../../../servicios/baja-servicio-boton";
import { actualizarProveedor, darDeBajaProveedor } from "../actions";

export default async function EditarProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: proveedor } = await supabase
    .from("proveedores")
    .select("id, nombre, contacto_nombre, telefono, notas, deleted_at")
    .eq("id", id)
    .single();

  if (!proveedor) notFound();

  const actualizarConId = actualizarProveedor.bind(null, id);
  const bajaConId = darDeBajaProveedor.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/inventario/proveedores" className="text-sm font-semibold text-azul hover:underline">
          ← Proveedores
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-n-900">{proveedor.nombre}</h1>
          {proveedor.deleted_at && (
            <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">Inactivo</span>
          )}
        </div>
      </div>

      {proveedor.deleted_at && (
        <Alert variante="advertencia" titulo="Este proveedor está inactivo">
          Su historial de compras se conserva.
        </Alert>
      )}

      <ProveedorForm
        action={actualizarConId}
        valoresIniciales={{
          nombre: proveedor.nombre,
          contacto_nombre: proveedor.contacto_nombre,
          telefono: proveedor.telefono,
          notas: proveedor.notas,
        }}
        textoBoton="Guardar cambios"
      />

      {!proveedor.deleted_at && (
        <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
          <h2 className="text-lg font-bold text-n-900">Dar de baja</h2>
          <BajaServicioBoton accion={bajaConId} nombre={proveedor.nombre} />
        </div>
      )}
    </div>
  );
}
