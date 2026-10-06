"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { BuscadorClientes } from "@/components/buscador-clientes";
import type { ClienteBuscable } from "@/lib/clientes/buscables";
import { formatearFechaCalendario } from "@/lib/formato";
import { formatearTelefono } from "@/lib/telefono";
import { useModulos } from "@/components/modulos-contexto";
import { registrarPagosMpPendientes } from "./cobro-integrado-actions";

export type CuentaAbierta = {
  reservaId: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  perros: string;
  descripcion: string;
  fechaActividad: string;
  totalCuenta: number;
  saldo: number;
};

// Las cuentas del mismo dueño que se pueden cobrar juntas, en el orden de la lista.
function agruparPorCliente(cuentas: CuentaAbierta[]): { clienteId: string; cuentas: CuentaAbierta[] }[] {
  const grupos: { clienteId: string; cuentas: CuentaAbierta[] }[] = [];
  for (const c of cuentas) {
    const g = grupos.find((x) => x.clienteId === c.clienteId);
    if (g) g.cuentas.push(c);
    else grupos.push({ clienteId: c.clienteId, cuentas: [c] });
  }
  return grupos;
}

export type PagoMpPendiente = { id: string; tipo: string; monto: number; clienteNombre: string; pagadaAt: string | null; simulado: boolean };

function dinero(v: number): string {
  return `$${v.toFixed(2)}`;
}

/**
 * El mostrador: quién está enfrente y qué se le cobra. Las cuentas con
 * saldo de hoy arriba, para cobrar de un clic; el buscador (perro, dueño
 * o teléfono) para el que no está en la lista; y desde el cliente
 * elegido, sus cuentas abiertas, un pase o un cargo suelto.
 */
export function MostradorCaja({
  clientes,
  cuentas,
  hoy,
  turnoAbierto,
  pendientesMp,
  publicoGeneralId,
}: {
  clientes: ClienteBuscable[];
  cuentas: CuentaAbierta[];
  hoy: string;
  turnoAbierto: boolean;
  pendientesMp: PagoMpPendiente[];
  // «Público en general» nunca se agrupa: cada venta es de alguien distinto.
  publicoGeneralId: string | null;
}) {
  const router = useRouter();
  const [cliente, setCliente] = useState<ClienteBuscable | null>(null);
  const tieneBonos = useModulos().tiene("bonos");
  const [error, setError] = useState<string | null>(null);
  const registrando = useEspera();
  // Las cuentas marcadas para cobrar juntas: solo de la misma persona.
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const seleccionadas = cuentas.filter((c) => seleccion.includes(c.reservaId));
  const clienteSeleccion = seleccionadas[0]?.clienteId ?? null;
  const totalSeleccion = seleccionadas.reduce((s, c) => s + c.saldo, 0);
  const sePuedeAgrupar = (c: CuentaAbierta) => c.clienteId !== publicoGeneralId;

  function alternar(c: CuentaAbierta) {
    setSeleccion((prev) => (prev.includes(c.reservaId) ? prev.filter((id) => id !== c.reservaId) : [...prev, c.reservaId]));
  }
  const hrefJunto = (ids: string[]) => `/caja/cobrar-junto?cuentas=${ids.join(",")}`;

  const deHoy = cuentas.filter((c) => c.fechaActividad === hoy);
  const otras = cuentas.filter((c) => c.fechaActividad !== hoy);
  const delCliente = cliente ? cuentas.filter((c) => c.clienteId === cliente.id) : [];

  async function registrarPendientes() {
    setError(null);
    const r = await registrando.ejecutar(() => registrarPagosMpPendientes());
    if (r.error) return setError(r.error);
    router.refresh();
  }

  function filaCuenta(c: CuentaAbierta) {
    const marcable = sePuedeAgrupar(c);
    const bloqueada = marcable && clienteSeleccion !== null && clienteSeleccion !== c.clienteId;
    return (
      <li key={c.reservaId} className="flex items-stretch gap-2" data-cuenta-fila={c.reservaId}>
        {marcable && (
          <label
            className={`flex w-11 shrink-0 cursor-pointer items-center justify-center rounded-md border border-n-200 bg-white ${bloqueada ? "cursor-not-allowed opacity-40" : "hover:border-morado"}`}
            title={bloqueada ? "Solo se cobran juntas las cuentas de la misma persona" : "Marcar para cobrar junto con otras cuentas de esta persona"}
          >
            <input
              type="checkbox"
              className="h-5 w-5 accent-morado"
              checked={seleccion.includes(c.reservaId)}
              disabled={bloqueada}
              onChange={() => alternar(c)}
              aria-label={`Marcar la cuenta de ${c.clienteNombre}: ${c.descripcion}`}
              data-cuenta-casilla
            />
          </label>
        )}
        <Link
          href={`/caja/cobrar/${c.reservaId}`}
          className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 rounded-md border border-n-200 bg-white px-4 py-3 hover:border-morado hover:bg-n-50"
        >
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold text-n-900">
              {c.clienteNombre}
              {c.perros ? <span className="font-normal text-n-600"> · {c.perros}</span> : null}
            </span>
            <span className="truncate text-sm text-n-600">{c.descripcion}</span>
            <span className="text-xs text-n-500">
              {formatearFechaCalendario(c.fechaActividad)} · {formatearTelefono(c.clienteTelefono)}
            </span>
          </span>
          <span className="flex flex-col items-end">
            <span className="text-lg font-bold tabular-nums text-coral-oscuro">{dinero(c.saldo)}</span>
            <span className="text-xs text-n-500">de {dinero(c.totalCuenta)}</span>
          </span>
        </Link>
      </li>
    );
  }

  // Una lista de cuentas: las de la misma persona juntas, con su total combinado
  // y «Cobrar todo junto».
  function listaCuentas(lista: CuentaAbierta[]) {
    return (
      <ul className="flex flex-col gap-3">
        {agruparPorCliente(lista).map((g) => {
          if (g.cuentas.length < 2 || g.clienteId === publicoGeneralId) {
            return g.cuentas.map((c) => filaCuenta(c));
          }
          const total = g.cuentas.reduce((s, c) => s + c.saldo, 0);
          return (
            <li key={g.clienteId} data-grupo-cliente={g.clienteId} className="flex flex-col gap-2 rounded-lg border-[1.5px] border-morado bg-n-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-n-900">
                  {g.cuentas[0].clienteNombre}
                  <span className="font-normal text-n-600"> · {g.cuentas.length} cuentas</span>
                </p>
                <p className="text-sm text-n-600">
                  Total junto: <span className="text-lg font-bold tabular-nums text-coral-oscuro">{dinero(total)}</span>
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                {g.cuentas.map((c) => filaCuenta(c))}
              </ul>
              <Link href={hrefJunto(g.cuentas.map((c) => c.reservaId))} className="self-start">
                <Button type="button" data-cobrar-todo-junto>Cobrar todo junto</Button>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {seleccionadas.length > 0 && (
        <div
          data-seleccion-junto
          className="sticky bottom-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border-[1.5px] border-morado bg-white p-3 shadow-lg"
        >
          <p className="text-sm text-n-700">
            <span className="font-semibold text-n-900">{seleccionadas[0].clienteNombre}</span> · {seleccionadas.length} {seleccionadas.length === 1 ? "cuenta marcada" : "cuentas marcadas"} ·{" "}
            <span className="text-lg font-bold tabular-nums text-coral-oscuro">{dinero(totalSeleccion)}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {seleccionadas.length >= 2 ? (
              <Link href={hrefJunto(seleccionadas.map((c) => c.reservaId))}>
                <Button type="button" data-cobrar-seleccion>Cobrar las marcadas juntas</Button>
              </Link>
            ) : (
              <span className="self-center text-xs text-n-500">Marca otra cuenta de esta persona para cobrarlas juntas.</span>
            )}
            <Button type="button" variante="secundario" onClick={() => setSeleccion([])}>
              Quitar marcas
            </Button>
          </div>
        </div>
      )}
      {error && (
        <Alert variante="error" titulo="No se pudo completar">
          {error}
        </Alert>
      )}

      {pendientesMp.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border-[1.5px] border-ambar bg-ambar-suave p-4">
          <p className="font-bold text-ambar-oscuro">
            {pendientesMp.length === 1 ? "Un pago de la terminal o de un link llegó" : `${pendientesMp.length} pagos de la terminal o de links llegaron`} sin turno abierto
          </p>
          <ul className="text-sm text-ambar-oscuro">
            {pendientesMp.map((p) => (
              <li key={p.id}>
                {p.clienteNombre} · {p.tipo === "point" ? "terminal" : "link"} · {dinero(p.monto)}
                {p.simulado ? " (simulado)" : ""}
              </li>
            ))}
          </ul>
          <p className="text-sm text-ambar-oscuro">
            {turnoAbierto
              ? "Ya hay turno: regístralos para que entren a este corte."
              : "Se registran solos en cuanto abras el turno."}
          </p>
          {turnoAbierto && (
            <Button type="button" cargando={registrando.cargando} onClick={registrarPendientes} className="self-start">
              {registrando.cargando ? "Registrando…" : "Registrar en este turno"}
            </Button>
          )}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">¿A quién le cobras?</h2>
        {cliente ? (
          <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-n-600">Cliente</p>
                <p className="font-bold text-n-900">
                  {cliente.nombre}
                  {cliente.perros.length > 0 && (
                    <span className="font-normal text-n-600"> · {cliente.perros.map((p) => p.nombre).join(", ")}</span>
                  )}
                </p>
                <p className="text-sm text-n-600">{formatearTelefono(cliente.telefono)}</p>
              </div>
              <Button type="button" variante="secundario" onClick={() => setCliente(null)}>
                Cambiar cliente
              </Button>
            </div>

            {delCliente.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {delCliente.map((c) => filaCuenta(c))}
              </ul>
            ) : (
              <p className="text-sm text-n-600">No tiene cuentas con saldo pendiente.</p>
            )}

            <div className="flex flex-wrap gap-2">
              <Link href={`/caja/cargo?cliente=${cliente.id}`}>
                <Button type="button">Cargo suelto</Button>
              </Link>
              <Link href={`/caja/venta?cliente=${cliente.id}`}>
                <Button type="button" variante="secundario">Venta rápida</Button>
              </Link>
              {tieneBonos && (
                <Link href={`/caja/pases?cliente=${cliente.id}`}>
                  <Button type="button" variante="secundario">Vender pase o mensualidad</Button>
                </Link>
              )}
              <Link href={`/clientes/${cliente.id}`}>
                <Button type="button" variante="secundario">Ver expediente</Button>
              </Link>
            </div>
          </div>
        ) : (
          <BuscadorClientes clientes={clientes} onElegir={setCliente} listarSinBusqueda={false} nuevoCliente="cualquiera" autoFocus />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Cuentas abiertas de hoy</h2>
        {deHoy.length === 0 ? (
          <p className="text-sm text-n-600">Nada pendiente de cobrar hoy.</p>
        ) : (
          listaCuentas(deHoy)
        )}
      </section>

      {otras.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Otras cuentas con saldo (±30 días)</h2>
          {listaCuentas(otras)}
        </section>
      )}
    </div>
  );
}
