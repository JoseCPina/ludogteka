"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { convertirEnNocheHotel } from "../../../checkin-actions";

export type SugerenciaHotel = {
  minutos: number;
  horaCierre: string;
  // Null cuando ningún servicio de hotel tiene tarifa: el botón se
  // cambia por el aviso de qué falta, en vez de tronar al pulsarlo.
  hotelNombre: string | null;
};

// Un perro de guardería que sigue aquí después del cierre se queda a
// dormir: la MISMA estancia pasa a hotel y se cobra como noche a su
// tarifa. La base valida cupo nocturno y requisitos al convertir, igual
// que si se hubiera reservado hotel desde el principio.
export function ConvertirHotel({
  estanciaId,
  sugerencia,
}: {
  estanciaId: string;
  sugerencia: SugerenciaHotel;
}) {
  const router = useRouter();
  const [omitida, setOmitida] = useState(false);
  const convirtiendo = useEspera();
  const [error, setError] = useState<string | null>(null);

  if (omitida) return null;

  async function convertir() {
    setError(null);
    const res = await convirtiendo.ejecutar(() => convertirEnNocheHotel(estanciaId));
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-amarillo bg-amarillo-suave p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-amarillo-oscuro">
            Pasó el cierre ({sugerencia.horaCierre}) hace {sugerencia.minutos} minuto
            {sugerencia.minutos === 1 ? "" : "s"} y el perro sigue aquí
          </p>
          <p className="text-sm text-amarillo-oscuro">
            No hay cargo por recogida tardía: si se queda, la estancia se convierte en noche de hotel y
            se cobra a su tarifa. La salida queda para el siguiente día que abrimos (el de sábado se entrega
            el lunes: dos noches). Tú decides, no se aplica solo.
          </p>
        </div>
        <div className="flex gap-2">
          {sugerencia.hotelNombre ? (
            <Button type="button" cargando={convirtiendo.cargando} onClick={convertir}>
              {convirtiendo.cargando ? "Convirtiendo…" : "Convertir en noche de hotel"}
            </Button>
          ) : (
            <span className="text-sm font-semibold text-amarillo-oscuro">
              Ningún servicio de hotel tiene tarifa capturada: captúrala en Servicios para poder convertir.
            </span>
          )}
          <Button type="button" variante="secundario" onClick={() => setOmitida(true)}>
            Omitir
          </Button>
        </div>
      </div>
      {error && (
        <Alert variante="error" titulo="No se pudo convertir">
          {error}
        </Alert>
      )}
    </div>
  );
}
