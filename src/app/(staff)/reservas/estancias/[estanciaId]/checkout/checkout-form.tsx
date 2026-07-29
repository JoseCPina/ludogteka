"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario, sumarDiasFecha } from "@/lib/formato";
import { alternarPertenencia, confirmarCheckout } from "../../../checkin-actions";
import { moverFechas } from "../../../reserva-actions";

type Pertenencia = { id: string; descripcion: string; devuelto: boolean };

export function CheckoutForm({
  estanciaId,
  esHotel,
  fechaEntrada,
  fechaSalida,
  pertenenciasIniciales,
}: {
  estanciaId: string;
  esHotel: boolean;
  fechaEntrada: string;
  fechaSalida: string;
  pertenenciasIniciales: Pertenencia[];
}) {
  const router = useRouter();
  const [pertenencias, setPertenencias] = useState(pertenenciasIniciales);
  const [salidaActual, setSalidaActual] = useState(fechaSalida);
  const [extendiendo, setExtendiendo] = useState(false);

  const [recogidoNombre, setRecogidoNombre] = useState("");
  const [recogidoTelefono, setRecogidoTelefono] = useState("");
  const [esDueno, setEsDueno] = useState<boolean | null>(null);

  const [confirmandoConPendientes, setConfirmandoConPendientes] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendientes = pertenencias.filter((p) => !p.devuelto);

  async function toggle(p: Pertenencia) {
    const nuevoValor = !p.devuelto;
    setPertenencias((prev) => prev.map((x) => (x.id === p.id ? { ...x, devuelto: nuevoValor } : x)));
    await alternarPertenencia(p.id, nuevoValor);
  }

  async function extenderEstancia() {
    setExtendiendo(true);
    setError(null);
    const nuevaSalida = sumarDiasFecha(salidaActual, 1);
    const res = await moverFechas(estanciaId, fechaEntrada, nuevaSalida);
    setExtendiendo(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSalidaActual(nuevaSalida);
  }

  async function enviarCheckout() {
    if (!recogidoNombre.trim()) {
      setError("Registra quién recoge al perro.");
      return;
    }
    if (esDueno === null) {
      setError("Indica si quien recoge es el dueño registrado o una persona autorizada.");
      return;
    }
    if (pendientes.length > 0 && !confirmandoConPendientes) {
      setConfirmandoConPendientes(true);
      return;
    }

    setEnviando(true);
    setError(null);
    const res = await confirmarCheckout(estanciaId, {
      recogidoPorNombre: recogidoNombre,
      recogidoPorTelefono: recogidoTelefono,
      recogidoPorEsDueno: esDueno,
    });
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {esHotel && (
        <div className="flex items-center gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
          <div>
            <p className="text-sm text-n-600">Salida programada</p>
            <p className="font-bold text-n-900">{formatearFechaCalendario(salidaActual)}</p>
          </div>
          <Button type="button" variante="secundario" disabled={extendiendo} onClick={extenderEstancia}>
            {extendiendo ? "Extendiendo…" : "Extender 1 noche"}
          </Button>
          <p className="text-sm text-n-600">
            El dueño no llega todavía y el cupo de esta noche ya se liberó — usa este botón antes
            de que alguien más lo tome.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-n-800">Pertenencias — confirma la entrega</p>
        {pertenencias.length === 0 ? (
          <p className="text-sm text-n-500">No se registraron pertenencias al llegar.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pertenencias.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2 rounded-md border border-n-200 bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    checked={p.devuelto}
                    onChange={() => toggle(p)}
                    className="h-4 w-4"
                  />
                  <span className={p.devuelto ? "text-n-900" : "font-semibold text-naranja-oscuro"}>
                    {p.descripcion}
                  </span>
                  {!p.devuelto && (
                    <span className="ml-auto text-xs font-bold uppercase text-naranja-oscuro">
                      Sin entregar
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Quién recoge al perro"
          value={recogidoNombre}
          onChange={(e) => setRecogidoNombre(e.target.value)}
          placeholder="Nombre de quien lo recoge"
          autoFocus
        />
        <Field
          label="Teléfono (opcional)"
          value={recogidoTelefono}
          onChange={(e) => setRecogidoTelefono(e.target.value)}
          placeholder="10 dígitos"
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-n-800">¿Es el dueño registrado?</p>
        <div className="flex gap-3">
          <Button
            type="button"
            variante={esDueno === true ? "exito" : "secundario"}
            onClick={() => setEsDueno(true)}
          >
            Sí, es el dueño
          </Button>
          <Button
            type="button"
            variante={esDueno === false ? "peligro" : "secundario"}
            onClick={() => setEsDueno(false)}
          >
            No, persona autorizada
          </Button>
        </div>
        {esDueno === false && (
          <p className="mt-2 text-sm font-semibold text-naranja-oscuro">
            Confirma que esta persona está autorizada antes de entregar al perro.
          </p>
        )}
      </div>

      {confirmandoConPendientes && (
        <Alert variante="advertencia" titulo="Quedan pertenencias sin confirmar">
          {pendientes.length === 1
            ? `"${pendientes[0].descripcion}" no está marcada como entregada.`
            : `${pendientes.length} pertenencias no están marcadas como entregadas.`}{" "}
          Pulsa &quot;Confirmar salida&quot; otra vez para cerrar el check-out de todos modos.
        </Alert>
      )}

      {error && (
        <Alert variante="error" titulo="No se pudo completar el check-out">
          {error}
        </Alert>
      )}

      <Button type="button" disabled={enviando} onClick={enviarCheckout} className="self-start">
        {enviando ? "Guardando…" : "Confirmar salida"}
      </Button>
    </div>
  );
}
