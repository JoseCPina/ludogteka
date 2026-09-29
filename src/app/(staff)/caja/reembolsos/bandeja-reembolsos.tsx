"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Antiguedad } from "@/components/ui/antiguedad";
import { consultarReembolsosDeOrden, marcarReembolsoRevisado } from "../cobro-integrado-actions";

export type ReembolsoPorAtender = {
  id: string;
  ordenId: string;
  reservaId: string;
  clienteNombre: string;
  monto: number;
  motivo: string;
  estado: string;
  origen: string;
  registrado: boolean;
  desde: string;
  dias: number;
  detalleError: string | null;
};

function situacion(r: ReembolsoPorAtender): string {
  if (r.estado === "solicitado") return "Se pidió desde la app y Mercado Pago no ha confirmado. Consúltalo: si ya lo hizo, se registra en caja una sola vez.";
  if (!r.registrado) return "Mercado Pago ya lo reembolsó; entra a caja en cuanto haya un turno abierto.";
  return "Se hizo desde el panel de Mercado Pago, no desde el mostrador. Ya quedó en caja; confirma que lo conoces.";
}

function Fila({ r }: { r: ReembolsoPorAtender }) {
  const router = useRouter();
  const consulta = useEspera();
  const visto = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-n-900">
          ${r.monto.toFixed(2)} · {r.clienteNombre}
        </p>
        <Antiguedad dias={r.dias} prefijo={r.estado === "solicitado" ? "Esperando" : "Desde"} />
      </div>
      <p className="text-sm text-n-700">{situacion(r)}</p>
      <p className="text-sm text-n-500">
        {r.motivo}
        {r.detalleError ? ` · ${r.detalleError}` : ""}
      </p>
      <AccionesFormulario error={error} exito={exito}>
        <Link href={`/caja/cobrar/${r.reservaId}`}>
          <Button type="button" variante="secundario">Ver la cuenta</Button>
        </Link>
        {(r.estado === "solicitado" || !r.registrado) && (
          <Button
            type="button"
            cargando={consulta.cargando}
            onClick={async () => {
              setError(null);
              const res = await consulta.ejecutar(() => consultarReembolsosDeOrden(r.ordenId));
              if (res.error) return setError(res.error);
              setExito(res.nuevos ? "Confirmado y registrado en caja." : "Mercado Pago todavía no lo confirma.");
              router.refresh();
            }}
          >
            Consultar a Mercado Pago
          </Button>
        )}
        {r.origen === "proveedor" && r.registrado && (
          <Button
            type="button"
            cargando={visto.cargando}
            onClick={async () => {
              setError(null);
              const res = await visto.ejecutar(() => marcarReembolsoRevisado(r.id));
              if (res.error) return setError(res.error);
              router.refresh();
            }}
          >
            Enterado
          </Button>
        )}
      </AccionesFormulario>
    </li>
  );
}

export function BandejaReembolsos({ lista }: { lista: ReembolsoPorAtender[] }) {
  if (lista.length === 0) return <p className="text-sm text-n-500">No hay reembolsos por revisar.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {lista.map((r) => (
        <Fila key={r.id} r={r} />
      ))}
    </ul>
  );
}
