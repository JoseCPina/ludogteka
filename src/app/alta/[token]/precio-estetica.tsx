"use client";

import { estimadoDeRaza, type CotizacionEstetica } from "@/lib/estetica/cotizacion";

function pesos(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * El precio estimado del baño, en la pantalla donde el dueño se registra.
 *
 * Dos reglas de las que depende que esto ayude en vez de estorbar:
 *
 *  1. Siempre "desde", nunca un precio a secas, y siempre diciendo que
 *     recepción confirma. El precio real depende de cómo llegue el perro
 *     — enredado cuesta más — y eso no se puede saber por un formulario.
 *
 *  2. Cuando el dueño contesta "no sé / mestizo", el aviso cambia de tono.
 *     Ese perro se cotiza como pelo corto, que es el grupo más barato; si
 *     resulta tener manto largo, el precio real puede ser el doble. Un
 *     "desde $250" discreto ahí es la receta para que llegue con $250 en
 *     la mano y se lleve un disgusto en el mostrador.
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
  const estimado = estimadoDeRaza(cotizacion, razaId, razaEscrita, tamanoId);

  if (!estimado) {
    return (
      <div className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-n-100 p-4">
        <p className="text-sm text-n-600">
          Escoge la raza de tu perro arriba y aquí te decimos cuánto cuesta su baño.
        </p>
      </div>
    );
  }

  const incierto = estimado.firmeza === "incierto";

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border-[1.5px] p-4 ${
        incierto ? "border-naranja-oscuro bg-naranja-suave" : "border-turquesa bg-turquesa-suave"
      }`}
    >
      <div>
        <p className="text-sm font-semibold text-n-700">{cotizacion.servicioNombre}</p>
        {estimado.desde === null ? (
          <p className="mt-1 text-lg font-bold text-n-900">Lo cotiza recepción</p>
        ) : (
          <p className="mt-1 text-2xl font-bold text-n-900">
            desde {pesos(estimado.desde)}
          </p>
        )}
      </div>

      {estimado.firmeza === "sin_dato" && (
        <p className="text-sm text-n-700">
          Todavía no tenemos capturado el precio para un perro como el tuyo. Recepción te lo
          confirma cuando lo lleves; regístralo sin problema.
        </p>
      )}

      {estimado.firmeza === "rango" && (
        <p className="text-sm text-n-700">
          El precio de tu perro depende de su tamaño. Escoge su tamaño arriba y el estimado se
          afina. <strong>Recepción confirma el precio final</strong> cuando lo vea.
        </p>
      )}

      {estimado.firmeza === "afinado" && (
        <p className="text-sm text-n-700">
          Es el precio de partida para su raza. Puede subir si llega muy enredado o si necesita más
          trabajo del normal: <strong>recepción confirma el precio final</strong> cuando vea a tu
          perro.
        </p>
      )}

      {incierto && (
        <div className="flex flex-col gap-2 text-sm text-n-800">
          <p className="font-bold text-naranja-oscuro">
            Ojo: este número puede quedarse corto.
          </p>
          <p>
            Como no nos dijiste la raza, estamos calculando el precio del pelo más sencillo de
            bañar. Si tu perro tiene el pelo largo, rizado o enredado, el baño cuesta más
            {cotizacion.topeConocido !== null
              ? ` — hasta ${pesos(cotizacion.topeConocido)} en los perros que más trabajo llevan`
              : ""}
            .
          </p>
          <p>
            <strong>El precio final lo confirma recepción cuando vea a tu perro.</strong> Si sabes
            la raza, escógela arriba y te damos un estimado mucho más cercano.
          </p>
        </div>
      )}

      {cotizacion.incluye.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-n-800">Incluye</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {cotizacion.incluye.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-n-700">
                <span aria-hidden="true" className="text-turquesa-oscuro">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
