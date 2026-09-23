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
import { registrarPagosMpPendientes } from "./mercadopago-actions";

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
}: {
  clientes: ClienteBuscable[];
  cuentas: CuentaAbierta[];
  hoy: string;
  turnoAbierto: boolean;
  pendientesMp: PagoMpPendiente[];
}) {
  const router = useRouter();
  const [cliente, setCliente] = useState<ClienteBuscable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const registrando = useEspera();

  const deHoy = cuentas.filter((c) => c.fechaActividad === hoy);
  const otras = cuentas.filter((c) => c.fechaActividad !== hoy);
  const delCliente = cliente ? cuentas.filter((c) => c.clienteId === cliente.id) : [];

  async function registrarPendientes() {
    setError(null);
    const r = await registrando.ejecutar(() => registrarPagosMpPendientes());
    if (r.error) return setError(r.error);
    router.refresh();
  }

  function FilaCuenta({ c }: { c: CuentaAbierta }) {
    return (
      <li>
        <Link
          href={`/caja/cobrar/${c.reservaId}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-n-200 bg-white px-4 py-3 hover:border-azul hover:bg-n-50"
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
            <span className="text-lg font-bold tabular-nums text-naranja-oscuro">{dinero(c.saldo)}</span>
            <span className="text-xs text-n-500">de {dinero(c.totalCuenta)}</span>
          </span>
        </Link>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variante="error" titulo="No se pudo completar">
          {error}
        </Alert>
      )}

      {pendientesMp.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border-[1.5px] border-amarillo bg-amarillo-suave p-4">
          <p className="font-bold text-amarillo-oscuro">
            {pendientesMp.length === 1 ? "Un pago de Mercado Pago llegó" : `${pendientesMp.length} pagos de Mercado Pago llegaron`} sin turno abierto
          </p>
          <ul className="text-sm text-amarillo-oscuro">
            {pendientesMp.map((p) => (
              <li key={p.id}>
                {p.clienteNombre} · {p.tipo === "point" ? "terminal" : "link"} · {dinero(p.monto)}
                {p.simulado ? " (simulado)" : ""}
              </li>
            ))}
          </ul>
          <p className="text-sm text-amarillo-oscuro">
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
                {delCliente.map((c) => (
                  <FilaCuenta key={c.reservaId} c={c} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-n-600">No tiene cuentas con saldo pendiente.</p>
            )}

            <div className="flex flex-wrap gap-2">
              <Link href={`/caja/cargo?cliente=${cliente.id}`}>
                <Button type="button">Cargo suelto</Button>
              </Link>
              <Link href={`/caja/pases?cliente=${cliente.id}`}>
                <Button type="button" variante="secundario">Vender pase o mensualidad</Button>
              </Link>
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
          <ul className="flex flex-col gap-2">
            {deHoy.map((c) => (
              <FilaCuenta key={c.reservaId} c={c} />
            ))}
          </ul>
        )}
      </section>

      {otras.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Otras cuentas con saldo (±30 días)</h2>
          <ul className="flex flex-col gap-2">
            {otras.map((c) => (
              <FilaCuenta key={c.reservaId} c={c} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
