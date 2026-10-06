"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { CamposTarjetaManual } from "@/components/cobro/campos-tarjeta-manual";
import {
  AVISO_COBRO_TARJETA,
  ETIQUETA_TARJETA_MANUAL,
  cargaTarjetaManual,
  datosVacios,
  validarTarjetaManual,
  type DatosTarjetaManual,
} from "@/lib/cobro/tarjeta-manual";
import { formatearFechaCalendario } from "@/lib/formato";
import { formatearTelefono } from "@/lib/telefono";
import type { ResumenCobro } from "@/lib/pagos/tipos";
import type { MetodoPago } from "@/app/(staff)/reservas/cobro-actions";
import { CobroIntegrado, type OrdenCobroFila } from "@/app/(staff)/reservas/[id]/cobrar/cobro-integrado";
import { registrarCobroGrupo } from "../cobro-grupo-actions";

export type CuentaJunto = {
  reservaId: string;
  descripcion: string;
  perros: string;
  fechaActividad: string;
  totalCuenta: number;
  saldo: number;
};

type FilaMetodo = { metodo: MetodoPago; monto: string; propina: string; tarjeta: DatosTarjetaManual };
const nuevaFila = (): FilaMetodo => ({ metodo: "efectivo", monto: "", propina: "0", tarjeta: datosVacios() });

const centavos = (v: number) => Math.round(v * 100);
const dinero = (v: number) => `$${v.toFixed(2)}`;

/**
 * Cobro de varias cuentas de la misma persona en un solo movimiento: un
 * pago, un folio y una propina, repartidos entre las cuentas (la más antigua
 * primero, con montos editables por cuenta). Lo que no se cubre queda como
 * saldo de cada cuenta. Con terminal o link es UNA orden por el total.
 */
export function CobroJunto({
  cliente,
  cuentas,
  turnoAbierto,
  puedeTarjetaManual,
  terminalManualBloqueada,
  esAdmin,
  mp,
}: {
  cliente: { id: string; nombre: string; telefono: string | null };
  cuentas: CuentaJunto[];
  turnoAbierto: boolean;
  puedeTarjetaManual: boolean;
  terminalManualBloqueada: boolean;
  esAdmin: boolean;
  mp: { disponible: ResumenCobro; ordenes: OrdenCobroFila[] };
}) {
  const router = useRouter();
  const [montos, setMontos] = useState<string[]>(cuentas.map((c) => c.saldo.toFixed(2)));
  const [totalEscrito, setTotalEscrito] = useState<string | null>(null);
  const [metodos, setMetodos] = useState<FilaMetodo[]>([nuevaFila()]);
  const [montoTocado, setMontoTocado] = useState(false);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cobrando = useEspera();

  const valor = (i: number) => (Number.isFinite(Number(montos[i])) ? Number(montos[i]) : 0);
  const totalCuentas = cuentas.reduce((s, _c, i) => s + valor(i), 0);
  const totalSaldo = cuentas.reduce((s, c) => s + c.saldo, 0);
  const totalMetodos = metodos.reduce((s, m) => s + (Number(m.monto) || 0), 0);
  const propinaTotal = metodos.reduce((s, m) => s + (Number(m.propina) || 0), 0);
  const diferencia = Math.round((totalMetodos - totalCuentas) * 100) / 100;

  // Con un solo método y sin haberlo tocado, el monto es el total de las cuentas.
  function montoDeMetodo(i: number, m: FilaMetodo) {
    return metodos.length === 1 && !montoTocado && i === 0 ? totalCuentas.toFixed(2) : m.monto;
  }
  const metodosEfectivos = metodos.map((m, i) => ({ ...m, monto: montoDeMetodo(i, m) }));

  function actualizarMetodo(i: number, cambios: Partial<FilaMetodo>) {
    if (cambios.monto !== undefined) setMontoTocado(true);
    setMetodos((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...cambios } : m)));
  }

  // Pago parcial: lo que se recibe se aplica de la cuenta más antigua a la más nueva.
  function repartirTotal(texto: string) {
    setTotalEscrito(texto);
    let resto = centavos(Number(texto) || 0);
    setMontos(
      cuentas.map((c) => {
        const toma = Math.min(resto, centavos(c.saldo));
        resto -= toma;
        return (toma / 100).toFixed(2);
      })
    );
  }

  // Lo que se va a mandar: solo las cuentas con monto.
  const partes = cuentas.map((c, i) => ({ reservaId: c.reservaId, monto: Math.round(valor(i) * 100) / 100 })).filter((p) => p.monto > 0);

  function validarCuentas(): string | null {
    for (const [i, c] of cuentas.entries()) {
      const v = valor(i);
      if (v < 0 || centavos(v) !== Math.round(v * 100)) return "El monto de cada cuenta tiene que ser positivo y con dos decimales a lo más.";
      if (centavos(v) > centavos(c.saldo)) return `«${c.descripcion}» debe ${dinero(c.saldo)}: no se le puede aplicar ${dinero(v)}.`;
      const resto = (centavos(c.saldo) - centavos(v)) / 100;
      if (resto > 0 && resto < 1) return `«${c.descripcion}» se quedaría debiendo ${dinero(resto)} (menos de un peso). Ajusta su monto para saldarla o dejar al menos $1.`;
    }
    if (partes.length < 2) return "Con una sola cuenta con monto no es un cobro junto: cóbrala desde su cuenta.";
    return null;
  }

  async function enviar() {
    const falla = validarCuentas();
    if (falla) return setError(falla);
    const payload = metodosEfectivos.map((m) => ({
      metodo: m.metodo,
      monto: Number(m.monto) || 0,
      propina: Number(m.propina) || 0,
      ...(m.metodo === "tarjeta_manual" ? cargaTarjetaManual(m.tarjeta) : {}),
    }));
    if (payload.some((m) => m.monto <= 0)) return setError("Cada método debe tener un monto mayor a cero.");
    if (centavos(payload.reduce((s, m) => s + m.monto, 0)) !== centavos(totalCuentas)) {
      return setError(`Lo que se paga (${dinero(payload.reduce((s, m) => s + m.monto, 0))}) tiene que ser igual al total de las cuentas (${dinero(totalCuentas)}).`);
    }
    for (const m of metodosEfectivos) {
      if (m.metodo !== "tarjeta_manual") continue;
      const f = validarTarjetaManual(m.tarjeta);
      if (f) return setError(f);
    }
    setError(null);
    const res = await cobrando.ejecutar(() => registrarCobroGrupo(partes, notas, payload));
    if (res.error) return setError(res.error);
    router.push(`/caja/recibo-junto/${res.grupoId}`);
  }

  return (
    <div className="flex flex-col gap-4" data-cobro-junto>
      <div className="rounded-lg border border-n-200 bg-n-50 p-4">
        <p className="text-sm text-n-600">Cobrando juntas las cuentas de</p>
        <p className="text-lg font-bold text-n-900">{cliente.nombre}</p>
        {cliente.telefono && <p className="text-sm text-n-600">{formatearTelefono(cliente.telefono)}</p>}
      </div>

      <section className="flex flex-col gap-2" aria-label="Cuentas incluidas">
        <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Cuentas incluidas ({cuentas.length})</h2>
        <ul className="flex flex-col gap-2">
          {cuentas.map((c, i) => (
            <li key={c.reservaId} data-cuenta-junto={c.reservaId} className="flex flex-col gap-2 rounded-md border border-n-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-n-900">{c.descripcion}</p>
                  <p className="text-xs text-n-500">
                    {c.perros ? `${c.perros} · ` : ""}
                    {formatearFechaCalendario(c.fechaActividad)}
                  </p>
                </div>
                <p className="text-right text-sm text-n-600">
                  Debe <span className="font-bold tabular-nums text-coral-oscuro">{dinero(c.saldo)}</span>
                  <br />
                  <span className="text-xs text-n-500">de {dinero(c.totalCuenta)}</span>
                </p>
              </div>
              <div className="w-44">
                <Field
                  label="Se le aplica"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={montos[i]}
                  onChange={(e) => {
                    setTotalEscrito(null);
                    setMontos((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)));
                  }}
                  data-monto-cuenta
                />
              </div>
              {valor(i) < c.saldo - 0.005 && valor(i) >= 0 && (
                <p className="text-xs text-n-600">Quedará debiendo {dinero(Math.round((c.saldo - valor(i)) * 100) / 100)}.</p>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-morado bg-morado-suave/40 p-3">
          <div className="w-52">
            <Field
              label="Total que paga hoy"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={totalEscrito ?? totalCuentas.toFixed(2)}
              onChange={(e) => repartirTotal(e.target.value)}
              onBlur={() => setTotalEscrito(null)}
              ayuda="Si paga menos, se aplica de la cuenta más antigua a la más nueva."
              data-total-junto
            />
          </div>
          <p className="text-sm text-n-600">
            Debe en total <span className="font-bold tabular-nums text-n-900">{dinero(totalSaldo)}</span>
          </p>
        </div>
      </section>

      <CobroIntegrado
        grupo={{ partes }}
        saldo={totalCuentas}
        turnoAbierto={turnoAbierto && partes.length >= 2}
        disponible={mp.disponible}
        ordenes={mp.ordenes}
        clienteTelefono={cliente.telefono}
        esAdmin={esAdmin}
      />

      {!turnoAbierto ? (
        <div className="rounded-lg border-[1.5px] border-ambar bg-ambar-suave p-4">
          <p className="font-bold text-ambar-oscuro">No hay turno de caja abierto</p>
          <p className="mt-1 text-sm text-ambar-oscuro">Ábrelo con el fondo inicial para poder registrar cobros.</p>
          <Link href="/caja/turno" className="mt-3 inline-block">
            <Button type="button">Abrir turno</Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
          <p className="font-semibold text-n-900">Registrar el pago (un solo cobro)</p>
          {terminalManualBloqueada && (
            <p data-terminal-bloqueada className="text-sm text-n-600">
              {AVISO_COBRO_TARJETA}
            </p>
          )}
          {metodosEfectivos.map((m, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <Select label="Método" value={m.metodo} onChange={(e) => actualizarMetodo(i, { metodo: e.target.value as MetodoPago })}>
                  <option value="efectivo">Efectivo</option>
                  {!terminalManualBloqueada && <option value="terminal">Terminal</option>}
                  <option value="transferencia">Transferencia</option>
                  {puedeTarjetaManual && <option value="tarjeta_manual">{ETIQUETA_TARJETA_MANUAL}</option>}
                </Select>
              </div>
              <div className="w-32">
                <Field label="Monto" type="number" min="0" step="0.01" inputMode="decimal" value={m.monto} onChange={(e) => actualizarMetodo(i, { monto: e.target.value })} />
              </div>
              <div className="w-32">
                <Field label={i === 0 ? "Propina (una sola)" : "Propina"} type="number" min="0" step="0.01" inputMode="decimal" value={m.propina} onChange={(e) => actualizarMetodo(i, { propina: e.target.value })} />
              </div>
              {metodos.length > 1 && (
                <Button
                  type="button"
                  variante="secundario"
                  onClick={() => {
                    setMontoTocado(true);
                    setMetodos((prev) => prev.filter((_, idx) => idx !== i));
                  }}
                >
                  Quitar
                </Button>
              )}
              {m.metodo === "tarjeta_manual" && (
                <div className="flex w-full flex-col gap-1">
                  <CamposTarjetaManual valor={m.tarjeta} onChange={(cambios) => actualizarMetodo(i, { tarjeta: { ...m.tarjeta, ...cambios } })} />
                  <p className="text-xs text-n-600">Un solo folio para todo el grupo: el del voucher de {dinero(Number(m.monto) || 0)}.</p>
                </div>
              )}
            </div>
          ))}
          <Button
            type="button"
            variante="secundario"
            className="self-start"
            onClick={() => {
              // Al repartir en otro método, el monto del primero ya es lo que el usuario decide.
              setMetodos((prev) => (prev.length === 1 && !montoTocado ? [{ ...prev[0], monto: totalCuentas.toFixed(2) }, nuevaFila()] : [...prev, nuevaFila()]));
              setMontoTocado(true);
            }}
          >
            + Repartir en otro método
          </Button>

          <Textarea label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />

          <div className="flex flex-col gap-1 rounded-md bg-n-50 p-3 text-sm text-n-700">
            <p>
              Total de las cuentas: <span className="font-semibold text-n-900">{dinero(totalCuentas)}</span>
              {propinaTotal > 0 ? ` + ${dinero(propinaTotal)} de propina` : ""}
            </p>
            {diferencia !== 0 && (
              <p className="font-semibold text-coral-oscuro">
                {diferencia < 0 ? `Faltan ${dinero(-diferencia)} por repartir en los métodos.` : `Sobran ${dinero(diferencia)} en los métodos.`}
              </p>
            )}
          </div>

          <AccionesFormulario error={error}>
            <Button type="button" cargando={cobrando.cargando} onClick={enviar} data-registrar-junto>
              {cobrando.cargando ? "Cobrando…" : `Registrar cobro de ${dinero(totalCuentas)}`}
            </Button>
          </AccionesFormulario>
        </div>
      )}
    </div>
  );
}
