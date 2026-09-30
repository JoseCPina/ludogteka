"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import { registrarRetiro, cerrarTurno, cancelarRetiro } from "../caja-actions";
import { useZonaNegocio } from "@/components/zona-negocio";

export type Retiro = {
  id: string;
  monto: number;
  motivo: string;
  creadoEn: string;
  creadoPorNombre: string;
  cancelado: boolean;
  motivoCancelacion: string | null;
  canceladoPorNombre: string | null;
  puedeCancelar: boolean;
};

function dinero(v: number): string {
  return `$${v.toFixed(2)}`;
}

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  terminal: "Terminal",
  transferencia: "Transferencia",
};

export function TurnoAbierto({
  turnoId,
  fondoInicial,
  abiertoEn,
  abiertoPorNombre,
  notasApertura,
  retiros,
  puedeCerrar,
  abiertoPorMi,
}: {
  turnoId: string;
  fondoInicial: number;
  abiertoEn: string;
  abiertoPorNombre: string;
  notasApertura: string | null;
  retiros: Retiro[];
  puedeCerrar: boolean;
  abiertoPorMi: boolean;
}) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const [registrandoRetiro, setRegistrandoRetiro] = useState(false);
  const [montoRetiro, setMontoRetiro] = useState("");
  const [motivoRetiro, setMotivoRetiro] = useState("");
  const guardandoRetiro = useEspera();

  const [cerrando, setCerrando] = useState(false);
  const [conteoEfectivo, setConteoEfectivo] = useState("");
  const [conteoTerminal, setConteoTerminal] = useState("");
  const [conteoTransferencia, setConteoTransferencia] = useState("");
  const [notasCierre, setNotasCierre] = useState("");
  const [explicacion, setExplicacion] = useState("");
  const [revelado, setRevelado] = useState<{
    esperadoEfectivo: number;
    esperadoTerminal: number;
    esperadoTransferencia: number;
    diferenciaEfectivo: number;
    diferenciaTerminal: number;
    diferenciaTransferencia: number;
  } | null>(null);
  const guardandoCierre = useEspera();
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  const cancelandoRetiro = useEspera();

  // Solo los vivos suman: un retiro cancelado se ve tachado y no cuenta.
  const totalRetiros = retiros.filter((r) => !r.cancelado).reduce((sum, r) => sum + r.monto, 0);

  async function confirmarCancelacion(id: string) {
    setError(null);
    const res = await cancelandoRetiro.ejecutar(() => cancelarRetiro(id, motivoCancelacion));
    if (res.error) {
      setError(res.error);
      return;
    }
    setCancelando(null);
    setMotivoCancelacion("");
    router.refresh();
  }

  async function enviarRetiro() {
    const monto = Number(montoRetiro);
    if (!Number.isFinite(monto) || monto <= 0) {
      setError("El monto del retiro debe ser mayor a cero.");
      return;
    }
    if (!motivoRetiro.trim()) {
      setError("Escribe el motivo del retiro.");
      return;
    }
    setError(null);
    const res = await guardandoRetiro.ejecutar(() => registrarRetiro(monto, motivoRetiro));
    if (res.error) {
      setError(res.error);
      return;
    }
    setMontoRetiro("");
    setMotivoRetiro("");
    setRegistrandoRetiro(false);
    router.refresh();
  }

  function iniciarCierre() {
    setCerrando(true);
    setRevelado(null);
    setConteoEfectivo("");
    setConteoTerminal("");
    setConteoTransferencia("");
    setNotasCierre("");
    setExplicacion("");
  }

  async function enviarConteo() {
    const efectivo = Number(conteoEfectivo);
    const terminal = Number(conteoTerminal);
    const transferencia = Number(conteoTransferencia);
    if (
      conteoEfectivo === "" ||
      conteoTerminal === "" ||
      conteoTransferencia === "" ||
      !Number.isFinite(efectivo) ||
      !Number.isFinite(terminal) ||
      !Number.isFinite(transferencia) ||
      efectivo < 0 ||
      terminal < 0 ||
      transferencia < 0
    ) {
      setError("Captura el conteo de los tres métodos (puede ser 0).");
      return;
    }
    setError(null);
    const res = await guardandoCierre.ejecutar(() =>
      cerrarTurno(turnoId, efectivo, terminal, transferencia, "", notasCierre)
    );
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.cerrado) {
      router.refresh();
      return;
    }
    // Hay diferencia: recién ahora se revela lo que el sistema esperaba.
    setRevelado({
      esperadoEfectivo: res.esperadoEfectivo,
      esperadoTerminal: res.esperadoTerminal,
      esperadoTransferencia: res.esperadoTransferencia,
      diferenciaEfectivo: res.diferenciaEfectivo,
      diferenciaTerminal: res.diferenciaTerminal,
      diferenciaTransferencia: res.diferenciaTransferencia,
    });
  }

  async function confirmarConExplicacion() {
    if (!explicacion.trim()) {
      setError("Escribe la explicación de la diferencia.");
      return;
    }
    setError(null);
    const res = await guardandoCierre.ejecutar(() =>
      cerrarTurno(
        turnoId,
        Number(conteoEfectivo),
        Number(conteoTerminal),
        Number(conteoTransferencia),
        explicacion,
        notasCierre
      )
    );
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variante="error" titulo="No se pudo completar la acción">
          {error}
        </Alert>
      )}

      <div className="rounded-lg border border-n-200 bg-white p-5">
        <p className="font-semibold text-n-900">Turno abierto</p>
        <p className="text-sm text-n-600">
          Abrió {abiertoPorNombre} el {formatearFecha(abiertoEn, zona)} · Fondo inicial {dinero(fondoInicial)}
        </p>
        {notasApertura && <p className="mt-1 text-sm text-n-500">{notasApertura}</p>}
        {!puedeCerrar && (
          <p className="mt-2 text-sm font-semibold text-ambar-oscuro" data-turno-ajeno>
            Este turno lo abrió {abiertoPorNombre} con su cuenta: solo {abiertoPorNombre} o un admin pueden cerrarlo.
            Tú puedes cobrar y registrar retiros en él.
          </p>
        )}
        {puedeCerrar && !abiertoPorMi && (
          <p className="mt-2 text-sm text-n-600">Lo abrió otra persona; como admin puedes cerrarlo y queda registrado que lo cerraste tú.</p>
        )}
      </div>

      {!cerrando ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" variante="secundario" onClick={() => setRegistrandoRetiro((v) => !v)}>
            {registrandoRetiro ? "Ya no registrar retiro" : "Registrar retiro"}
          </Button>
          {puedeCerrar && (
            <Button type="button" variante="peligro" onClick={iniciarCierre}>
              Cerrar turno
            </Button>
          )}
        </div>
      ) : null}

      {registrandoRetiro && !cerrando && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
          <div className="w-32">
            <Field
              label="Monto"
              type="number"
              min="0"
              step="0.01"
              value={montoRetiro}
              onChange={(e) => setMontoRetiro(e.target.value)}
            />
          </div>
          <div className="min-w-[240px] flex-1">
            <Field
              label="Motivo"
              value={motivoRetiro}
              onChange={(e) => setMotivoRetiro(e.target.value)}
              placeholder="ej. Pago a proveedor de alimento"
            />
          </div>
          <Button type="button" cargando={guardandoRetiro.cargando} onClick={enviarRetiro}>
            {guardandoRetiro.cargando ? "Guardando…" : "Confirmar retiro"}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold uppercase tracking-wide text-n-600">
          Retiros de este turno {retiros.length > 0 ? `— total ${dinero(totalRetiros)}` : ""}
        </p>
        {retiros.length === 0 ? (
          <p className="text-sm text-n-500">Ninguno todavía.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {retiros.map((r) => (
              <li
                key={r.id}
                data-retiro={r.cancelado ? "cancelado" : "vivo"}
                className={`flex flex-col gap-2 rounded-md border border-n-200 bg-white px-3 py-2 text-sm ${r.cancelado ? "opacity-70" : ""}`}
              >
                <div className="flex justify-between gap-3">
                  <span className={`text-n-700 ${r.cancelado ? "line-through" : ""}`}>
                    {r.motivo} — {r.creadoPorNombre} · {formatearFecha(r.creadoEn, zona)}
                  </span>
                  <span className={`font-semibold ${r.cancelado ? "text-n-400 line-through" : "text-n-900"}`}>{dinero(r.monto)}</span>
                </div>
                {r.cancelado && (
                  <p className="text-xs font-semibold text-coral-oscuro">
                    Cancelado{r.canceladoPorNombre ? ` por ${r.canceladoPorNombre}` : ""}{r.motivoCancelacion ? `: ${r.motivoCancelacion}` : " (gasto cancelado)"}
                  </p>
                )}
                {r.puedeCancelar && !cerrando && cancelando !== r.id && (
                  <button
                    type="button"
                    className="self-start text-xs font-semibold text-coral-oscuro hover:underline"
                    onClick={() => {
                      setCancelando(r.id);
                      setMotivoCancelacion("");
                    }}
                  >
                    Cancelar este retiro…
                  </button>
                )}
                {cancelando === r.id && (
                  <div className="flex flex-wrap items-end gap-2 rounded-md bg-coral-suave p-2">
                    <div className="min-w-[240px] flex-1">
                      <Field
                        label="¿Por qué se cancela?"
                        value={motivoCancelacion}
                        onChange={(e) => setMotivoCancelacion(e.target.value)}
                        placeholder="ej. Se registró dos veces"
                      />
                    </div>
                    <Button type="button" variante="peligro" cargando={cancelandoRetiro.cargando} onClick={() => confirmarCancelacion(r.id)}>
                      {cancelandoRetiro.cargando ? "Cancelando…" : "Cancelar retiro"}
                    </Button>
                    <Button type="button" variante="secundario" disabled={cancelandoRetiro.cargando} onClick={() => setCancelando(null)}>
                      Dejarlo
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {cerrando && (
        <div className="flex flex-col gap-4 rounded-lg border-[1.5px] border-coral bg-coral-suave p-5">
          <p className="font-bold text-coral-oscuro">Cerrar turno — arqueo</p>

          {!revelado ? (
            <>
              <p className="text-sm text-coral-oscuro">
                Cuenta el efectivo físico y anota lo que reporta la terminal, ANTES de continuar. Lo que captures
                aquí se compara contra el sistema hasta después de enviarlo — no se te muestra antes.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field
                  label="Efectivo contado"
                  type="number"
                  min="0"
                  step="0.01"
                  value={conteoEfectivo}
                  onChange={(e) => setConteoEfectivo(e.target.value)}
                  autoFocus
                />
                <Field
                  label="Terminal (reporte del lote)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={conteoTerminal}
                  onChange={(e) => setConteoTerminal(e.target.value)}
                />
                <Field
                  label="Transferencia"
                  type="number"
                  min="0"
                  step="0.01"
                  value={conteoTransferencia}
                  onChange={(e) => setConteoTransferencia(e.target.value)}
                />
              </div>
              <Textarea label="Notas de cierre (opcional)" value={notasCierre} onChange={(e) => setNotasCierre(e.target.value)} />
              <div className="flex gap-2">
                <Button type="button" cargando={guardandoCierre.cargando} onClick={enviarConteo}>
                  {guardandoCierre.cargando ? "Comparando…" : "Enviar conteo"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setCerrando(false)}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-coral-oscuro">
                Hay diferencia contra lo que esperaba el sistema. Escribe la explicación para poder cerrar — nunca
                se ajusta en silencio.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border-b border-coral py-1 text-left text-xs font-bold uppercase text-coral-oscuro">
                        Método
                      </th>
                      <th className="border-b border-coral py-1 text-right text-xs font-bold uppercase text-coral-oscuro">
                        Contado
                      </th>
                      <th className="border-b border-coral py-1 text-right text-xs font-bold uppercase text-coral-oscuro">
                        Esperado
                      </th>
                      <th className="border-b border-coral py-1 text-right text-xs font-bold uppercase text-coral-oscuro">
                        Diferencia
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["efectivo", Number(conteoEfectivo), revelado.esperadoEfectivo, revelado.diferenciaEfectivo],
                        ["terminal", Number(conteoTerminal), revelado.esperadoTerminal, revelado.diferenciaTerminal],
                        [
                          "transferencia",
                          Number(conteoTransferencia),
                          revelado.esperadoTransferencia,
                          revelado.diferenciaTransferencia,
                        ],
                      ] as [string, number, number, number][]
                    ).map(([metodo, contado, esperado, diferencia]) => (
                      <tr key={metodo}>
                        <td className="border-b border-coral/30 py-1 text-coral-oscuro">{ETIQUETA_METODO[metodo]}</td>
                        <td className="border-b border-coral/30 py-1 text-right tabular-nums text-coral-oscuro">
                          {dinero(contado)}
                        </td>
                        <td className="border-b border-coral/30 py-1 text-right tabular-nums text-coral-oscuro">
                          {dinero(esperado)}
                        </td>
                        <td className="border-b border-coral/30 py-1 text-right tabular-nums font-bold text-coral-oscuro">
                          {diferencia > 0 ? "+" : ""}
                          {dinero(diferencia)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Field
                label="Explicación de la diferencia"
                value={explicacion}
                onChange={(e) => setExplicacion(e.target.value)}
                placeholder="ej. Faltaron $50 en efectivo, no se encontró la causa"
              />
              <div className="flex gap-2">
                <Button type="button" cargando={guardandoCierre.cargando} onClick={confirmarConExplicacion}>
                  {guardandoCierre.cargando ? "Cerrando…" : "Confirmar cierre"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setCerrando(false)}>
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
