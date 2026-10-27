import { ClienteForm } from "../cliente-form";
import { crearCliente, crearClienteYSuMascota, crearClienteYVolver } from "../actions";
import { rutaDeVuelta } from "@/lib/clientes/volver";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { usaVeterinaria } from "@/lib/plan/modulos";

// Con `?volver=` se llega desde el "Nuevo cliente" de un buscador: al
// guardar se sigue con su perro y de ahí se regresa a esa pantalla.
export default async function NuevoClientePage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string; seguir?: string }>;
}) {
  const sp = await searchParams;
  const volver = rutaDeVuelta(sp.volver);
  // Viene de agendar una cita de estética: alta corta (nombre y WhatsApp).
  const corta = Boolean(volver?.startsWith("/estetica"));
  // Con Veterinaria, el alta sigue siempre con su mascota (QA S30: se quedaba en la ficha con «Agregar perro»). Desde
  // «Nuevo cliente → Capturarlo yo» de Hotel, Guardería, Estética o el inicio (?seguir=perro), también (QA S31).
  const conVet = usaVeterinaria((await obtenerSesionConRol())?.modulos ?? []);
  const conMascota = !volver && (conVet || sp.seguir === "perro");
  const mascota = conVet ? "mascota" : "perro";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Nuevo cliente</h1>
        <p className="mt-1 text-n-600">
          {corta
            ? `Solo su nombre y su WhatsApp. Luego registras a su ${mascota} y agendas.`
            : "Datos básicos del dueño. El expediente completo (perros, vacunas, etc.) se agrega en otra fase."}
        </p>
      </div>
      <ClienteForm
        pedirDireccion
        corta={corta}
        action={volver ? crearClienteYVolver.bind(null, volver) : conMascota ? crearClienteYSuMascota : crearCliente}
        textoBoton={volver ? `Crear cliente y seguir con su ${mascota}` : conMascota ? `Crear cliente y seguir con su ${mascota}` : "Crear cliente"}
      />
    </div>
  );
}
