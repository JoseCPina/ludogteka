"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CampoCopiable } from "@/components/ui/campo-copiable";
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
import { useZonaNegocio } from "@/components/zona-negocio";

export type InvitacionFila = {
  id: string;
  nombre_referencia: string;
  telefono: string;
  tipo: string;
  es_complemento: boolean;
  expira_at: string;
  alta_completada_at: string | null;
  usada_at: string | null;
  cancelada_at: string | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
  created_at: string;
  estado: string;
};

const ESTILO_ESTADO: Record<string, string> = {
  pendiente: "bg-amarillo-suave text-amarillo-oscuro",
  en_curso: "bg-azul-suave text-azul",
  usada: "bg-verde-suave text-verde-oscuro",
  vencida: "bg-n-100 text-n-500",
  cancelada: "bg-n-100 text-n-500",
};

// "en_curso": el dueño ya guardó sus datos pero todavía no firma el
// contrato. El link le sigue sirviendo para volver a firmar, así que no
// se le manda otro: se reenvía este.
const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "Registrado, falta firmar",
  usada: "Completado",
  vencida: "Venció",
  cancelada: "Cancelada",
};

function EnlaceGenerado({ resultado }: { resultado: EstadoInvitacion }) {
  const zona = useZonaNegocio();
  return (
    <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-verde bg-verde-suave p-4">
      <p className="font-bold text-verde-oscuro">Link listo para mandar</p>
      <CampoCopiable valor={resultado.url ?? ""} textoBoton="Copiar link" />
      <p className="text-sm text-verde-oscuro">
        Vence el {resultado.expiraAt ? formatearFecha(resultado.expiraAt, zona) : "—"}. Le sirve al
        cliente hasta que termine todo (datos y firma): si lo deja a medias, lo vuelve a abrir y
        continúa. En cuanto no le falte nada, deja de servir.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={resultado.urlWhatsApp} target="_blank" rel="noreferrer">
          <Button type="button">Abrir WhatsApp</Button>
        </a>
      </div>
    </div>
  );
}

function FilaInvitacion({ invitacion }: { invitacion: InvitacionFila }) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const ocupado = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [reenvio, setReenvio] = useState<{ url: string; urlWhatsApp: string } | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  async function reenviar() {
    setError(null);
    const res = await ocupado.ejecutar(() => enlaceParaReenviar(invitacion.id));
    if (res.error || !res.url || !res.urlWhatsApp) {
      setError(res.error ?? "No pudimos rearmar el link.");
      return;
    }
    setReenvio({ url: res.url, urlWhatsApp: res.urlWhatsApp });
    window.open(res.urlWhatsApp, "_blank");
  }

  async function cancelar() {
    setError(null);
    const res = await ocupado.ejecutar(() => cancelarInvitacion(invitacion.id));
    if (res.error) {
      setError(res.error);
      return;
    }
    setConfirmando(false);
    router.refresh();
  }

  // Un link en curso se reenvía y se cancela igual que uno pendiente:
  // sigue vivo hasta que el dueño firme.
  const pendiente = invitacion.estado === "pendiente" || invitacion.estado === "en_curso";

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
                {invitacion.es_complemento ? "Completó su expediente el " : "Se dio de alta el "}
                {formatearFecha(invitacion.usada_at as string, zona)} ·{" "}
                <Link href={`/clientes/${invitacion.cliente_id}`} className="font-semibold text-azul hover:underline">
                  Ver expediente de {invitacion.cliente_nombre ?? "el cliente"} →
                </Link>
              </>
            ) : invitacion.estado === "en_curso" && invitacion.cliente_id ? (
              <>
                Guardó sus datos el {formatearFecha(invitacion.alta_completada_at as string, zona)}; le
                falta firmar el contrato. El mismo link le sirve para volver ·{" "}
                <Link href={`/clientes/${invitacion.cliente_id}`} className="font-semibold text-azul hover:underline">
                  Ver expediente de {invitacion.cliente_nombre ?? "el cliente"} →
                </Link>
              </>
            ) : invitacion.estado === "pendiente" ? (
              `Vence el ${formatearFecha(invitacion.expira_at, zona)}`
            ) : invitacion.estado === "vencida" ? (
              `Venció el ${formatearFecha(invitacion.expira_at, zona)} sin usarse`
            ) : (
              `Cancelada el ${formatearFecha(invitacion.cancelada_at as string, zona)}`
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ESTILO_ESTADO[invitacion.estado]}`}>
            {ETIQUETA_ESTADO[invitacion.estado] ?? invitacion.estado}
          </span>
          {pendiente && !confirmando && (
            <>
              <Button type="button" variante="secundario" cargando={ocupado.cargando} onClick={reenviar}>
                {ocupado.cargando ? "…" : "Reenviar"}
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
          <Button type="button" variante="peligro" cargando={ocupado.cargando} onClick={cancelar}>
            {ocupado.cargando ? "Cancelando…" : "Sí, cancelar"}
          </Button>
          <Button type="button" variante="secundario" onClick={() => setConfirmando(false)}>
            No
          </Button>
        </div>
      )}

      {reenvio && (
        <div className="flex flex-col gap-1 rounded-md bg-n-50 p-3">
          <p className="text-xs text-n-600">Es el mismo link de siempre, no uno nuevo:</p>
          <CampoCopiable valor={reenvio.url} textoBoton="Copiar link" />
        </div>
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
  const enviando = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<EstadoInvitacion | null>(null);

  async function generar() {
    setError(null);
    const res = await enviando.ejecutar(() => crearInvitacion(nombre, telefono, Number(dias), tipo));
    if (res.error) {
      setError(res.error);
      return;
    }
    setResultado(res);
    setNombre("");
    setTelefono("");
    router.refresh();
  }

  const pendientes = invitaciones.filter((i) => i.estado === "pendiente" || i.estado === "en_curso");
  const resto = invitaciones.filter((i) => i.estado !== "pendiente" && i.estado !== "en_curso");

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

        <Button type="button" cargando={enviando.cargando} onClick={generar} className="self-start">
          {enviando.cargando ? "Generando…" : "Generar link"}
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
