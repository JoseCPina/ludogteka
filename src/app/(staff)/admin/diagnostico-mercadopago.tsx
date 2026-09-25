"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { probarConexionMercadoPago, ponerTerminalPdv, type EstadoDiagnosticoMp } from "./diagnostico-mercadopago-actions";

export function DiagnosticoMercadoPago() {
  const [estado, setEstado] = useState<EstadoDiagnosticoMp | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const corriendo = useEspera();
  const cambiando = useEspera();

  async function correr() {
    setAviso(null);
    const res = await corriendo.ejecutar(() => probarConexionMercadoPago());
    setEstado(res);
  }

  async function pdv(id: string) {
    const res = await cambiando.ejecutar(() => ponerTerminalPdv(id));
    setAviso(res.error ?? `Terminal ${id} puesta en modo PDV. Vuelve a probar.`);
    if (!res.error) await correr();
  }

  const pruebas = estado?.pruebas ?? [];
  const simulado = pruebas.some((p) => p.simulado);
  const fallo = pruebas.some((p) => !p.ok);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-n-600">
        Comprueba la credencial, la terminal Point (vinculada y en modo PDV) y el webhook. No cobra nada: son lecturas. Si
        a recepción le falla la terminal, aquí se ve qué es — y no con el cliente enfrente.
      </p>

      <AccionesFormulario error={aviso && /No|no se pudo|rechaz/i.test(aviso) ? aviso : null} exito={aviso && !/No|no se pudo|rechaz/i.test(aviso) ? aviso : null}>
        <Button type="button" cargando={corriendo.cargando} onClick={correr}>
          {corriendo.cargando ? "Probando…" : "Probar conexión con Mercado Pago"}
        </Button>
      </AccionesFormulario>

      {estado?.error && (
        <Alert variante="error" titulo="No se pudo correr la prueba">
          {estado.error}
        </Alert>
      )}

      {estado && !estado.error && (
        <div className="flex flex-col gap-3">
          {simulado ? (
            <Alert variante="advertencia" titulo="Está respondiendo en modo simulación">
              No hay MERCADOPAGO_ACCESS_TOKEN en este entorno: la terminal y los links se &quot;pagan&quot; solos y no mueven
              dinero. En desarrollo es lo esperado; si esto sale en producción, faltan las variables en Vercel.
            </Alert>
          ) : fallo ? (
            <Alert variante="error" titulo="Algo no está listo">
              Abajo dice qué falló y qué revisar en Mercado Pago o en Vercel.
            </Alert>
          ) : (
            <Alert variante="exito" titulo="Mercado Pago listo: credencial, terminal y webhook" />
          )}

          <ul className="flex flex-col gap-2">
            {pruebas.map((p) => (
              <li
                key={p.nombre}
                className={`rounded-lg border-[1.5px] p-4 ${
                  p.simulado ? "border-ambar bg-ambar-suave" : p.ok ? "border-menta bg-menta-suave" : "border-coral bg-coral-suave"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-n-900">{p.nombre}</span>
                  <span className="text-xs text-n-600">
                    {p.simulado ? "simulado" : p.ok ? "ok" : "falló"}
                    {p.ms ? ` · ${p.ms} ms` : ""}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm text-n-700">{p.detalle}</p>
                {p.sugerencia && <p className="mt-2 text-sm font-semibold text-n-900">Qué revisar: {p.sugerencia}</p>}
              </li>
            ))}
          </ul>

          {estado.terminales && estado.terminales.length > 0 && !estado.simulado && (
            <div className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4">
              <p className="text-sm font-bold text-n-900">Terminales de la cuenta</p>
              {estado.terminales.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-2">
                  <CampoCopiable valor={t.id} textoBoton="Copiar id" monoespaciado className="flex-1" />
                  <span className="text-sm text-n-600">modo {t.operating_mode ?? "?"}</span>
                  {t.operating_mode !== "PDV" && (
                    <Button type="button" variante="secundario" cargando={cambiando.cargando} onClick={() => pdv(t.id)}>
                      Poner en modo PDV
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {estado.urlWebhook && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-n-800">URL del webhook para el panel de Mercado Pago</p>
              <CampoCopiable valor={estado.urlWebhook} textoBoton="Copiar URL" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
