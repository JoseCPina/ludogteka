"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import { registrarRetiro, cerrarTurno } from "./caja-actions";

export type Retiro = {
  id: string;
  monto: number;
  motivo: string;
  creadoEn: string;
  creadoPorNombre: string;
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
}: {
  turnoId: string;
  fondoInicial: number;
  abiertoEn: string;
  abiertoPorNombre: string;
  notasApertura: string | null;
  retiros: Retiro[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const [registrandoRetiro, setRegistrandoRetiro] = useState(false);
  const [montoRetiro, setMontoRetiro] = useState("");
  const [motivoRetiro, setMotivoRetiro] = useState("");
  const [guardandoRetiro, setGuardandoRetiro] = useState(false);

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
  const [guardandoCierre, setGuardandoCierre] = useState(false);

  const totalRetiros = retiros.reduce((sum, r) => sum + r.monto, 0);

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
    setGuardandoRetiro(true);
    setError(null);
    const res = await registrarRetiro(monto, motivoRetiro);
    setGuardandoRetiro(false);
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
    setGuardandoCierre(true);
    setError(null);
    const res = await cerrarTurno(turnoId, efectivo, terminal, transferencia, "", notasCierre);
    setGuardandoCierre(false);
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
    setGuardandoCierre(true);
    setError(null);
    const res = await cerrarTurno(
      turnoId,
      Number(conteoEfectivo),
      Number(conteoTerminal),
      Number(conteoTransferencia),
      explicacion,
      notasCierre
    );
    setGuardandoCierre(false);
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
          Abrió {abiertoPorNombre} el {formatearFecha(abiertoEn)} · Fondo inicial {dinero(fondoInicial)}
        </p>
        {notasApertura && <p className="mt-1 text-sm text-n-500">{notasApertura}</p>}
      </div>

      {!cerrando ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" variante="secundario" onClick={() => setRegistrandoRetiro((v) => !v)}>
            {registrandoRetiro ? "Cancelar retiro" : "Registrar retiro"}
          </Button>
          <Button type="button" variante="peligro" onClick={iniciarCierre}>
            Cerrar turno
          </Button>
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
          <Button type="button" disabled={guardandoRetiro} onClick={enviarRetiro}>
            {guardandoRetiro ? "Guardando…" : "Confirmar retiro"}
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
              <li key={r.id} className="flex justify-between rounded-md border border-n-200 bg-white px-3 py-2 text-sm">
                <span className="text-n-700">
                  {r.motivo} — {r.creadoPorNombre}
                </span>
                <span className="font-semibold text-n-900">{dinero(r.monto)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cerrando && (
        <div className="flex flex-col gap-4 rounded-lg border-[1.5px] border-naranja bg-naranja-suave p-5">
          <p className="font-bold text-naranja-oscuro">Cerrar turno — arqueo</p>

          {!revelado ? (
            <>
              <p className="text-sm text-naranja-oscuro">
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
                <Button type="button" disabled={guardandoCierre} onClick={enviarConteo}>
                  {guardandoCierre ? "Comparando…" : "Enviar conteo"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setCerrando(false)}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-naranja-oscuro">
                Hay diferencia contra lo que esperaba el sistema. Escribe la explicación para poder cerrar — nunca
                se ajusta en silencio.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border-b border-naranja py-1 text-left text-xs font-bold uppercase text-naranja-oscuro">
                        Método
                      </th>
                      <th className="border-b border-naranja py-1 text-right text-xs font-bold uppercase text-naranja-oscuro">
                        Contado
                      </th>
                      <th className="border-b border-naranja py-1 text-right text-xs font-bold uppercase text-naranja-oscuro">
                        Esperado
                      </th>
                      <th className="border-b border-naranja py-1 text-right text-xs font-bold uppercase text-naranja-oscuro">
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
                        <td className="border-b border-naranja/30 py-1 text-naranja-oscuro">{ETIQUETA_METODO[metodo]}</td>
                        <td className="border-b border-naranja/30 py-1 text-right tabular-nums text-naranja-oscuro">
                          {dinero(contado)}
                        </td>
                        <td className="border-b border-naranja/30 py-1 text-right tabular-nums text-naranja-oscuro">
                          {dinero(esperado)}
                        </td>
                        <td className="border-b border-naranja/30 py-1 text-right tabular-nums font-bold text-naranja-oscuro">
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
                <Button type="button" disabled={guardandoCierre} onClick={confirmarConExplicacion}>
                  {guardandoCierre ? "Cerrando…" : "Confirmar cierre"}
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
