import { ClienteForm } from "../cliente-form";
import { crearCliente } from "../actions";

export default function NuevoClientePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Nuevo cliente</h1>
        <p className="mt-1 text-n-600">
          Datos básicos del dueño. El expediente completo (perros, vacunas, etc.) se agrega en
          otra fase.
        </p>
      </div>
      <ClienteForm action={crearCliente} textoBoton="Crear cliente" />
    </div>
  );
}
