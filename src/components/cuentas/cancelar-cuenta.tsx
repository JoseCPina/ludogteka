"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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
  const cortesiaBloqueada = Boolean(info?.servicio_realizado) && !esAdmin;
  const conCobros = Boolean(info && info.total_cobrado > 0.005);

  async function confirmar() {
    setError(null);
    if (!motivo) return setError("Escoge el motivo.");
    if (motivo === "otro" && texto.trim().length < 5) return setError("Con «Otro», escribe el motivo.");
    const r = await envio.ejecutar(() => cancelarCuenta(reservaId, motivo, texto, citas.length > 0 && cancelarCita));
    if (r.error) return setError(r.error);
    setAviso(r.aviso ?? "Cuenta cancelada.");
    router.refresh();
  }

  if (!abierto) {
    return (
      <Button
        type="button"
        variante="secundario"
        data-cancelar-cuenta-abrir={reservaId}
        className={compacto ? "min-h-10 self-start px-3 text-sm" : "self-start"}
        onClick={abrir}
      >
        Cancelar cuenta
      </Button>
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
            <Select label="Motivo (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-cancelar-cuenta-motivo>
              <option value="">Escoge uno…</option>
              {MOTIVOS_CANCELAR_CUENTA.map((m) => (
                <option key={m.clave} value={m.clave} disabled={m.clave === "cortesia" && cortesiaBloqueada}>
                  {m.etiqueta}
                  {m.clave === "cortesia" && cortesiaBloqueada ? " (solo admin: el servicio ya se realizó)" : ""}
                </option>
              ))}
            </Select>
            {(motivo === "otro" || motivo === "cortesia" || motivo === "error_captura") && (
              <Textarea
                label={motivo === "otro" ? "Cuéntanos el motivo (obligatorio)" : "Nota (opcional)"}
                rows={2}
                maxLength={300}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
            )}
            {citas.length > 0 && (
              <label className="flex items-start gap-3 rounded-md border border-n-200 bg-white p-3 text-sm text-n-800">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-morado"
                  checked={cancelarCita}
                  onChange={(e) => setCancelarCita(e.target.checked)}
                  data-cancelar-cuenta-cita
                />
                <span>
                  {citas.length === 1 ? "La cita de esta cuenta todavía no empieza." : `Esta cuenta tiene ${citas.length} citas que todavía no empiezan.`} Cancelarla también
                  {motivo === "no_se_presento" ? " (se marca «No llegó»)." : "."}
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
