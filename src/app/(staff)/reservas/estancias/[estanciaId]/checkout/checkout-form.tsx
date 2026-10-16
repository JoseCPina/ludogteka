"use client";
import { esperarConTope } from "@/lib/ui/espera";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
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
  // Lo normal es que todo regrese con el dueño: llegan marcadas como entregadas y se desmarca lo que no se entrega.
  // Se guardan al confirmar la salida.
  const [pertenencias, setPertenencias] = useState(() => pertenenciasIniciales.map((p) => ({ ...p, devuelto: true })));
  const [salidaActual, setSalidaActual] = useState(fechaSalida);
  const extendiendo = useEspera();

  const [recogidoNombre, setRecogidoNombre] = useState("");
  const [recogidoTelefono, setRecogidoTelefono] = useState("");
  const [esDueno, setEsDueno] = useState<boolean | null>(null);

  const [confirmandoConPendientes, setConfirmandoConPendientes] = useState(false);
  const enviando = useEspera();
  const [error, setError] = useState<string | null>(null);
  // Lo que falta en el formulario: se marca el campo y se enfoca.
  const [falta, setFalta] = useState<"nombre" | "dueno" | null>(null);

  const pendientes = pertenencias.filter((p) => !p.devuelto);

  function toggle(p: Pertenencia) {
    setPertenencias((prev) => prev.map((x) => (x.id === p.id ? { ...x, devuelto: !x.devuelto } : x)));
  }

  async function extenderEstancia() {
    setError(null);
    const nuevaSalida = sumarDiasFecha(salidaActual, 1);
    const res = await extendiendo.ejecutar(() => moverFechas(estanciaId, fechaEntrada, nuevaSalida));
    if (res.error) {
      setError(res.error);
      return;
    }
    setSalidaActual(nuevaSalida);
  }

  async function enviarCheckout() {
    if (!recogidoNombre.trim()) {
      setFalta("nombre");
      setError("Escribe quién recoge al perro.");
      document.getElementById("checkout-recoge-nombre")?.focus();
      return;
    }
    if (esDueno === null) {
      setFalta("dueno");
      setError("Indica si quien recoge es el dueño registrado o una persona autorizada.");
      document.getElementById("checkout-recoge-dueno")?.focus();
      return;
    }
    setFalta(null);
    if (pendientes.length > 0 && !confirmandoConPendientes) {
      setConfirmandoConPendientes(true);
      return;
    }

    setError(null);
    const res = await enviando.ejecutar(() => confirmarCheckout(estanciaId, {
      recogidoPorNombre: recogidoNombre,
      recogidoPorTelefono: recogidoTelefono,
      recogidoPorEsDueno: esDueno,
      pertenenciasEntregadas: pertenencias.filter((p) => p.devuelto).map((p) => p.id),
    }));
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
          <Button type="button" variante="secundario" cargando={extendiendo.cargando} onClick={extenderEstancia}>
            {extendiendo.cargando ? "Extendiendo…" : "Extender 1 noche"}
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
                  <span className={p.devuelto ? "text-n-900" : "font-semibold text-coral-oscuro"}>
                    {p.descripcion}
                  </span>
                  {!p.devuelto && (
                    <span className="ml-auto text-xs font-bold uppercase text-coral-oscuro">
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
          id="checkout-recoge-nombre"
          label="Quién recoge al perro (obligatorio)"
          required
          error={falta === "nombre" ? "Escribe quién recoge al perro." : undefined}
          value={recogidoNombre}
          onChange={(e) => {
            setRecogidoNombre(e.target.value);
            setFalta(null);
          }}
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

      <div
        id="checkout-recoge-dueno"
        tabIndex={-1}
        className={falta === "dueno" ? "rounded-md border-[1.5px] border-coral-oscuro bg-coral-suave p-2" : undefined}
      >
        <p className="mb-1.5 text-sm font-semibold text-n-800">¿Es el dueño registrado? (obligatorio)</p>
        {falta === "dueno" && (
          <p className="mb-1.5 text-sm font-semibold text-coral-oscuro">Indica si quien recoge es el dueño registrado o una persona autorizada.</p>
        )}
        <div className="flex gap-3">
          <Button
            type="button"
            variante={esDueno === true ? "exito" : "secundario"}
            onClick={() => {
              setEsDueno(true);
              setFalta(null);
            }}
          >
            Sí, es el dueño
          </Button>
          <Button
            type="button"
            variante={esDueno === false ? "peligro" : "secundario"}
            onClick={() => {
              setEsDueno(false);
              setFalta(null);
            }}
          >
            No, persona autorizada
          </Button>
        </div>
        {esDueno === false && (
          <p className="mt-2 text-sm font-semibold text-coral-oscuro">
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

      <AccionesFormulario error={error}>
        <Button type="button" cargando={enviando.cargando} onClick={enviarCheckout}>
          {enviando.cargando ? "Guardando…" : "Confirmar salida"}
        </Button>
      </AccionesFormulario>
    </div>
  );
}
