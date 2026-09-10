"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import { TIPOS_LINK_ALTA, TIPOS_LINK_ALTA_LISTA, type TipoLinkAlta } from "@/lib/alta/tipos-link";
import { crearInvitacion, type EstadoInvitacion } from "../invitaciones/invitacion-actions";

export type LinkPendiente = { id: string; tipo: string; expira_at: string };

/**
 * Mandarle a un cliente que YA existe el link del otro flujo.
 *
 * Es la mitad de recepción de "no le preguntes todo otra vez": el cliente
 * de estética que ahora va a dejar a su perro en guardería no vuelve a
 * empezar de cero — recibe un link que solo le pide lo que falta y el
 * contrato que no ha firmado.
 *
 * El nombre y el teléfono salen del expediente, no se vuelven a teclear:
 * escribirlos otra vez es la manera de que el link se le mande al número
 * de alguien más.
 */
export function LinkComplemento({
  clienteId,
  clienteNombre,
  clienteTelefono,
  pendientes,
}: {
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  pendientes: LinkPendiente[];
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoLinkAlta>("guarderia_hotel");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<EstadoInvitacion | null>(null);

  async function generar() {
    setEnviando(true);
    setError(null);
    setResultado(null);
    const res = await crearInvitacion(clienteNombre, clienteTelefono, 7, tipo, clienteId);
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResultado(res);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
      <h2 className="text-lg font-bold text-n-900">Mandarle un link para completar</h2>
      <p className="text-n-600">
        Si {clienteNombre} va a usar un servicio nuevo, este link le pide{" "}
        <strong>solo lo que falte</strong> de su expediente y el contrato que no haya firmado. No le
        vuelve a preguntar lo que ya nos dijo.
      </p>

      {error && (
        <Alert variante="error" titulo="No se pudo generar el link">
          {error}
        </Alert>
      )}

      {pendientes.length > 0 && (
        <Alert variante="advertencia" titulo="Ya tiene un link esperando">
          {pendientes.map((p) => (
            <p key={p.id}>
              {TIPOS_LINK_ALTA[p.tipo as TipoLinkAlta]?.etiqueta ?? p.tipo} · vence el{" "}
              {formatearFecha(p.expira_at)}. Reenvíalo o cancélalo desde{" "}
              <Link href="/clientes/invitaciones" className="font-semibold text-azul hover:underline">
                Altas por link
              </Link>
              .
            </p>
          ))}
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="tipo-complemento"
            className="mb-1.5 block text-sm font-semibold text-n-800"
          >
            ¿Para qué servicio?
          </label>
          <select
            id="tipo-complemento"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoLinkAlta)}
            className="min-h-12 rounded-md border-[1.5px] border-n-400 bg-white px-3 text-n-900"
          >
            {TIPOS_LINK_ALTA_LISTA.map((t) => (
              <option key={t.clave} value={t.clave}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" disabled={enviando} onClick={generar}>
          {enviando ? "Generando…" : "Generar link"}
        </Button>
      </div>

      {resultado?.url && (
        <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-verde bg-verde-suave p-4">
          <p className="font-bold text-verde-oscuro">Link listo para mandar</p>
          <p className="break-all rounded-md bg-white px-3 py-2 text-sm text-n-700">
            {resultado.url}
          </p>
          <p className="text-sm text-verde-oscuro">
            Vence el {resultado.expiraAt ? formatearFecha(resultado.expiraAt) : "—"}. Le va a pedir
            su contraseña para entrar: el link solo dice de qué expediente hablamos, no abre el de
            nadie por sí solo.
          </p>
          <div>
            <a href={resultado.urlWhatsApp} target="_blank" rel="noreferrer">
              <Button type="button">Abrir WhatsApp</Button>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
