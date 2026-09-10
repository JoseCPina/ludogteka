"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { probarConexionGoogle, type EstadoDiagnostico } from "./diagnostico-google-actions";

function Resultado({ estado }: { estado: EstadoDiagnostico }) {
  if (estado.error) {
    return (
      <Alert variante="error" titulo="No se pudo correr la prueba">
        {estado.error}
      </Alert>
    );
  }
  const pruebas = estado.pruebas ?? [];
  const simulado = pruebas.some((p) => p.simulado);
  const fallo = pruebas.some((p) => !p.ok);

  return (
    <div className="flex flex-col gap-3">
      {simulado ? (
        <Alert variante="advertencia" titulo="Está respondiendo en modo simulación">
          No hay GOOGLE_MAPS_API_KEY configurada en este entorno, así que las distancias que ve
          recepción son inventadas (siempre las mismas para la misma dirección). En desarrollo es lo
          esperado y evita gastar cuota; si esto sale en producción, falta la variable en Vercel.
        </Alert>
      ) : fallo ? (
        <Alert variante="error" titulo="La llave no está funcionando">
          Abajo dice cuál de las dos APIs falló y qué hay que revisar en Google Cloud.
        </Alert>
      ) : (
        <Alert variante="exito" titulo="Las dos APIs respondieron" />
      )}

      <ul className="flex flex-col gap-2">
        {pruebas.map((p) => (
          <li
            key={p.api}
            className={`rounded-lg border-[1.5px] p-4 ${
              p.simulado
                ? "border-amarillo bg-amarillo-suave"
                : p.ok
                  ? "border-verde bg-verde-suave"
                  : "border-naranja bg-naranja-suave"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-n-900">{p.api}</span>
              <span className="text-xs text-n-600">
                {p.simulado ? "simulado" : p.ok ? "respondió" : "falló"} · {p.ms} ms
              </span>
            </div>
            <p className="mt-1 break-words text-sm text-n-700">{p.detalle}</p>
            {p.sugerencia && (
              <p className="mt-2 text-sm font-semibold text-n-900">Qué revisar: {p.sugerencia}</p>
            )}
          </li>
        ))}
      </ul>

      {estado.direccionProbada && (
        <p className="text-xs text-n-500">
          Dirección usada para la prueba: {estado.direccionProbada} (la de la propia sucursal, para
          que un &quot;no la encuentro&quot; señale a la llave y no al texto).
        </p>
      )}
    </div>
  );
}

export function DiagnosticoGoogle() {
  const [estado, setEstado] = useState<EstadoDiagnostico | null>(null);
  const [corriendo, setCorriendo] = useState(false);

  async function correr() {
    setCorriendo(true);
    const res = await probarConexionGoogle();
    setCorriendo(false);
    setEstado(res);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-n-600">
        Comprueba que el cotizador de recolección pueda hablar con Google: geocodifica una dirección
        conocida y mide la ruta base → domicilio → Ludogteka, que es exactamente lo que hace cuando
        recepción captura la dirección de un cliente. Si algo está mal en Google Cloud (una API sin
        habilitar, la facturación caída, una restricción de la llave), aquí se ve — y no con el
        cliente enfrente.
      </p>
      <p className="text-sm text-n-500">
        Cada prueba gasta dos llamadas facturables, una por API. No hace falta correrla seguido:
        sirve al configurar la llave, al cambiarla, o cuando a recepción le empiece a fallar.
      </p>

      <Button type="button" disabled={corriendo} onClick={correr} className="self-start">
        {corriendo ? "Probando…" : "Probar conexión con Google"}
      </Button>

      {estado && <Resultado estado={estado} />}
    </div>
  );
}
