import { Alert } from "@/components/ui/alert";

// El negocio maneja varios contratos a la vez (guardería, hotel, …), así
// que el estado dejó de ser un sí/no: un perro puede tener firmado el de
// guardería y deberle el de hotel. Por eso el aviso siempre dice CUÁL
// falta — "Sin contrato" a secas no le decía a recepción qué pedir.
//
// 'no_aplica' es el perro al que todavía no le toca ningún contrato
// (no ha usado ningún servicio de los que lo exigen): no se pinta nada,
// no es un pendiente.
export type ContratoEstado = "vigente" | "sin_contrato" | "requiere_actualizacion" | "no_aplica";

export type ContratoResumen = {
  estado: ContratoEstado;
  faltantes: string[];
  desactualizados: string[];
};

export function resumenVacio(): ContratoResumen {
  return { estado: "no_aplica", faltantes: [], desactualizados: [] };
}

function lista(nombres: string[]) {
  return nombres.join(", ");
}

// Aviso, no bloqueo en los dos casos "malos": a diferencia del estado
// sanitario, el riesgo de no tener contrato al día es legal, no de
// contagio — bloquear la entrada por esto perdería clientes. "vigente"
// es una pastilla discreta, igual de silenciosa que el resto de los
// estados "todo bien" en el expediente; falta vs. desactualizado se
// distinguen por color (ámbar vs. azul) para que de un vistazo se note
// cuál es más urgente: nunca ha firmado ese contrato, vs. ya lo firmó
// pero con una versión que el negocio marcó como superada.
export function ContratoEstadoBanner({
  resumen,
  tamano = "grande",
  mostrarVigente = true,
}: {
  resumen: ContratoResumen;
  tamano?: "grande" | "compacto";
  // La lista de check-in del día solo quiere ver lo que falta: marcar
  // con una pastilla verde a los 20 perros que sí están al día es ruido
  // que esconde justamente al que no lo está.
  mostrarVigente?: boolean;
}) {
  const { estado, faltantes, desactualizados } = resumen;

  if (estado === "no_aplica") return null;
  if (estado === "vigente" && !mostrarVigente) return null;

  if (tamano === "compacto") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {faltantes.length > 0 && (
          <span
            className="w-fit rounded-full border-[1.5px] border-amarillo bg-amarillo-suave px-2 py-1 text-xs font-bold text-amarillo-oscuro"
            title="Aviso legal, no bloquea"
          >
            Falta: {lista(faltantes)}
          </span>
        )}
        {desactualizados.length > 0 && (
          <span
            className="w-fit rounded-full border-[1.5px] border-azul bg-azul-suave px-2 py-1 text-xs font-bold text-azul-oscuro"
            title="Aviso legal, no bloquea — pide firma actualizada"
          >
            Actualizar: {lista(desactualizados)}
          </span>
        )}
        {estado === "vigente" && (
          <span className="w-fit rounded-full border-[1.5px] border-verde bg-verde-suave px-2 py-1 text-xs font-bold text-verde-oscuro">
            Contratos firmados
          </span>
        )}
      </div>
    );
  }

  if (estado === "vigente") {
    return (
      <div className="w-fit rounded-full border-[1.5px] border-verde bg-verde-suave px-3 py-1.5 text-sm font-bold text-verde-oscuro">
        Contratos firmados
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {faltantes.length > 0 && (
        <Alert
          variante="advertencia"
          titulo={faltantes.length === 1 ? `Falta firmar: ${faltantes[0]}` : "Faltan contratos por firmar"}
        >
          {faltantes.length > 1 && <span className="block font-semibold">{lista(faltantes)}</span>}
          Es un aviso legal — no bloquea el check-in. Puedes generarlo y pedir la firma desde el
          expediente del perro.
        </Alert>
      )}
      {desactualizados.length > 0 && (
        <Alert
          variante="advertencia"
          titulo={
            desactualizados.length === 1
              ? `Firmado con una versión anterior: ${desactualizados[0]}`
              : "Contratos firmados con una versión anterior"
          }
        >
          {desactualizados.length > 1 && (
            <span className="block font-semibold">{lista(desactualizados)}</span>
          )}
          El negocio marcó una versión más reciente como necesaria de re-firmar. Es un aviso legal —
          no bloquea el check-in. Puedes generar el contrato nuevo y pedir la firma desde el
          expediente del perro.
        </Alert>
      )}
    </div>
  );
}
