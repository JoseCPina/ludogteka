"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { AbrirWhatsApp } from "@/components/ui/abrir-whatsapp";
import { Alert } from "@/components/ui/alert";
import { restablecerPasswordCuenta, restablecerPasswordPersonal, type EstadoRestablecerPersonal } from "./password-actions";

/**
 * QA S36: «Restablecer contraseña» de alguien del equipo (solo admin), en su ficha de Empleados (`empleadoId`) o en
 * Administración → Cuentas (`profileId`, `compacto`: solo el botón y el resultado, dentro de la tabla).
 */
export function RestablecerPasswordPersonal({ empleadoId, profileId, nombre, compacto = false }: { empleadoId?: string; profileId?: string; nombre: string; compacto?: boolean }) {
  const [confirmando, setConfirmando] = useState(false);
  const ocupado = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<EstadoRestablecerPersonal | null>(null);

  async function restablecer() {
    setError(null);
    const res = await ocupado.ejecutar(() => (empleadoId ? restablecerPasswordPersonal(empleadoId) : restablecerPasswordCuenta(profileId ?? "")));
    if (res.error) {
      setError(res.error);
      return;
    }
    setConfirmando(false);
    setResultado(res);
  }


  return (
    <div className={compacto ? "flex flex-col gap-2" : "flex flex-col gap-3 border-t border-n-200 pt-6"}>
      {!compacto && <h2 className="text-lg font-bold text-n-900">Contraseña de la app</h2>}

      <>
          {!compacto && <p className="text-n-600" data-texto-recuperacion>
            Si {nombre} olvidó su contraseña, restablécela aquí: te damos una contraseña temporal para
            mandársela por WhatsApp. Entra en «Soy del equipo» con su correo o teléfono y escoge una nueva.
          </p>}

          {error && (
            <Alert variante="error" titulo="No se pudo restablecer">
              {error}
            </Alert>
          )}

          {resultado?.inviteLink ? (
            <div data-invitacion-reenviada className="flex flex-col gap-3 rounded-lg border-[1.5px] border-menta bg-menta-suave p-4">
              <p className="font-bold text-menta-oscuro">Invitación reenviada</p>
              <p className="text-sm text-menta-oscuro">
                {nombre} todavía no abría su invitación, así que no se le puso contraseña: mándale este link nuevo para que
                cree la suya (el anterior ya no sirve).
              </p>
              <CampoCopiable valor={resultado.inviteLink} textoBoton="Copiar" />
              {resultado.urlWhatsApp && <AbrirWhatsApp href={resultado.urlWhatsApp} texto="Mandar por WhatsApp" variante="secundario" />}
            </div>
          ) : resultado?.password ? (
            <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-menta bg-menta-suave p-4">
              <p className="font-bold text-menta-oscuro">Contraseña temporal</p>
              <CampoCopiable valor={resultado.password} monoespaciado textoCopiado="Copiada" />
              <p className="text-sm text-menta-oscuro">
                Esto se muestra una sola vez: si cierras la pantalla ya no la puedes volver a ver,
                tendrías que generar otra. Al entrar, la app le pide escoger una nueva antes de seguir.
              </p>
              {resultado.urlWhatsApp && <AbrirWhatsApp href={resultado.urlWhatsApp} texto="Mandársela por WhatsApp" />}
            </div>
          ) : confirmando ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border-[1.5px] border-ambar bg-ambar-suave p-4">
              <p className="w-full text-sm text-ambar-oscuro">
                La contraseña actual de {nombre} deja de servir en ese momento: se queda fuera de la app
                hasta que le pases la nueva.
              </p>
              <Button type="button" cargando={ocupado.cargando} onClick={restablecer}>
                {ocupado.cargando ? "Restableciendo…" : "Sí, restablecer"}
              </Button>
              <Button type="button" variante="secundario" onClick={() => setConfirmando(false)}>
                No
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variante="secundario"
              className="self-start"
              data-restablecer-password-personal
              onClick={() => setConfirmando(true)}
            >
              Restablecer contraseña
            </Button>
          )}
      </>
    </div>
  );
}
