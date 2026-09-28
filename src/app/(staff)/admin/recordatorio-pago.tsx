"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { useZonaNegocio } from "@/components/zona-negocio";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { formatearFecha } from "@/lib/formato";
import { marcarRecordatorioVisto } from "./modulos/cobro-actions";

// El recordatorio de un cobro fallido de la suscripción: sale al admin al
// abrir su tablero cada tercer día de la gracia (días 1, 4 y 7) hasta que
// pague. El aviso de "Necesita atención" está siempre; esto es lo que no
// se puede pasar por alto.
export function RecordatorioPago({ soloLecturaDesde }: { soloLecturaDesde: string | null }) {
  const router = useRouter();
  const zona = useZonaNegocio();
  const envio = useEspera();
  const [abierto, setAbierto] = useState(true);
  const [error, setError] = useState<string | null>(null);
  if (!abierto) return null;

  async function cerrar() {
    setError(null);
    const res = await envio.ejecutar(() => marcarRecordatorioVisto());
    if (res.error) return setError(res.error);
    setAbierto(false);
    router.refresh();
  }

  return (
    <div role="alertdialog" aria-labelledby="recordatorio-pago-titulo" className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl bg-white p-6 shadow-lg">
        <h2 id="recordatorio-pago-titulo" className="text-lg font-bold text-n-900">
          Recordatorio: no pudimos cobrar tu suscripción
        </h2>
        <p className="text-n-800">
          Tu negocio sigue funcionando normal
          {soloLecturaDesde ? ` hasta el ${formatearFecha(soloLecturaDesde, zona)}` : ""}. Si para entonces no se ha pagado, queda en solo lectura
          (nada se borra y se reactiva solo en cuanto pagues).
        </p>
        <AccionesFormulario error={error}>
          <a href="/admin/modulos" className="inline-flex min-h-12 items-center rounded-md bg-morado px-5 font-semibold text-white hover:bg-morado-oscuro">
            Pagar o cambiar la tarjeta
          </a>
          <Button type="button" variante="secundario" cargando={envio.cargando} onClick={cerrar}>
            Recordármelo después
          </Button>
        </AccionesFormulario>
      </div>
    </div>
  );
}
