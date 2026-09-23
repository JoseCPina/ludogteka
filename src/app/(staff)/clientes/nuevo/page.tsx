import { ClienteForm } from "../cliente-form";
import { crearCliente, crearClienteYVolver } from "../actions";
import { rutaDeVuelta } from "@/lib/clientes/volver";

// Con `?volver=` se llega desde el "Nuevo cliente" de un buscador: al
// guardar se sigue con su perro y de ahí se regresa a esa pantalla.
export default async function NuevoClientePage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  const volver = rutaDeVuelta((await searchParams).volver);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Nuevo cliente</h1>
        <p className="mt-1 text-n-600">
          Datos básicos del dueño. El expediente completo (perros, vacunas, etc.) se agrega en
          otra fase.
        </p>
      </div>
      <ClienteForm
        pedirDireccion
        action={volver ? crearClienteYVolver.bind(null, volver) : crearCliente}
        textoBoton={volver ? "Crear cliente y seguir con su perro" : "Crear cliente"}
      />
    </div>
  );
}
