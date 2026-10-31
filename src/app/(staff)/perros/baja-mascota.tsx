"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { TextoConEnlaces } from "@/components/ui/texto-con-enlaces";
import { AvisoVersion, useControlVersion } from "@/components/concurrencia/use-control-version";
import { useEspera } from "@/hooks/use-espera";
import { useZonaNegocio } from "@/components/zona-negocio";
import { formatearFecha } from "@/lib/formato";
import { valorDelCampo } from "@/lib/ui/campo-vivo";
import { MOTIVOS_BAJA, nombreMotivoBaja, textoVivos, type MotivoBaja, type ResumenBaja } from "@/lib/perros/baja";
import { darDeBajaMascota, reactivarMascota, rechazarSolicitudBaja, traspasarPase } from "./baja-actions";

type Vocab = { nombre: string; este: string; femenino: boolean };
type Props = {
  perroId: string;
  nombre: string;
  version: string | null;
  resumen: ResumenBaja;
  /** admin o recepción, con el negocio escribible. */
  puedeEscribir: boolean;
  puedeTraspasarPases: boolean;
  otrasMascotas: { id: string; nombre: string }[];
  v: Vocab;
};

const vence = (iso: string | null, zona: string) => (iso ? ` · vence el ${formatearFecha(`${iso}T12:00:00Z`, zona)}` : "");

/**
 * La baja en la ficha de la mascota (admin y recepción): qué pasaría (eliminar o inactivar), qué la bloquea, el motivo
 * y la nota; la solicitud del dueño con «Confirmar la baja» y «Rechazar»; y, dada de baja, el aviso con «Reactivar» y
 * los pases con saldo para devolución o traspaso. El éxito navega a la ficha del dueño; el conflicto de versión se ve aquí.
 */
export function BajaMascota({ perroId, nombre, version, resumen, puedeEscribir, puedeTraspasarPases, otrasMascotas, v }: Props) {
  const router = useRouter();
  const zona = useZonaNegocio();
  const envio = useEspera();
  const ctl = useControlVersion("perros", perroId, version);
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState<MotivoBaja | "">(resumen.solicitud_pendiente?.motivo ?? "");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [respuesta, setRespuesta] = useState("");
  const [destino, setDestino] = useState<Record<string, string>>({});
  const campoNota = useRef<HTMLTextAreaElement>(null);
  const campoRespuesta = useRef<HTMLTextAreaElement>(null);
  const solicitud = resumen.solicitud_pendiente;
  const bloqueada = resumen.vivos.length > 0;

  const confirmar = async (forzar = false) => {
    setError(null);
    if (!motivo) return setError("Elige el motivo de la baja.");
    const notaFinal = valorDelCampo(campoNota, nota);
    setNota(notaFinal);
    const res = await envio.ejecutar(() => darDeBajaMascota(perroId, motivo, notaFinal, solicitud?.id ?? null, ctl.control(forzar)));
    if (ctl.huboConflicto(res, () => confirmar(true))) return;
    if (res.error) return setError(res.error);
    if (res.ir) router.push(res.ir);
  };

  const reactivar = async () => {
    setError(null);
    const res = await envio.ejecutar(() => reactivarMascota(perroId));
    if (res.error) return setError(res.error);
    ctl.huboConflicto(res, () => {});
    ctl.guardado(`${v.nombre.charAt(0).toUpperCase()}${v.nombre.slice(1)} reactivad${v.femenino ? "a" : "o"}: vuelve a salir en buscadores, agenda y reservas.`);
    router.refresh();
  };

  const rechazar = async () => {
    setError(null);
    if (!solicitud) return;
    const texto = valorDelCampo(campoRespuesta, respuesta);
    setRespuesta(texto);
    const res = await envio.ejecutar(() => rechazarSolicitudBaja(solicitud.id, texto, perroId));
    if (res.error) return setError(res.error);
    ctl.guardado("Solicitud rechazada. El dueño lee el motivo en su portal.");
    setRechazando(false);
    router.refresh();
  };

  const traspasar = async (bonoId: string) => {
    setError(null);
    const res = await envio.ejecutar(() => traspasarPase(bonoId, destino[bonoId] ?? ""));
    if (res.error) return setError(res.error);
    ctl.guardado("Pase traspasado.");
    router.refresh();
  };

  // ── Dada de baja: el aviso, los pases con saldo y «Reactivar» ──
  if (!resumen.activa) {
    return (
      <section className="flex flex-col gap-3" data-baja-mascota data-estado="inactiva">
        <Alert variante="advertencia" titulo={`${nombre} está dad${v.femenino ? "a" : "o"} de baja`}>
          {resumen.baja_at ? `Desde el ${formatearFecha(resumen.baja_at, zona)}. ` : ""}
          Motivo: {nombreMotivoBaja(resumen.baja_motivo)}.{resumen.baja_nota ? ` «${resumen.baja_nota}».` : ""} No sale en buscadores, agenda, reservas, cupos, pases ni
          recordatorios; su expediente, cobros y contratos se conservan aquí y en la ficha del dueño.
        </Alert>
        {resumen.pases_con_saldo.length > 0 && (
          <div className="rounded-md border border-ambar bg-ambar-suave p-4" data-pases-con-saldo>
            <p className="font-semibold text-ambar-oscuro">Pases con saldo</p>
            <p className="text-sm text-n-800">Decide si se devuelven (desde la cuenta de la compra, en Caja) o se traspasan a otra mascota del mismo dueño.</p>
            <ul className="mt-2 flex flex-col gap-2">
              {resumen.pases_con_saldo.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 rounded-md border border-n-200 bg-white px-3 py-2 sm:flex-row sm:items-end sm:justify-between">
                  <span className="text-sm text-n-900">
                    <strong>{p.servicio}</strong>: {p.disponibles} de {p.total} disponibles{vence(p.vence, zona)}
                  </span>
                  {puedeTraspasarPases && otrasMascotas.length > 0 && (
                    <span className="flex flex-wrap items-end gap-2">
                      <Select label="Traspasar a" value={destino[p.id] ?? ""} onChange={(e) => setDestino({ ...destino, [p.id]: e.target.value })}>
                        <option value="">Escoge…</option>
                        {otrasMascotas.map((m) => (
                          <option key={m.id} value={m.id}>{m.nombre}</option>
                        ))}
                      </Select>
                      <Button type="button" variante="secundario" cargando={envio.cargando} onClick={() => traspasar(p.id)}>
                        Traspasar el pase
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <AccionesFormulario error={error} exito={ctl.exito}>
          {puedeEscribir && (
            <Button type="button" variante="secundario" cargando={envio.cargando} onClick={reactivar} data-reactivar>
              Reactivar
            </Button>
          )}
        </AccionesFormulario>
      </section>
    );
  }

  // ── Activa: la solicitud del dueño (si la hay) y «Dar de baja» ──
  return (
    <section className="flex flex-col gap-3 border-t border-n-200 pt-6" data-baja-mascota data-estado="activa">
      <h2 className="text-lg font-bold text-n-900">Dar de baja</h2>
      {solicitud && (
        <Alert variante="info" titulo={`El dueño pidió dar de baja a ${nombre}`} >
          El {formatearFecha(solicitud.pedida_at, zona)}: {nombreMotivoBaja(solicitud.motivo).toLowerCase()}.{solicitud.nota ? ` «${solicitud.nota}».` : ""} Confírmala aquí abajo o recházala
          diciendo por qué.
        </Alert>
      )}
      <AvisoVersion ctl={ctl} registro={`${v.este}`} cargando={envio.cargando} onRecargar={() => router.refresh()} />
      {bloqueada ? (
        <Alert variante="advertencia" titulo="Todavía no se puede dar de baja">
          <TextoConEnlaces texto={`${nombre} tiene ${textoVivos(resumen.vivos)} sin terminar: cancélala o termínala primero. ${resumen.vivos.map((x) => x.ruta).join(" · ")}`} />
        </Alert>
      ) : (
        <p className="text-sm text-n-700" data-que-pasara={resumen.tiene_historial ? "inactiva" : "eliminada"}>
          {resumen.tiene_historial
            ? `${nombre} tiene historial (${resumen.historial.map((h) => `${h.n} ${h.tipo}`).join(", ")}): quedará inactiv${v.femenino ? "a" : "o"}. Desaparece de buscadores, agenda, reservas, cupos, pases y recordatorios; su expediente, cobros y contratos siguen en la ficha del dueño, en «Mascotas dadas de baja», y se puede reactivar.`
            : `${nombre} no tiene historial (ni citas, estancias, consultas, cobros, vacunas ni contratos): la baja la elimina de verdad, con su foto.`}
          {resumen.series_activas > 0 ? ` Su${resumen.series_activas === 1 ? " serie recurrente termina" : "s series recurrentes terminan"} hoy.` : ""}
          {resumen.pases_con_saldo.length > 0 ? ` Tiene ${resumen.pases_con_saldo.length === 1 ? "un pase" : `${resumen.pases_con_saldo.length} pases`} con saldo: quedará a la vista para devolverlo o traspasarlo a otra mascota del dueño.` : ""}
        </p>
      )}
      {puedeEscribir && !bloqueada && !abierto && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variante="peligro" onClick={() => setAbierto(true)} data-abrir-baja>
            {solicitud ? "Confirmar la baja…" : "Dar de baja…"}
          </Button>
          {solicitud && !rechazando && (
            <Button type="button" variante="secundario" onClick={() => setRechazando(true)}>
              Rechazar la solicitud…
            </Button>
          )}
        </div>
      )}
      {puedeEscribir && bloqueada && solicitud && !rechazando && (
        <Button type="button" variante="secundario" className="self-start" onClick={() => setRechazando(true)}>
          Rechazar la solicitud…
        </Button>
      )}
      {rechazando && solicitud && (
        <div className="flex flex-col gap-3 rounded-md border border-n-200 bg-white p-4" data-rechazar-solicitud>
          <Textarea ref={campoRespuesta} label="¿Por qué no se da de baja? (el dueño lo lee en su portal)" value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={2} />
          <AccionesFormulario error={error} exito={ctl.exito}>
            <Button type="button" variante="peligro" cargando={envio.cargando} onClick={rechazar}>Rechazar con este motivo</Button>
            <Button type="button" variante="secundario" onClick={() => setRechazando(false)}>Dejarla pendiente</Button>
          </AccionesFormulario>
        </div>
      )}
      {abierto && (
        <form
          method="post"
          className="flex flex-col gap-4 rounded-md border border-coral bg-white p-4"
          data-formulario-baja
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
        >
          <Select label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoBaja | "")} required>
            <option value="">Elige el motivo…</option>
            {MOTIVOS_BAJA.map((m) => (
              <option key={m.clave} value={m.clave}>{m.nombre}</option>
            ))}
          </Select>
          {motivo === "fallecio" && (
            <p className="text-sm text-n-700">Quedará marcad{v.femenino ? "a" : "o"} como fallecid{v.femenino ? "a" : "o"} en su expediente, sus recordatorios se apagan y el dueño l{v.femenino ? "a" : "o"} ve en su portal en una sección aparte, sin avisos.</p>
          )}
          <Textarea ref={campoNota} label="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={500} />
          <AccionesFormulario error={error} exito={ctl.exito}>
            <Button type="submit" variante="peligro" cargando={envio.cargando} data-confirmar-baja>
              {resumen.tiene_historial ? "Confirmar la baja" : "Confirmar y eliminar"}
            </Button>
            <Button type="button" variante="secundario" onClick={() => { setAbierto(false); setError(null); }}>Cancelar</Button>
          </AccionesFormulario>
        </form>
      )}
      {!puedeEscribir && !abierto && <p className="text-sm text-n-600">La baja la hacen admin o recepción.</p>}
      {!abierto && !rechazando && error && <Alert variante="error" titulo="No se pudo">{error}</Alert>}
    </section>
  );
}

/** «Reactivar» desde la lista «Mascotas dadas de baja» de la ficha del dueño. */
export function ReactivarMascota({ perroId, nombre }: { perroId: string; nombre: string }) {
  const router = useRouter();
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const reactivar = async () => {
    setError(null);
    const res = await envio.ejecutar(() => reactivarMascota(perroId));
    if (res.error) return setError(res.error);
    setExito(`${nombre} vuelve a estar activo.`);
    router.refresh();
  };
  return (
    <AccionesFormulario error={error} exito={exito} className="mt-0">
      <Button type="button" variante="secundario" cargando={envio.cargando} onClick={reactivar} data-reactivar={perroId}>
        Reactivar
      </Button>
    </AccionesFormulario>
  );
}
