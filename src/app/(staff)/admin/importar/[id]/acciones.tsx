"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { useEspera } from "@/hooks/use-espera";
import { esperarConTope } from "@/lib/ui/espera";
import { deshacerImportacion, procesarLote, revisarDeshacer } from "../actions";

type Bloqueo = { tipo?: string; nombre?: string; motivo: string; cuenta?: number };

export function AccionesImportacion({ id, estado, pendientes }: { id: string; estado: string; pendientes: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [bloqueos, setBloqueos] = useState<Bloqueo[] | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const revisar = useEspera({ tope: 60_000 });
  const deshacer = useEspera({ tope: 120_000 });
  const seguir = useEspera({ tope: 60 * 60_000 });
  const parar = useRef(false);

  async function alRevisar() {
    setError(null);
    setAviso(null);
    const r = await revisar.ejecutar(() => revisarDeshacer(id));
    if (r.error || !("puede" in r)) {
      setError(r.error);
      return;
    }
    setBloqueos(r.bloqueos);
    setConfirmando(r.puede);
  }

  async function alDeshacer() {
    setError(null);
    const r = await deshacer.ejecutar(() => deshacerImportacion(id));
    if (r.error) {
      setError(r.error);
      return;
    }
    setConfirmando(false);
    setAviso("Listo: la importación se deshizo.");
    router.refresh();
  }

  async function alRetomar() {
    setError(null);
    parar.current = false;
    const r = await seguir.correr(async () => {
      for (;;) {
        const res = await esperarConTope(() => procesarLote(id), 90_000);
        if (res.error || !("progreso" in res)) throw new Error(res.error ?? "No se pudo continuar.");
        if (res.progreso.estado !== "procesando" && res.progreso.estado !== "preparada") return;
        if (parar.current) return;
      }
    });
    if (!r.ok) setError(r.error);
    router.refresh();
  }

  if (estado === "procesando" || estado === "preparada") {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-borde bg-white p-4">
        <p className="text-n-800">
          {estado === "preparada"
            ? "Esta importación no terminó de subirse. Vuelve a subir el mismo archivo desde «Importar» para continuarla."
            : `Quedan ${pendientes.toLocaleString("es-MX")} filas por procesar.`}
        </p>
        {estado === "procesando" && (
          <AccionesFormulario error={error}>
            <Button type="button" cargando={seguir.cargando} onClick={alRetomar}>
              Continuar la importación
            </Button>
          </AccionesFormulario>
        )}
      </section>
    );
  }
  if (estado !== "completada") return aviso ? <Alert variante="exito" titulo={aviso} /> : null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-borde bg-white p-4">
      <h2 className="font-bold text-n-900">Deshacer esta importación</h2>
      <p className="text-n-700">
        Da de baja los dueños y mascotas que creó y regresa lo que actualizó a como estaba. Solo se puede si nadie los ha modificado después y no
        tienen nada registrado (citas, estancias, cobros, vacunas…).
      </p>
      {aviso && <Alert variante="exito" titulo={aviso} />}
      {bloqueos && bloqueos.length > 0 && (
        <Alert variante="advertencia" titulo="No se puede deshacer todavía">
          <ul className="list-disc pl-5">
            {bloqueos.slice(0, 8).map((b, i) => (
              <li key={i}>
                {b.nombre ? `${b.nombre}: ` : ""}
                {b.motivo}
                {b.cuenta ? ` (${b.cuenta})` : ""}
              </li>
            ))}
          </ul>
          {bloqueos.length > 8 && <p>…y {bloqueos.length - 8} más.</p>}
        </Alert>
      )}
      {confirmando && (
        <Alert variante="info" titulo="Se puede deshacer">
          Nadie ha tocado esos registros. Confirma para darlos de baja.
        </Alert>
      )}
      <AccionesFormulario error={error}>
        {!confirmando ? (
          <Button type="button" variante="secundario" cargando={revisar.cargando} onClick={alRevisar}>
            Revisar si se puede deshacer
          </Button>
        ) : (
          <>
            <Button type="button" variante="secundario" onClick={() => setConfirmando(false)}>
              No, dejar como está
            </Button>
            <Button type="button" variante="peligro" cargando={deshacer.cargando} onClick={alDeshacer}>
              Sí, deshacer la importación
            </Button>
          </>
        )}
      </AccionesFormulario>
    </section>
  );
}
