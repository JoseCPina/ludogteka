"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { formatearFecha, formatearFechaCalendario } from "@/lib/formato";
import { Antiguedad } from "@/components/ui/antiguedad";
import { revisarComprobante } from "./comprobantes-actions";
import { useZonaNegocio } from "@/components/zona-negocio";

export type ComprobantePendiente = {
  id: string;
  perro_id: string;
  perro_nombre: string;
  cliente_id: string;
  cliente_nombre: string;
  tipo_etiqueta: string;
  vigencia_meses: number;
  fecha_aplicacion: string;
  detalle: string | null;
  created_at: string;
  // Días desde que el dueño lo mandó (la bandeja va del más viejo al más nuevo).
  dias_esperando: number;
  foto_url: string | null;
  // Cómo está ese requisito HOY para ese perro, para que recepción vea
  // qué va a cambiar al confirmar (p. ej. "sin registro" → vigente).
  estado_actual: string | null;
};

const ETIQUETA_ESTADO_ACTUAL: Record<string, string> = {
  sin_registro: "hoy sin registro",
  vencida: "hoy vencida",
  por_vencer: "hoy por vencer",
  vigente: "hoy vigente",
};

function Tarjeta({ item }: { item: ComprobantePendiente }) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const revisando = useEspera();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  async function decidir(confirmar: boolean) {
    setError(null);
    const res = await revisando.ejecutar(() => revisarComprobante(item.id, confirmar, motivo));
    if (res.error) return setError(res.error);
    setListo(
      confirmar
        ? `Registrado: ${item.tipo_etiqueta} de ${item.perro_nombre} vigente hasta el ${
            res.fechaVencimiento ? formatearFechaCalendario(res.fechaVencimiento) : "—"
          }.`
        : `Rechazado. El dueño verá el motivo en su portal.`
    );
    router.refresh();
  }

  if (listo) {
    return (
      <li className="rounded-lg border border-verde bg-verde-suave p-4 text-sm font-semibold text-verde-oscuro">
        {listo}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4 md:flex-row md:gap-5">
      <div className="flex-none">
        {item.foto_url ? (
          <a href={item.foto_url} target="_blank" rel="noreferrer" title="Abrir la foto en grande">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.foto_url}
              alt={`Comprobante de ${item.tipo_etiqueta} de ${item.perro_nombre}`}
              className="h-44 w-44 rounded-md border border-n-200 object-cover"
            />
          </a>
        ) : (
          <div className="grid h-44 w-44 place-items-center rounded-md border border-dashed border-n-300 text-xs text-n-500">
            Sin foto
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <div>
          <p className="text-lg font-bold text-n-900">
            {item.tipo_etiqueta} · {item.perro_nombre}
          </p>
          <Antiguedad dias={item.dias_esperando} prefijo="Esperando revisión" />
          <p className="text-sm text-n-600">
            Dueño:{" "}
            <Link href={`/clientes/${item.cliente_id}`} className="font-semibold text-azul hover:underline">
              {item.cliente_nombre}
            </Link>
            {" · "}
            <Link href={`/perros/${item.perro_id}`} className="font-semibold text-azul hover:underline">
              Ver expediente de {item.perro_nombre} →
            </Link>
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-n-600">Aplicación (según el dueño)</dt>
            <dd className="font-semibold text-n-900">{formatearFechaCalendario(item.fecha_aplicacion)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-n-600">Quedaría vigente</dt>
            <dd className="font-semibold text-n-900">
              {item.vigencia_meses} meses
              {item.estado_actual && (
                <span className="block text-xs font-normal text-n-600">
                  {ETIQUETA_ESTADO_ACTUAL[item.estado_actual] ?? item.estado_actual}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-n-600">Enviado</dt>
            <dd className="text-n-900">{formatearFecha(item.created_at, zona)}</dd>
          </div>
          {item.detalle && (
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-xs font-bold uppercase tracking-wide text-n-600">Veterinario / producto</dt>
              <dd className="text-n-900">{item.detalle}</dd>
            </div>
          )}
        </dl>

        {error && (
          <Alert variante="error" titulo="No se pudo guardar">
            {error}
          </Alert>
        )}

        {rechazando ? (
          <div className="flex flex-col gap-2">
            <Textarea
              label="¿Por qué no se confirma?"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={revisando.cargando}
              ayuda="El dueño lo lee en su portal. Ej.: la foto no se ve, la fecha no coincide con el carnet, es de otro perro."
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variante="peligro" cargando={revisando.cargando} onClick={() => decidir(false)}>
                {revisando.cargando ? "Guardando…" : "Rechazar con este motivo"}
              </Button>
              <Button type="button" variante="secundario" disabled={revisando.cargando} onClick={() => setRechazando(false)}>
                Volver
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variante="exito" cargando={revisando.cargando} onClick={() => decidir(true)}>
              {revisando.cargando ? "Registrando…" : "Confirmar y registrar"}
            </Button>
            <Button type="button" variante="secundario" disabled={revisando.cargando} onClick={() => setRechazando(true)}>
              Rechazar…
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

export function BandejaComprobantes({ pendientes }: { pendientes: ComprobantePendiente[] }) {
  if (pendientes.length === 0) {
    return (
      <div className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-white p-8 text-center">
        <p className="text-n-600">No hay comprobantes por revisar.</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {pendientes.map((item) => (
        <Tarjeta key={item.id} item={item} />
      ))}
    </ul>
  );
}
