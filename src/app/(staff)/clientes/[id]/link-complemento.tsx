"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import { TIPOS_LINK_ALTA, TIPOS_LINK_ALTA_LISTA, type TipoLinkAlta } from "@/lib/alta/tipos-link";
import { linkComplemento, linkParaCompletar, type EstadoInvitacion } from "../invitaciones/invitacion-actions";
import { useAbrirEnlace } from "@/hooks/use-abrir-enlace";
import { AbrirWhatsApp } from "@/components/ui/abrir-whatsapp";
import { useZonaNegocio } from "@/components/zona-negocio";

export type LinkPendiente = { id: string; tipo: string; expira_at: string; estado: string };

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
  pendientes,
  tieneCuenta = false,
  tipos = ["guarderia_hotel", "estetica", "veterinaria"],
}: {
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  pendientes: LinkPendiente[];
  tieneCuenta?: boolean;
  // Los servicios que el negocio tiene: si es uno solo, no se pregunta «¿Para qué servicio?».
  tipos?: TipoLinkAlta[];
}) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoLinkAlta>(tipos[0] ?? "guarderia_hotel");
  const enviando = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<EstadoInvitacion | null>(null);
  const [cuentaActiva, setCuentaActiva] = useState(tieneCuenta);
  const wa = useAbrirEnlace();
  const [portal, setPortal] = useState<string | null>(null);

  // Con cuenta en el portal no hay link de alta: se le manda el de su portal (ahí completa y firma).
  async function mandarPortal() {
    setError(null);
    setPortal(null);
    const res = await wa.abrirTras(() => enviando.ejecutar(() => linkParaCompletar(clienteId)), (r) => (r.error ? null : r.urlWhatsApp));
    if (res.error) return setError(res.error);
    setPortal(res.url ?? null);
  }

  async function generar() {
    setError(null);
    setResultado(null);
    // WhatsApp se abre con el mensaje en cuanto llega el link (la pestaña se abre al tocar: ver useAbrirEnlace). Si ya
    // tiene uno esperando de ese servicio, se le vuelve a mandar ese.
    const res = await wa.abrirTras(() => enviando.ejecutar(() => linkComplemento(clienteId, tipo)), (r) => (r.error ? null : r.urlWhatsApp));
    if (res.error) {
      // El cliente activó su cuenta mientras esta pantalla seguía abierta: se acomoda la pantalla.
      if (/ya tiene cuenta activa/i.test(res.error)) {
        setCuentaActiva(true);
        router.refresh();
        return;
      }
      setError(res.error);
      return;
    }
    setResultado(res);
    router.refresh();
  }

  if (cuentaActiva) {
    return (
      <div id="link-complemento" data-link-cuenta-activa className="flex scroll-mt-6 flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Mandarle un link para completar</h2>
        <Alert variante="exito" titulo="Este cliente ya tiene cuenta activa">
          {clienteNombre} entra a su portal con su teléfono y su contraseña: ahí sube el comprobante de las vacunas, firma
          el contrato y llena sus datos. Mándale el link de su portal.
        </Alert>
        {error && (
          <Alert variante="error" titulo="No se pudo armar el link">
            {error}
          </Alert>
        )}
        <Button type="button" variante="secundario" className="self-start" cargando={enviando.cargando} onClick={mandarPortal} data-mandar-link-portal>
          Mandarle el link de su portal
        </Button>
        {portal && wa.enlace && <AbrirWhatsApp href={wa.enlace.url} enlace={portal} bloqueado={wa.enlace.bloqueado} />}
      </div>
    );
  }

  return (
    <div id="link-complemento" className="flex scroll-mt-6 flex-col gap-3 border-t border-n-200 pt-6">
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
              {TIPOS_LINK_ALTA[p.tipo as TipoLinkAlta]?.etiqueta ?? p.tipo}
              {p.estado === "en_curso"
                ? " · ya guardó sus datos, le falta firmar: el mismo link le sirve para volver"
                : ` · vence el ${formatearFecha(p.expira_at, zona)}`}
              . «Generar link» le vuelve a mandar ese mismo; para cancelarlo, ve a{" "}
              <Link href="/clientes/invitaciones" className="font-semibold text-morado hover:underline">
                Altas por link
              </Link>
              .
            </p>
          ))}
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {tipos.length > 1 && (
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
            {TIPOS_LINK_ALTA_LISTA.filter((t) => tipos.includes(t.clave)).map((t) => (
              <option key={t.clave} value={t.clave}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </div>
        )}
        <Button type="button" cargando={enviando.cargando} onClick={generar}>
          {enviando.cargando ? "Generando…" : "Generar link"}
        </Button>
      </div>

      {resultado?.url && (
        <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-menta bg-menta-suave p-4">
          <p className="font-bold text-menta-oscuro">Link listo para mandar</p>
          <CampoCopiable valor={resultado.url} textoBoton="Copiar link" />
          <p className="text-sm text-menta-oscuro">
            Vence el {resultado.expiraAt ? formatearFecha(resultado.expiraAt, zona) : "—"}. Le va a pedir
            su contraseña para entrar: el link solo dice de qué expediente hablamos, no abre el de
            nadie por sí solo.
          </p>
          {resultado.urlWhatsApp && <AbrirWhatsApp href={resultado.urlWhatsApp} bloqueado={wa.enlace?.bloqueado} />}
        </div>
      )}
    </div>
  );
}
