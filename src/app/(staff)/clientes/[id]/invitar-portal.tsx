"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { Alert } from "@/components/ui/alert";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { formatearFecha } from "@/lib/formato";
import { useZonaNegocio } from "@/components/zona-negocio";
import { invitarAlPortal, type EstadoInvitarPortal } from "./portal-actions";
import { AvisosWhatsAppBotones } from "@/components/avisos-whatsapp-botones";

/** El botón «Invitar al portal» de la ficha del cliente (solo si todavía no tiene cuenta). */
export function InvitarPortal({ clienteId, clienteNombre, tieneCuenta }: { clienteId: string; clienteNombre: string; tieneCuenta: boolean }) {
  const zona = useZonaNegocio();
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<EstadoInvitarPortal | null>(null);
  // La cuenta se activó en otra ventana: el enlace que se mostraba ya está usado.
  const [cuentaActiva, setCuentaActiva] = useState(false);
  const router = useRouter();

  if (tieneCuenta && !cuentaActiva) return null;

  async function generar() {
    setError(null);
    const res = await envio.ejecutar(() => invitarAlPortal(clienteId));
    if (res.error) {
      if (/ya tiene cuenta/i.test(res.error)) {
        setResultado(null);
        setCuentaActiva(true);
        router.refresh();
        return;
      }
      return setError(res.error);
    }
    setResultado(res);
  }

  return (
    <div id="invitar-portal" className="flex flex-col gap-3 border-t border-n-200 pt-6">
      <h2 className="text-lg font-bold text-n-900">Invitar al portal</h2>
      {cuentaActiva ? (
        <Alert variante="exito" titulo="Este cliente ya tiene cuenta activa">
          {clienteNombre} ya activó su cuenta del portal (el enlace que se mandó ya se usó). Ya no hace falta generar otro; entra con su teléfono y su contraseña.
        </Alert>
      ) : (<>
      <p className="text-n-600">
        {clienteNombre} todavía no tiene cuenta. Mándale un enlace de un solo uso: él escoge su contraseña y entra con su teléfono. Sirve 7 días.
      </p>
      {error && <Alert variante="error" titulo="No se pudo crear la invitación">{error}</Alert>}
      {resultado?.url && (
        <div className="flex flex-col gap-2">
          <CampoCopiable etiqueta="Enlace de invitación" valor={resultado.url} />
          {resultado.expiraAt && <p className="text-sm text-n-600">Vence el {formatearFecha(resultado.expiraAt, zona)}. Se muestra solo ahora: si lo pierdes, genera otro.</p>}
          {resultado.urlWhatsApp && resultado.mensaje && (
            <AvisosWhatsAppBotones etiqueta="Mandar por WhatsApp" mensajes={[{ titulo: "Invitar al portal", texto: resultado.mensaje, url: resultado.urlWhatsApp }]} />
          )}
        </div>
      )}
      <AccionesFormulario error={null}>
        <Button type="button" variante={resultado ? "secundario" : "primario"} cargando={envio.cargando} onClick={generar}>
          {resultado ? "Generar otro enlace" : "Invitar al portal"}
        </Button>
      </AccionesFormulario>
      </>)}
    </div>
  );
}
