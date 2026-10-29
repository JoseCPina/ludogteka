"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { convertirEnNocheHotel } from "../../../checkin-actions";
import { EnlaceOTexto } from "@/components/acceso-contexto";
import { formatearFechaCalendario } from "@/lib/formato";

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
  // Ya convertida: lo dice con la respuesta (la estancia como quedó), sin esperar a que la página se recargue.
  const [convertida, setConvertida] = useState<{ salida: string | null } | null>(null);

  if (omitida) return null;
  if (convertida) {
    return (
      <Alert variante="exito" titulo="Convertida en noche de hotel">
        <span data-convertida-hotel>
          La estancia ya es de hotel y se cobra a su tarifa
          {convertida.salida ? `; la salida queda para el ${formatearFechaCalendario(convertida.salida)}` : ""}.
        </span>
      </Alert>
    );
  }

  async function convertir() {
    setError(null);
    const res = await convirtiendo.ejecutar(() => convertirEnNocheHotel(estanciaId));
    if (res.error) {
      setError(res.error);
      return;
    }
    const estancia = res.registros?.find((r) => r.t === "estancias")?.datos;
    setConvertida({ salida: (estancia?.fecha_salida as string | null | undefined) ?? null });
    // El resto de la página (servicio, salida, cuenta) se refresca después, sin detener el botón.
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-ambar bg-ambar-suave p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-ambar-oscuro">
            Pasó el cierre ({sugerencia.horaCierre}) hace {sugerencia.minutos} minuto
            {sugerencia.minutos === 1 ? "" : "s"} y el perro sigue aquí
          </p>
          <p className="text-sm text-ambar-oscuro">
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
            <span className="text-sm font-semibold text-ambar-oscuro">
              Ningún servicio de hotel tiene precio capturado. Captúralo en{" "}
              <EnlaceOTexto href="/servicios" className="underline">
                Servicios
              </EnlaceOTexto>{" "}
              para poder convertir.
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
