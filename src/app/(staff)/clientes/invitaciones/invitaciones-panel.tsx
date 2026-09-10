"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import { formatearTelefono } from "@/lib/telefono";
import { TIPOS_LINK_ALTA, TIPOS_LINK_ALTA_LISTA, type TipoLinkAlta } from "@/lib/alta/tipos-link";
import {
  crearInvitacion,
  enlaceParaReenviar,
  cancelarInvitacion,
  type EstadoInvitacion,
} from "./invitacion-actions";

export type InvitacionFila = {
  id: string;
  nombre_referencia: string;
  telefono: string;
  tipo: string;
  es_complemento: boolean;
  expira_at: string;
  usada_at: string | null;
  cancelada_at: string | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
  created_at: string;
  estado: string;
};

const ESTILO_ESTADO: Record<string, string> = {
  pendiente: "bg-amarillo-suave text-amarillo-oscuro",
  usada: "bg-verde-suave text-verde-oscuro",
  vencida: "bg-n-100 text-n-500",
  cancelada: "bg-n-100 text-n-500",
};

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Pendiente",
  usada: "Se dio de alta",
  vencida: "Venció",
  cancelada: "Cancelada",
};

function EnlaceGenerado({ resultado }: { resultado: EstadoInvitacion }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    if (!resultado.url) return;
    try {
      await navigator.clipboard.writeText(resultado.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-verde bg-verde-suave p-4">
      <p className="font-bold text-verde-oscuro">Link listo para mandar</p>
      <p className="break-all rounded-md bg-white px-3 py-2 text-sm text-n-700">{resultado.url}</p>
      <p className="text-sm text-verde-oscuro">
        Vence el {resultado.expiraAt ? formatearFecha(resultado.expiraAt) : "—"}. Es de un solo uso:
        en cuanto el cliente termine su alta, deja de servir.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={resultado.urlWhatsApp} target="_blank" rel="noreferrer">
          <Button type="button">Abrir WhatsApp</Button>
        </a>
        <Button type="button" variante="secundario" onClick={copiar}>
          {copiado ? "Copiado" : "Copiar link"}
        </Button>
      </div>
    </div>
  );
}

function FilaInvitacion({ invitacion }: { invitacion: InvitacionFila }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reenvio, setReenvio] = useState<{ url: string; urlWhatsApp: string } | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  async function reenviar() {
    setOcupado(true);
    setError(null);
    const res = await enlaceParaReenviar(invitacion.id);
    setOcupado(false);
    if (res.error || !res.url || !res.urlWhatsApp) {
      setError(res.error ?? "No pudimos rearmar el link.");
      return;
    }
    setReenvio({ url: res.url, urlWhatsApp: res.urlWhatsApp });
    window.open(res.urlWhatsApp, "_blank");
  }

  async function cancelar() {
    setOcupado(true);
    setError(null);
    const res = await cancelarInvitacion(invitacion.id);
    setOcupado(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setConfirmando(false);
    router.refresh();
  }

  const pendiente = invitacion.estado === "pendiente";

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-n-900">
            {invitacion.nombre_referencia}{" "}
            <span className="font-normal text-n-600">· {formatearTelefono(invitacion.telefono)}</span>
          </p>
          <p className="text-sm text-n-600">
            {TIPOS_LINK_ALTA[invitacion.tipo as TipoLinkAlta]?.etiqueta ?? invitacion.tipo}
            {invitacion.es_complemento && (
              <>
                {" · "}
                <span className="font-semibold text-azul">
                  Completar expediente de {invitacion.cliente_nombre ?? "un cliente"}
                </span>
              </>
            )}
          </p>
          <p className="text-sm text-n-600">
            {invitacion.estado === "usada" && invitacion.cliente_id ? (
              <>
                Se dio de alta el {formatearFecha(invitacion.usada_at as string)} ·{" "}
                <Link href={`/clientes/${invitacion.cliente_id}`} className="font-semibold text-azul hover:underline">
                  Ver expediente de {invitacion.cliente_nombre ?? "el cliente"} →
                </Link>
              </>
            ) : invitacion.estado === "pendiente" ? (
              `Vence el ${formatearFecha(invitacion.expira_at)}`
            ) : invitacion.estado === "vencida" ? (
              `Venció el ${formatearFecha(invitacion.expira_at)} sin usarse`
            ) : (
              `Cancelada el ${formatearFecha(invitacion.cancelada_at as string)}`
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ESTILO_ESTADO[invitacion.estado]}`}>
            {ETIQUETA_ESTADO[invitacion.estado] ?? invitacion.estado}
          </span>
          {pendiente && !confirmando && (
            <>
              <Button type="button" variante="secundario" disabled={ocupado} onClick={reenviar}>
                {ocupado ? "…" : "Reenviar"}
              </Button>
              <Button type="button" variante="peligro" onClick={() => setConfirmando(true)}>
                Cancelar
              </Button>
            </>
          )}
        </div>
      </div>

      {confirmando && (
        <div className="flex flex-wrap items-center gap-2 border-t border-n-200 pt-2">
          <p className="text-sm text-n-700">
            Cancelar deja el link inservible. El historial se queda para saber qué se mandó.
          </p>
          <Button type="button" variante="peligro" disabled={ocupado} onClick={cancelar}>
            {ocupado ? "Cancelando…" : "Sí, cancelar"}
          </Button>
          <Button type="button" variante="secundario" onClick={() => setConfirmando(false)}>
            No
          </Button>
        </div>
      )}

      {reenvio && (
        <p className="break-all rounded-md bg-n-50 px-3 py-2 text-xs text-n-600">
          Es el mismo link de siempre, no uno nuevo: {reenvio.url}
        </p>
      )}

      {error && <p className="text-sm font-semibold text-naranja-oscuro">{error}</p>}
    </li>
  );
}

export function InvitacionesPanel({
  invitaciones,
  tipoInicial = "guarderia_hotel",
}: {
  invitaciones: InvitacionFila[];
  tipoInicial?: TipoLinkAlta;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipo, setTipo] = useState<TipoLinkAlta>(tipoInicial);
  const [dias, setDias] = useState("7");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<EstadoInvitacion | null>(null);

  async function generar() {
    setEnviando(true);
    setError(null);
    const res = await crearInvitacion(nombre, telefono, Number(dias), tipo);
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResultado(res);
    setNombre("");
    setTelefono("");
    router.refresh();
  }

  const pendientes = invitaciones.filter((i) => i.estado === "pendiente");
  const resto = invitaciones.filter((i) => i.estado !== "pendiente");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex max-w-lg flex-col gap-4 rounded-lg border border-n-200 bg-n-50 p-5">
        <div>
          <h2 className="text-lg font-bold text-n-900">Mandar un link de alta</h2>
          <p className="mt-1 text-sm text-n-600">
            El cliente captura sus datos y los de sus perros desde su celular, firma el contrato
            que le toca, y el expediente aparece aquí ya ligado a su cuenta — sin pasar por
            vinculación.
          </p>
        </div>

        {error && (
          <Alert variante="error" titulo="No se pudo generar el link">
            {error}
          </Alert>
        )}

        <Field
          label="¿Para quién es?"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="ej. Ana, la del labrador"
          ayuda="Solo para reconocer la invitación en esta lista. El nombre real lo captura el cliente."
        />
        <Field
          label="Teléfono (WhatsApp)"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="444 123 4567"
          inputMode="tel"
        />
        <div>
          <Select
            label="¿Para qué viene?"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoLinkAlta)}
          >
            {TIPOS_LINK_ALTA_LISTA.map((t) => (
              <option key={t.clave} value={t.clave}>
                {t.etiqueta}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-sm text-n-600">{TIPOS_LINK_ALTA[tipo].descripcion}</p>
        </div>
        <Select label="Vigencia del link" value={dias} onChange={(e) => setDias(e.target.value)}>
          <option value="1">1 día</option>
          <option value="3">3 días</option>
          <option value="7">7 días</option>
          <option value="15">15 días</option>
          <option value="30">30 días</option>
        </Select>

        <Button type="button" disabled={enviando} onClick={generar} className="self-start">
          {enviando ? "Generando…" : "Generar link"}
        </Button>

        {resultado && <EnlaceGenerado resultado={resultado} />}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Links pendientes</h2>
        {pendientes.length === 0 ? (
          <p className="text-n-600">No hay links esperando respuesta.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-n-200 bg-white">
            <ul className="divide-y divide-n-200">
              {pendientes.map((i) => (
                <FilaInvitacion key={i.id} invitacion={i} />
              ))}
            </ul>
          </div>
        )}
      </section>

      {resto.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-n-900">Historial</h2>
          <div className="overflow-hidden rounded-lg border border-n-200 bg-white">
            <ul className="divide-y divide-n-200">
              {resto.map((i) => (
                <FilaInvitacion key={i.id} invitacion={i} />
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
