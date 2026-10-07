"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { useZonaNegocio } from "@/components/zona-negocio";
import { ajustarDiasPase } from "@/app/(staff)/reservas/pase-ajuste-actions";
import { calcularVistaPrevia, MOTIVOS_AJUSTE, type PaseAjustable } from "@/lib/bonos/ajuste";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";

const MAX_FECHAS = 10;

function fechaTexto(v: string | null) {
  return v ? formatearFechaCalendario(v) : "sin vencimiento";
}

/**
 * «Ajustar días usados» de un pase: el nuevo total (o suma/resta), las
 * fechas afectadas si se conocen, un motivo obligatorio y el antes/después
 * a la vista antes de confirmar. No mueve dinero ni caja.
 */
export function AjustarDiasPase({
  pase,
  esAdmin,
  etiqueta = "Ajustar días usados",
}: {
  pase: PaseAjustable;
  esAdmin: boolean;
  etiqueta?: string;
}) {
  const router = useRouter();
  const zona = useZonaNegocio();
  const hoy = hoyNegocio(zona);
  const usadosActuales = Math.max(pase.cantidad_total - pase.cantidad_disponible, 0);
  const [abierto, setAbierto] = useState(false);
  const [usados, setUsados] = useState(String(usadosActuales));
  const [motivo, setMotivo] = useState("");
  const [motivoTexto, setMotivoTexto] = useState("");
  const [fechas, setFechas] = useState<string[]>([]);
  const [vigencia, setVigencia] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const envio = useEspera();

  const nuevo = usados.trim() === "" ? null : Number(usados);
  const vp = calcularVistaPrevia(pase, nuevo, vigencia || null, hoy);
  const nFechas = Math.abs(vp.cambio);
  const pideFechas = !vp.error && nFechas > 0 && nFechas <= MAX_FECHAS;
  const fechasVisibles = Array.from({ length: pideFechas ? nFechas : 0 }, (_, i) => fechas[i] ?? "");
  const sinCambios = vp.cambio === 0 && !vigencia;
  const pasaVigencia = vigencia !== "" && vigencia !== pase.fecha_vencimiento;

  function abrir() {
    setUsados(String(usadosActuales));
    setMotivo("");
    setMotivoTexto("");
    setFechas([]);
    setVigencia("");
    setError(null);
    setExito(null);
    setAbierto(true);
  }

  function mover(delta: number) {
    const base = nuevo ?? usadosActuales;
    setUsados(String(Math.min(Math.max(base + delta, 0), pase.cantidad_total)));
  }

  async function confirmar() {
    setError(null);
    if (vp.error) return setError(vp.error);
    if (sinCambios) return setError("No cambiaste nada: pon un total distinto o una vigencia nueva.");
    if (!motivo) return setError("Elige el motivo del ajuste.");
    if (motivo === "otro" && !motivoTexto.trim()) return setError("Con «Otro», escribe el motivo.");
    const llenas = fechasVisibles.filter(Boolean);
    if (llenas.length !== 0 && llenas.length !== fechasVisibles.length) {
      return setError("Completa las fechas o déjalas todas vacías.");
    }
    const res = await envio.ejecutar(() =>
      ajustarDiasPase(pase.id, nuevo as number, llenas, motivo, motivoTexto, pasaVigencia ? vigencia : null)
    );
    if (res.error) return setError(res.error);
    setExito(
      res.sigueVencido
        ? `Listo: ${res.usadosAntes} → ${res.usadosDespues} días usados. Ojo: el pase sigue vencido, esos días no se podrán usar.`
        : `Listo: ${res.usadosAntes} → ${res.usadosDespues} días usados.`
    );
    setAbierto(false);
    router.refresh();
  }

  if (!abierto) {
    return (
      <AccionesFormulario error={error} exito={exito}>
        <Button type="button" variante="secundario" onClick={abrir}>
          {etiqueta}
        </Button>
      </AccionesFormulario>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
      <p className="font-bold text-n-900">
        Ajustar días usados · {pase.servicio_nombre}
        {pase.perro_nombre ? ` · ${pase.perro_nombre}` : ""}
      </p>
      <p className="-mt-1 text-sm text-n-600">
        Solo cambia el saldo de días del pase. No genera cobros ni mueve la caja, y queda en el historial del pase.
      </p>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-n-800">
          Días usados en total (de {pase.cantidad_total})
        </span>
        <div className="flex items-end gap-2">
          <Button type="button" variante="secundario" aria-label="Quitar un día usado" onClick={() => mover(-1)}>
            −1
          </Button>
          <div className="w-28">
            <Field
              label="Total usado"
              type="number"
              inputMode="numeric"
              min={0}
              max={pase.cantidad_total}
              step={1}
              value={usados}
              onChange={(e) => setUsados(e.target.value)}
            />
          </div>
          <Button type="button" variante="secundario" aria-label="Sumar un día usado" onClick={() => mover(1)}>
            +1
          </Button>
        </div>
      </div>

      {pideFechas && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-n-800">
            {vp.cambio > 0 ? "Fechas de los días que se agregan" : "Fechas de los días que se quitan"} (opcional)
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {fechasVisibles.map((f, i) => (
              <Field
                key={i}
                label={`Día ${i + 1}`}
                type="date"
                max={vp.cambio > 0 ? hoy : undefined}
                value={f}
                onChange={(e) => {
                  const valor = e.target.value;
                  setFechas(() => fechasVisibles.map((x, j) => (j === i ? valor : x)));
                }}
              />
            ))}
          </div>
        </div>
      )}
      {!vp.error && nFechas > MAX_FECHAS && (
        <p className="text-sm text-n-600">Son {nFechas} días: las fechas se omiten, anótalo en el motivo si hace falta.</p>
      )}

      <Select label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
        <option value="">Elige el motivo…</option>
        {MOTIVOS_AJUSTE.map((m) => (
          <option key={m.clave} value={m.clave}>
            {m.etiqueta}
          </option>
        ))}
      </Select>
      {motivo === "otro" && (
        <Textarea label="Escribe el motivo" value={motivoTexto} onChange={(e) => setMotivoTexto(e.target.value)} />
      )}

      {esAdmin && (pase.estado === "vencido" || vigencia) && (
        <Field
          label="Extender la vigencia hasta (solo admin, opcional)"
          type="date"
          min={hoy}
          value={vigencia}
          onChange={(e) => setVigencia(e.target.value)}
          ayuda="Si el pase ya venció y el ajuste le devuelve días, sin esto no se podrán usar."
        />
      )}
      {esAdmin && pase.estado !== "vencido" && !vigencia && (
        <button
          type="button"
          className="self-start text-sm font-semibold text-morado hover:underline"
          onClick={() => setVigencia(pase.fecha_vencimiento && pase.fecha_vencimiento >= hoy ? pase.fecha_vencimiento : hoy)}
        >
          También extender la vigencia
        </button>
      )}

      <div className="rounded-md border border-n-200 bg-white p-3 text-sm">
        <p className="mb-1 font-bold text-n-900">Antes → después</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-n-600">Días usados</dt>
          <dd className="font-semibold text-n-900">
            {vp.usadosAntes} → {vp.usadosDespues}
          </dd>
          <dt className="text-n-600">Días restantes</dt>
          <dd className="font-semibold text-n-900">
            {vp.restantesAntes} → {vp.restantesDespues}
          </dd>
          <dt className="text-n-600">Vence</dt>
          <dd className="font-semibold text-n-900">
            {vp.vencimientoAntes === vp.vencimientoDespues
              ? fechaTexto(vp.vencimientoAntes)
              : `${fechaTexto(vp.vencimientoAntes)} → ${fechaTexto(vp.vencimientoDespues)}`}
          </dd>
        </dl>
      </div>

      {vp.reabre && !vp.sigueVencido && (
        <Alert variante="info" titulo="Este ajuste reabre el pase">
          Se había acabado y vuelve a tener días disponibles. Se respeta su vigencia.
        </Alert>
      )}
      {vp.sigueVencido && (
        <Alert variante="advertencia" titulo="El pase está vencido">
          {esAdmin
            ? "Los días que le quedan no se podrán usar hasta que extiendas la vigencia (campo de arriba)."
            : "Los días que le quedan no se podrán usar. Solo un admin puede extender la vigencia."}
        </Alert>
      )}

      <AccionesFormulario error={error}>
        <Button type="button" cargando={envio.cargando} disabled={Boolean(vp.error) || sinCambios} onClick={confirmar}>
          Confirmar ajuste
        </Button>
        <Button type="button" variante="secundario" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </AccionesFormulario>
    </div>
  );
}
