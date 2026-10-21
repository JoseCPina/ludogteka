"use client";
import { esperarConTope } from "@/lib/ui/espera";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario } from "@/lib/formato";
import { alternarPertenencia, confirmarCheckout } from "../../../checkin-actions";
import { MoverFechas } from "../../../mover-fechas";

type Pertenencia = { id: string; descripcion: string; devuelto: boolean };

export function CheckoutForm({
  estanciaId,
  esHotel,
  fechaEntrada,
  fechaSalida,
  version = null,
  pertenenciasIniciales,
}: {
  estanciaId: string;
  esHotel: boolean;
  fechaEntrada: string;
  fechaSalida: string;
  /** updated_at de la estancia al cargar (QA N43). */
  version?: string | null;
  pertenenciasIniciales: Pertenencia[];
}) {
  const router = useRouter();
  // Cada pertenencia se confirma a mano (o todas de un toque con «Entregué todo»). Se guardan al confirmar la salida.
  const [pertenencias, setPertenencias] = useState(() => pertenenciasIniciales.map((p) => ({ ...p, devuelto: false })));
  const [motivoSinEntrega, setMotivoSinEntrega] = useState("");
  const [salidaActual, setSalidaActual] = useState(fechaSalida);
  const [versionActual, setVersionActual] = useState(version);
  const [versionVista, setVersionVista] = useState(version);
  if (version !== versionVista) {
    setVersionVista(version);
    setVersionActual(version);
    setSalidaActual(fechaSalida);
  }
  const [extendiendo, setExtendiendo] = useState(false);

  const [recogidoNombre, setRecogidoNombre] = useState("");
  const [recogidoTelefono, setRecogidoTelefono] = useState("");
  const [esDueno, setEsDueno] = useState<boolean | null>(null);

  const enviando = useEspera();
  const [error, setError] = useState<string | null>(null);
  // Lo que falta en el formulario: se marca el campo y se enfoca.
  const [falta, setFalta] = useState<"nombre" | "dueno" | "motivo" | null>(null);

  const pendientes = pertenencias.filter((p) => !p.devuelto);

  function toggle(p: Pertenencia) {
    setPertenencias((prev) => prev.map((x) => (x.id === p.id ? { ...x, devuelto: !x.devuelto } : x)));
  }

  function entregueTodo() {
    setPertenencias((prev) => prev.map((x) => ({ ...x, devuelto: true })));
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
    if (pendientes.length > 0 && motivoSinEntrega.trim().length < 3) {
      setFalta("motivo");
      setError("Hay pertenencias sin entregar: escribe el motivo para cerrar la salida.");
      document.getElementById("checkout-motivo-sin-entrega")?.focus();
      return;
    }

    setError(null);
    const res = await enviando.ejecutar(() => confirmarCheckout(estanciaId, {
      recogidoPorNombre: recogidoNombre,
      recogidoPorTelefono: recogidoTelefono,
      recogidoPorEsDueno: esDueno,
      pertenenciasEntregadas: pertenencias.filter((p) => p.devuelto).map((p) => p.id),
      motivoSinEntrega: pendientes.length > 0 ? motivoSinEntrega : "",
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
          {!extendiendo && (
            <Button type="button" variante="secundario" onClick={() => setExtendiendo(true)} data-extender>
              Extender la salida
            </Button>
          )}
          <p className="text-sm text-n-600">
            El dueño no llega todavía y el cupo de esta noche ya se liberó — usa este botón antes
            de que alguien más lo tome.
          </p>
        </div>
      )}
      {esHotel && extendiendo && (
        <MoverFechas
          estanciaId={estanciaId}
          esGuarderia={false}
          entrada={fechaEntrada}
          salida={salidaActual}
          version={versionActual}
          soloSalida
          textoBoton="Extender la salida"
          onHecho={(r) => {
            setSalidaActual(r.salida);
            if (r.version) setVersionActual(r.version);
            setExtendiendo(false);
            router.refresh();
          }}
          onCancelar={() => setExtendiendo(false)}
        />
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-n-800">Pertenencias — confirma la entrega de cada una</p>
          {pertenencias.length > 0 && (
            <Button type="button" variante="secundario" onClick={entregueTodo} disabled={pendientes.length === 0} data-entregue-todo>
              Entregué todo
            </Button>
          )}
        </div>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3" data-quien-recoge>
          <Button
            type="button"
            variante={esDueno === true ? "exito" : "secundario"}
            className="w-full sm:w-auto"
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
            className="w-full sm:w-auto"
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

      {pendientes.length > 0 && (
        <div id="checkout-motivo-sin-entrega-bloque" className="flex flex-col gap-2">
          <Alert variante="advertencia" titulo="Quedan pertenencias sin entregar">
            {pendientes.length === 1
              ? `"${pendientes[0].descripcion}" no está marcada como entregada.`
              : `${pendientes.length} pertenencias no están marcadas como entregadas.`}{" "}
            Para cerrar la salida escribe el motivo; queda registrado.
          </Alert>
          <Textarea
            id="checkout-motivo-sin-entrega"
            label="Motivo de lo que no se entrega (obligatorio)"
            value={motivoSinEntrega}
            error={falta === "motivo" ? "Escribe el motivo." : undefined}
            onChange={(e) => {
              setMotivoSinEntrega(e.target.value);
              setFalta(null);
            }}
            placeholder="ej. El dueño la dejará para la próxima visita"
          />
        </div>
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
