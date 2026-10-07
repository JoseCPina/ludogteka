"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { AjustarDiasPase } from "@/components/pases/ajustar-dias-pase";
import { MOTIVOS_AJUSTE, type PaseAjustable } from "@/lib/bonos/ajuste";
import { aplicarBonoAEstancia } from "../../../bono-actions";
import { deshacerCheckin } from "../../../pase-ajuste-actions";

export type EstadoPaseCheckin =
  | { tipo: "cubierto"; descripcion: string; bono?: PaseAjustable }
  | { tipo: "disponible"; descripcion: string; precioDia: number; bono?: PaseAjustable }
  | { tipo: "paga"; precioDia: number }
  | { tipo: "no_aplica" };

// Lo primero que recepción necesita saber al recibir a un perro de
// guardería: viene con pase o paga el día. Y si ESTE perro tiene pases sin
// aplicar (se compraron después de reservar), aplicarlos aquí mismo. El
// paquete es por perro: el de otro perro del mismo dueño no cuenta.
export function PaseCheckin({
  estanciaId,
  estado,
  perroNombre,
  enCurso = false,
  puedeAjustar = false,
  esAdmin = false,
}: {
  estanciaId: string;
  estado: EstadoPaseCheckin;
  perroNombre?: string;
  // El perro ya está adentro: se puede deshacer su check-in.
  enCurso?: boolean;
  puedeAjustar?: boolean;
  esAdmin?: boolean;
}) {
  const router = useRouter();
  const aplicando = useEspera();
  const [error, setError] = useState<string | null>(null);

  if (estado.tipo === "no_aplica") return null;

  async function aplicar() {
    setError(null);
    const res = await aplicando.ejecutar(() => aplicarBonoAEstancia(estanciaId));
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  if (estado.tipo === "cubierto") {
    return (
      <div className="rounded-lg border-l-4 border-menta bg-menta-suave px-4 py-3">
        <p className="font-bold text-menta-oscuro">Viene con pase</p>
        <p className="text-sm text-menta-oscuro">{estado.descripcion}</p>
        {puedeAjustar && estado.bono && (
          <div className="mt-2 flex flex-col gap-2">
            <AjustarDiasPase pase={{ ...estado.bono, perro_nombre: perroNombre }} esAdmin={esAdmin} />
            {enCurso && <DeshacerCheckin estanciaId={estanciaId} />}
          </div>
        )}
      </div>
    );
  }

  if (estado.tipo === "disponible") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 border-ambar bg-ambar-suave px-4 py-3">
        <div>
          <p className="font-bold text-ambar-oscuro">Tiene pases sin aplicar</p>
          <p className="text-sm text-ambar-oscuro">
            {estado.descripcion}. Hoy quedó como día suelto (${estado.precioDia.toFixed(2)}).
          </p>
          {error && <p className="mt-1 text-sm font-semibold text-coral-oscuro">{error}</p>}
          {puedeAjustar && estado.bono && (
            <div className="mt-2">
              <AjustarDiasPase pase={{ ...estado.bono, perro_nombre: perroNombre }} esAdmin={esAdmin} />
            </div>
          )}
        </div>
        <Button type="button" cargando={aplicando.cargando} onClick={aplicar}>
          {aplicando.cargando ? "Aplicando…" : "Usar el pase para hoy"}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-l-4 border-n-300 bg-n-50 px-4 py-3">
      <p className="font-bold text-n-900">Paga el día suelto: ${estado.precioDia.toFixed(2)}</p>
      <p className="text-sm text-n-600">Este perro no tiene pases ni mensualidad vigentes (el paquete es por perro).</p>
    </div>
  );
}

// Deshacer un check-in hecho por error: el perro vuelve a «reservada», el
// check-in queda en el historial del pase y el día regresa al saldo. Pide
// motivo y confirmación.
function DeshacerCheckin({ estanciaId }: { estanciaId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("checkin_por_error");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const envio = useEspera();

  async function confirmar() {
    setError(null);
    if (motivo === "otro" && !texto.trim()) return setError("Con «Otro», escribe el motivo.");
    const res = await envio.ejecutar(() => deshacerCheckin(estanciaId, motivo, texto));
    if (res.error) return setError(res.error);
    router.refresh();
  }

  if (!abierto) {
    return (
      <Button type="button" variante="secundario" className="self-start" onClick={() => setAbierto(true)}>
        Deshacer este check-in
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-md border border-n-200 bg-white p-3">
      <p className="text-sm text-n-700">
        El perro vuelve a «reservada» y el día regresa al pase. El check-in que se había capturado queda en el
        historial del pase. No cambia ningún cobro ni la caja.
      </p>
      <Select label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
        {MOTIVOS_AJUSTE.map((m) => (
          <option key={m.clave} value={m.clave}>
            {m.etiqueta}
          </option>
        ))}
      </Select>
      {motivo === "otro" && <Textarea label="Escribe el motivo" value={texto} onChange={(e) => setTexto(e.target.value)} />}
      <AccionesFormulario error={error}>
        <Button type="button" variante="peligro" cargando={envio.cargando} onClick={confirmar}>
          Sí, deshacer el check-in
        </Button>
        <Button type="button" variante="secundario" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </AccionesFormulario>
    </div>
  );
}
