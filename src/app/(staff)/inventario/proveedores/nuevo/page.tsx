import { ProveedorForm } from "../proveedor-form";
import { crearProveedor } from "../actions";
import { Enlace } from "@/components/ui/enlace";

export default function NuevoProveedorPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Enlace href="/inventario/proveedores" className="text-sm">
          ← Proveedores
        </Enlace>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Nuevo proveedor</h1>
      </div>

      <ProveedorForm action={crearProveedor} textoBoton="Crear proveedor" />
    </div>
  );
}
