"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { esEnterParaConfirmar, valorDelCampo } from "@/lib/ui/campo-vivo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { cancelarCuenta, infoCancelarCuenta } from "@/app/(staff)/caja/cancelar-cuenta-actions";
import { MOTIVOS_CANCELAR_CUENTA, type InfoCancelarCuenta } from "@/app/(staff)/caja/cancelar-cuenta-tipos";
import { dinero } from "@/lib/dinero";

/**
 * «Cancelar cuenta»: una cuenta con saldo que no se va a cobrar (no se presentó,
 * cita cancelada, cortesía, error de captura). No se borra: queda cancelada, con
 * motivo, quién y cuándo. Con cobros no se cancela (primero se anulan). La base
 * decide los permisos; aquí solo se esconde lo que de todos modos rechazaría.
 */
export function CancelarCuenta({
  reservaId,
  descripcion,
  saldo,
  esAdmin,
  compacto = false,
}: {
  reservaId: string;
  descripcion: string;
  saldo: number;
  esAdmin: boolean;
  compacto?: boolean;
}) {
  const router = useRouter();
  const carga = useEspera();
  const envio = useEspera();
  const [abierto, setAbierto] = useState(false);
  const [info, setInfo] = useState<InfoCancelarCuenta | null>(null);
  const [motivo, setMotivo] = useState("");
  const [texto, setTexto] = useState("");
  const campoTexto = useRef<HTMLTextAreaElement>(null);
  const [cancelarCita, setCancelarCita] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function abrir() {
    setAbierto(true);
    setError(null);
    const r = await carga.ejecutar(() => infoCancelarCuenta(reservaId));
    if (r.error) return setError(r.error);
    setInfo(r.info);
    if (r.info && r.info.total_cobrado > 0.005) {
      setError(
        `Esta cuenta ya tiene cobros (${dinero(r.info.total_cobrado)}). No se cancela con cobros: anúlalos primero en la pantalla de la cuenta y luego cancélala.`
      );
    }
  }

  const citas = info?.citas_pendientes ?? [];
  const estancias = info?.estancias_pendientes ?? [];
  const pendientes = citas.length + estancias.length;
  const cortesiaBloqueada = Boolean(info?.servicio_realizado) && !esAdmin;
  const conCobros = Boolean(info && info.total_cobrado > 0.005);

  async function confirmar() {
    setError(null);
    // QA S19: un solo paso. Se escoge un motivo o se escribe; lo escrito sin escoger es «Otro».
    const textoFinal = valorDelCampo(campoTexto, texto);
    setTexto(textoFinal);
    const clave = motivo || (textoFinal.trim() ? "otro" : "");
    if (!clave) return setError("Escoge el motivo o escríbelo.");
    if (clave === "otro" && textoFinal.trim().length < 5) return setError("Escribe el motivo (al menos 5 letras).");
    const r = await envio.ejecutar(() => cancelarCuenta(reservaId, clave, textoFinal, pendientes > 0 && cancelarCita));
    if (r.error) return setError(r.error);
    setAviso(r.aviso ?? "Cuenta cancelada.");
    router.refresh();
  }

  if (!abierto) {
    return (
      // Acción secundaria y poco frecuente (QA S25): texto, no un botón grande junto a «Cobrar».
      <button
        type="button"
        data-cancelar-cuenta-abrir={reservaId}
        className={`inline-flex min-h-10 items-center self-start rounded-md px-1 font-semibold text-coral-oscuro underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado ${compacto ? "text-sm" : "text-base"}`}
        onClick={abrir}
      >
        Cancelar cuenta
      </button>
    );
  }

  return (
    <div data-cancelar-cuenta={reservaId} className="flex w-full flex-col gap-3 rounded-lg border-[1.5px] border-coral bg-coral-suave p-4">
      <p className="font-semibold text-coral-oscuro">
        Cancelar la cuenta «{descripcion}» ({dinero(saldo)} por cobrar)
      </p>
      <p className="text-sm text-coral-oscuro">
        La cuenta sale de lo que falta por cobrar, pero no se borra: queda en el historial del cliente con el motivo y tu nombre. Si ya tiene cobros, anúlalos antes.
      </p>
      {carga.cargando && <p className="text-sm text-n-600">Revisando la cuenta…</p>}
      {conCobros ? (
        <Alert variante="advertencia" titulo="Esta cuenta tiene cobros">
          {error}
        </Alert>
      ) : (
        info && (
          <>
            <fieldset className="flex flex-col gap-2" data-cancelar-cuenta-motivo>
              <legend className="text-sm font-semibold text-n-800">Motivo (obligatorio)</legend>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS_CANCELAR_CUENTA.filter((m) => m.clave !== "otro").map((m) => {
                  const bloqueado = m.clave === "cortesia" && cortesiaBloqueada;
                  return (
                    <button
                      key={m.clave}
                      type="button"
                      disabled={bloqueado}
                      aria-pressed={motivo === m.clave}
                      data-motivo={m.clave}
                      title={bloqueado ? "Solo admin: el servicio ya se realizó" : undefined}
                      onClick={() => setMotivo(motivo === m.clave ? "" : m.clave)}
                      className={`min-h-10 rounded-full border-[1.5px] px-3 text-sm font-semibold ${motivo === m.clave ? "border-morado bg-morado text-white" : "border-n-300 bg-white text-n-800"} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {m.etiqueta}
                    </button>
                  );
                })}
              </div>
              <Textarea
                label={motivo ? "Nota (opcional)" : "O escribe el motivo"}
                rows={2}
                maxLength={300}
                ref={campoTexto}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (esEnterParaConfirmar(e)) { e.preventDefault(); void confirmar(); } }}
                data-cancelar-cuenta-texto
              />
            </fieldset>
            {pendientes > 0 && (
              <label className="flex items-start gap-3 rounded-md border border-n-200 bg-white p-3 text-sm text-n-800">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-morado"
                  checked={cancelarCita}
                  onChange={(e) => setCancelarCita(e.target.checked)}
                  data-cancelar-cuenta-cita
                />
                <span>
                  {textoPendientes(citas.length, estancias.length)} Cancelar {pendientes === 1 ? "la reserva" : "las reservas"} también
                  {motivo === "no_se_presento" ? " (se marca «No llegó»)." : estancias.length > 0 ? " (libera el cupo)." : "."}
                </span>
              </label>
            )}
            {info.servicio_realizado && (
              <p className="text-sm text-n-700">El servicio ya se realizó: cancelar la cuenta no regresa el inventario ni la comisión; solo deja de cobrarse.</p>
            )}
          </>
        )
      )}
      <AccionesFormulario error={conCobros ? null : error} exito={aviso}>
        {!conCobros && (
          <Button type="button" cargando={envio.cargando} onClick={confirmar} disabled={Boolean(aviso) || !info} data-cancelar-cuenta-confirmar>
            Cancelar la cuenta
          </Button>
        )}
        <Button type="button" variante="secundario" onClick={() => setAbierto(false)}>
          {aviso ? "Cerrar" : "Dejarla"}
        </Button>
      </AccionesFormulario>
    </div>
  );
}

function textoPendientes(citas: number, estancias: number): string {
  const partes: string[] = [];
  if (citas > 0) partes.push(citas === 1 ? "una cita de estética" : `${citas} citas de estética`);
  if (estancias > 0) partes.push(estancias === 1 ? "una reserva de guardería u hotel" : `${estancias} reservas de guardería u hotel`);
  return `Esta cuenta tiene ${partes.join(" y ")} que todavía no ${citas + estancias === 1 ? "empieza" : "empiezan"}.`;
}
