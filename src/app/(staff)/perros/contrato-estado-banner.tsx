import { Alert } from "@/components/ui/alert";

export type ContratoEstado = "vigente" | "sin_contrato" | "requiere_actualizacion";

// Aviso, no bloqueo en los dos casos "malos": a diferencia del estado
// sanitario, el riesgo de no tener contrato al día es legal, no de
// contagio — bloquear la entrada por esto perdería clientes. "vigente"
// es una pastilla discreta, igual de silenciosa que el resto de los
// estados "todo bien" en el expediente; "sin_contrato" y
// "requiere_actualizacion" se distinguen por color (ámbar vs. azul) para
// que de un vistazo se note cuál es más urgente: nunca ha firmado nada,
// vs. ya firmó pero con una versión que el negocio marcó como superada.
export function ContratoEstadoBanner({
  estado,
  tamano = "grande",
}: {
  estado: ContratoEstado;
  tamano?: "grande" | "compacto";
}) {
  if (tamano === "compacto") {
    if (estado === "vigente") {
      return (
        <div className="w-fit rounded-full border-[1.5px] border-verde bg-verde-suave px-2 py-1 text-xs font-bold text-verde-oscuro">
          Contrato firmado
        </div>
      );
    }
    if (estado === "requiere_actualizacion") {
      return (
        <div
          className="w-fit rounded-full border-[1.5px] border-azul bg-azul-suave px-2 py-1 text-xs font-bold text-azul-oscuro"
          title="Aviso legal, no bloquea — pide firma actualizada"
        >
          Requiere actualización
        </div>
      );
    }
    return (
      <div
        className="w-fit rounded-full border-[1.5px] border-amarillo bg-amarillo-suave px-2 py-1 text-xs font-bold text-amarillo-oscuro"
        title="Aviso legal, no bloquea"
      >
        Sin contrato firmado
      </div>
    );
  }

  if (estado === "vigente") {
    return (
      <div className="w-fit rounded-full border-[1.5px] border-verde bg-verde-suave px-3 py-1.5 text-sm font-bold text-verde-oscuro">
        Contrato firmado
      </div>
    );
  }

  if (estado === "requiere_actualizacion") {
    return (
      <Alert variante="advertencia" titulo="Contrato firmado con una versión anterior">
        Este perro firmó un contrato, pero el negocio marcó una versión más reciente como necesaria
        de re-firmar. Es un aviso legal — no bloquea el check-in. Puedes generar un contrato nuevo y
        pedir la firma desde el expediente del perro.
      </Alert>
    );
  }

  return (
    <Alert variante="advertencia" titulo="Sin contrato firmado">
      Este perro no tiene un contrato firmado. Es un aviso legal — no bloquea el check-in. Puedes
      generarlo y pedir la firma desde el expediente del perro.
    </Alert>
  );
}
