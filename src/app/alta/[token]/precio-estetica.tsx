"use client";

import { cotizarPerro, type CotizacionEstetica, type PrecioDeServicio } from "@/lib/estetica/cotizacion";

function pesos(n: number): string {
  return `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

function TarjetaServicio({ servicio }: { servicio: PrecioDeServicio }) {
  if (servicio.estado === "no_aplica") return null;

  return (
    <div className="rounded-md border border-n-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold text-n-900">{servicio.nombre}</p>
        {servicio.estado === "disponible" && servicio.precio !== null ? (
          <p className="text-xl font-bold text-n-900">desde {pesos(servicio.precio)}</p>
        ) : (
          <p className="text-sm font-semibold text-n-600">Lo cotiza recepción</p>
        )}
      </div>

      {/* El pelo maltratado no es otro servicio ni un cargo aparte: es este
          mismo baño cobrado distinto porque el perro llega enredado. */}
      {servicio.precioPeloMaltratado !== null && (
        <p className="mt-1 text-sm text-n-700">
          Si llega con el pelo maltratado, este mismo baño cuesta{" "}
          <strong>{pesos(servicio.precioPeloMaltratado)}</strong>.
        </p>
      )}

      {servicio.incluye.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {servicio.incluye.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-n-700">
              <span aria-hidden="true" className="text-turquesa-oscuro">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Los precios de estética en la pantalla donde el dueño se registra.
 *
 * Tres reglas de las que depende que esto ayude en vez de estorbar:
 *
 *  1. Cada servicio con lo que incluye. Un número suelto invita a
 *     compararlo contra el baño de $150 de la esquina; la lista es lo que
 *     explica la diferencia entre el exprés y el completo.
 *
 *  2. Siempre "desde", siempre diciendo que recepción confirma. El precio
 *     real depende de cómo llegue el perro, y eso no se sabe por un
 *     formulario.
 *
 *  3. Cuando el dueño contesta "no sé / mestizo", el aviso cambia de tono.
 *     Ese perro se cotiza por talla, que es lo más barato; si resulta
 *     tener manto largo el precio real puede ser el doble. Un "desde
 *     $250" discreto ahí es la receta para que llegue con $250 en la mano
 *     y se lleve un disgusto en el mostrador.
 */
export function PrecioEstetica({
  cotizacion,
  razaId,
  razaEscrita,
  tamanoId,
}: {
  cotizacion: CotizacionEstetica;
  razaId: string | null;
  razaEscrita: string;
  tamanoId: string;
}) {
  const cotizado = cotizarPerro(cotizacion, razaId, razaEscrita, tamanoId);

  if (!cotizado) {
    return (
      <div className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-n-100 p-4">
        <p className="text-sm text-n-600">
          Escoge la raza de tu perro arriba y aquí te decimos cuánto cuesta cada baño.
        </p>
      </div>
    );
  }

  const incierto = cotizado.firmeza === "incierto";
  const ofrecidos = cotizado.servicios.filter((s) => s.estado !== "no_aplica");

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border-[1.5px] p-4 ${
        incierto ? "border-naranja-oscuro bg-naranja-suave" : "border-turquesa bg-turquesa-suave"
      }`}
    >
      <p className="text-sm font-semibold text-n-700">Lo que cuesta bañar a tu perro</p>

      {ofrecidos.map((s) => (
        <TarjetaServicio key={s.clave} servicio={s} />
      ))}

      {cotizado.firmeza === "sin_dato" && (
        <p className="text-sm text-n-700">
          Todavía no tenemos capturado el precio para un perro como el tuyo. Recepción te lo
          confirma cuando lo lleves; regístralo sin problema.
        </p>
      )}

      {cotizado.firmeza === "rango" && (
        <p className="text-sm text-n-700">
          El precio de tu perro depende de su tamaño. Escógelo arriba y el estimado se afina.
        </p>
      )}

      {incierto && (
        <div className="flex flex-col gap-2 text-sm text-n-800">
          <p className="font-bold text-naranja-oscuro">Ojo: estos números pueden quedarse cortos.</p>
          <p>
            Como no nos dijiste la raza, estamos calculando el precio del pelo más sencillo de
            bañar. Si tu perro tiene el pelo largo, rizado o enredado, el baño cuesta más
            {cotizacion.topeConocido !== null
              ? ` — hasta ${pesos(cotizacion.topeConocido)} en los perros que más trabajo llevan`
              : ""}
            . Si sabes la raza, escógela arriba y te damos un estimado mucho más cercano.
          </p>
        </div>
      )}

      {/* La nota va siempre, con o sin aviso fuerte: es la condición de
          todos los precios del cartel, no un detalle de un caso. */}
      <p className="text-sm text-n-700">
        Son precios estimados y pueden aumentar según el tipo de pelo y el cuidado previo.{" "}
        <strong>Recepción confirma el precio final</strong> cuando vea a tu perro.
      </p>
    </div>
  );
}
