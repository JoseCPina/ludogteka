import Link from "next/link";
import { MODULOS_LISTA } from "@/lib/modulos";

// "Reservas" dejó de ser una sección: ahora son dos módulos, Guardería y
// Hotel. Esta pantalla se queda por dos razones concretas, no por
// nostalgia: es a dónde caen los enlaces y favoritos viejos a /reservas,
// y es el "volver" de una reserva que mezcla las dos categorías (una
// familia que deja un perro en guardería y otro en hotel el mismo día),
// donde ningún módulo es más dueño que el otro.
//
// Debajo de esta ruta siguen viviendo las pantallas que son de un
// registro concreto y no de un módulo: la reserva y su cuenta, el
// check-in/check-out de una estancia y el detalle de una serie. Esas se
// alcanzan desde cualquiera de los dos módulos y saben regresar al que
// les toca por su propia categoría.
export default function ReservasPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Reservas</h1>
        <p className="mt-1 text-n-600">
          Ahora están separadas en dos módulos, cada uno con sus reservas, su check-in/check-out y
          su ocupación. Están en el menú de la izquierda.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {MODULOS_LISTA.map((m) => (
          <li key={m.categoria}>
            <Link
              href={m.base}
              className="flex items-center justify-between gap-3 rounded-lg border-[1.5px] border-n-200 bg-white px-4 py-4 hover:border-azul focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave"
            >
              <span>
                <span className="block font-bold text-n-900">{m.etiqueta}</span>
                <span className="block text-sm text-n-600">{m.descripcion}</span>
              </span>
              <span className="text-azul">→</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-sm text-n-500">
        El cupo no se partió: los dos comparten el mismo espacio, así que la ocupación que ves en
        cualquiera de los dos módulos es la de toda la casa.
      </p>
    </div>
  );
}
