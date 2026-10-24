"use client";

import { useRef, useState, useTransition } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { useZonaNegocio } from "@/components/zona-negocio";
import { formatearFecha } from "@/lib/formato";
import { dinero } from "@/lib/dinero";
import { abrirTurno, type EstadoAbrirTurno } from "../../reservas/turno-actions";

export function AbrirTurnoForm() {
  const router = useRouter();
  const zona = useZonaNegocio();
  const [fondoInicial, setFondoInicial] = useState("");
  const [notas, setNotas] = useState("");
  const cargando = useEspera();
  // QA S18 (N91): «Abriendo…» sigue hasta que la pantalla ya muestra el turno (antes quedaban 2–3 s sin aviso).
  const [refrescando, refrescar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // QA S30: una clave por formulario (la apertura es idempotente con ella) y un candado que se cierra en el MISMO clic:
  // el estado `cargando` llega un render después y un segundo clic rápido alcanzaba a mandar otra apertura.
  const [clave] = useState(() => crypto.randomUUID());
  const enviando = useRef(false);
  const [abierto, setAbierto] = useState<NonNullable<EstadoAbrirTurno["turno"]> & { yaHabiaUno: boolean } | null>(null);

  async function abrir() {
    if (enviando.current || abierto) return;
    const fondo = Number(fondoInicial);
    if (!Number.isFinite(fondo) || fondo < 0) {
      setError("El fondo inicial debe ser un número mayor o igual a cero.");
      return;
    }
    enviando.current = true;
    setError(null);
    const res = await cargando.ejecutar(() => abrirTurno(fondo, notas, clave));
    if (res.error || !res.turno) {
      enviando.current = false;
      setError(res.error ?? "No pudimos abrir el turno. Intenta de nuevo.");
      return;
    }
    // Se pinta con lo que respondió el servidor; la pantalla completa del turno llega con el refresco.
    setAbierto({ ...res.turno, yaHabiaUno: Boolean(res.yaHabiaUno) });
    refrescar(() => router.refresh());
  }

  if (abierto) {
    return (
      <div className="flex max-w-md flex-col gap-3" data-turno-recien-abierto>
        <Alert variante={abierto.yaHabiaUno ? "advertencia" : "exito"} titulo={abierto.yaHabiaUno ? "Ya había un turno abierto" : "Turno abierto"}>
          {abierto.yaHabiaUno ? "Sigues en el turno que ya estaba abierto: " : ""}
          Abierto el {formatearFecha(abierto.abiertoAt, zona)} · Fondo inicial {dinero(abierto.fondoInicial)}.
          {refrescando ? " Cargando el turno…" : ""}
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex max-w-md flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
      <p className="text-n-700">No hay turno de caja abierto. Ábrelo con el fondo con el que arrancas.</p>

      {error && (
        <Alert variante="error" titulo="No se pudo abrir el turno">
          {error}
        </Alert>
      )}

      <Field
        label="Fondo inicial"
        type="number"
        min="0"
        step="0.01"
        value={fondoInicial}
        onChange={(e) => setFondoInicial(e.target.value)}
        autoFocus
      />
      <Textarea label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />

      <AccionesFormulario error={error}>
        <Button type="button" cargando={cargando.cargando} disabled={cargando.cargando} onClick={abrir} data-abrir-turno>
          {cargando.cargando ? "Abriendo…" : "Abrir turno"}
        </Button>
      </AccionesFormulario>
    </div>
  );
}
