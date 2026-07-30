import Link from "next/link";
import { ProveedorForm } from "../proveedor-form";
import { crearProveedor } from "../actions";

export default function NuevoProveedorPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/inventario/proveedores" className="text-sm font-semibold text-azul hover:underline">
          ← Proveedores
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Nuevo proveedor</h1>
      </div>

      <ProveedorForm action={crearProveedor} textoBoton="Crear proveedor" />
    </div>
  );
}
