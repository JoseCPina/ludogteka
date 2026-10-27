"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccionConTope } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { useModulos } from "@/components/modulos-contexto";
import { BorradorFormulario } from "@/lib/borradores/borrador-formulario";
import type { EstadoClienteForm } from "./actions";
import { CampoVersion, conForzar } from "@/components/concurrencia/campo-version";
import { versionMasReciente } from "@/lib/concurrencia/tipos";
import { AvisoConflicto } from "@/components/concurrencia/aviso-conflicto";

const ESTADO_INICIAL: EstadoClienteForm = { error: null };

export function ClienteForm({
  action,
  valoresIniciales,
  textoBoton,
  pedirDireccion = false,
  corta = false,
  clienteId,
  version,
}: {
  action: (estadoPrevio: EstadoClienteForm, formData: FormData) => Promise<EstadoClienteForm>;
  valoresIniciales?: { nombre: string; telefono: string; email: string | null; notas?: string | null; recordatorios?: boolean };
  textoBoton: string;
  // Solo en el alta. En la ficha de un cliente que ya existe, la
  // direccion se edita en "Distancia y recoleccion", que ademas muestra
  // la distancia calculada y el ajuste manual: dos campos de direccion en
  // la misma pantalla serian dos fuentes de verdad compitiendo.
  pedirDireccion?: boolean;
  // Alta corta (viene de agendar una cita de estética): solo nombre y
  // WhatsApp. La dirección solo se pide si el cliente quiere recolección.
  corta?: boolean;
  /** En la edición: el cliente y su updated_at al cargar (QA N43). */
  clienteId?: string;
  version?: string | null;
}) {
  const { tiene } = useModulos();
  const [quiereRecoleccion, setQuiereRecoleccion] = useState(false);
  const [estado, formAction, enviando] = useActionState(useAccionConTope(action), ESTADO_INICIAL);
  // Se manda a mano (sin `action=`): así React no vacía los campos y, si otra persona cambió al cliente, lo
  // escrito sigue ahí para «guardar los míos encima».
  const ultimo = useRef<FormData | null>(null);
  // QA S27: la acción ya no repinta la ficha antes de responder; la cabecera se pone al día después, sin bloquear.
  const router = useRouter();
  useEffect(() => {
    if (estado.ok && clienteId) router.refresh();
  }, [estado, clienteId, router]);

  return (
    <form method="post"
      className="flex max-w-lg flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        ultimo.current = fd;
        startTransition(() => formAction(fd));
      }}
    >
      {clienteId && <CampoVersion versiones={[{ t: "clientes", i: clienteId, v: versionMasReciente(estado.version, version) }]} registros={estado.registros} />}
      {estado.conflicto && (
        <AvisoConflicto
          conflicto={estado.conflicto}
          registro="este cliente"
          cargando={enviando}
          onRecargar={() => window.location.reload()}
          onGuardarEncima={() => {
            if (ultimo.current) {
              const fd = conForzar(ultimo.current);
              startTransition(() => formAction(fd));
            }
          }}
        />
      )}
      {/* Solo el alta: una edición ya trae sus datos. */}
      {!valoresIniciales && <BorradorFormulario formulario="cliente_nuevo" clave={corta ? "corta" : ""} />}
      {estado.error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {estado.error}
        </Alert>
      )}
      {estado.ok && <Alert variante="exito" titulo="Cambios guardados" />}

      <Field
        label="Nombre del dueño"
        name="nombre"
        required
        disabled={enviando}
        defaultValue={valoresIniciales?.nombre}
      />
      <Field
        label={corta ? "WhatsApp" : "Teléfono"}
        name="telefono"
        inputMode="tel"
        required
        disabled={enviando}
        defaultValue={valoresIniciales?.telefono}
        ayuda="10 dígitos. Puedes escribirlo con espacios, guiones o paréntesis."
      />
      {!corta && (
        <Field
          label="Correo (opcional)"
          name="email"
          type="email"
          disabled={enviando}
          defaultValue={valoresIniciales?.email ?? ""}
        />
      )}

      {!corta && (
        <Textarea
          label="Notas internas (opcional)"
          name="notas"
          rows={3}
          maxLength={2000}
          disabled={enviando}
          defaultValue={valoresIniciales?.notas ?? ""}
          ayuda="Solo las ve el personal; el dueño no las ve en su portal."
        />
      )}

      {/* Consentimiento para los recordatorios automáticos por WhatsApp: marcado por omisión, con texto claro. */}
      <input type="hidden" name="recordatorios_whatsapp_presente" value="1" />
      <label className="flex items-start gap-2 rounded-md border-[1.5px] border-n-200 bg-white p-3 text-n-900" data-consentimiento-recordatorios>
        <input type="checkbox" name="recordatorios_whatsapp" value="si" defaultChecked={valoresIniciales?.recordatorios ?? true} disabled={enviando} className="mt-1 h-4 w-4" />
        <span>
          El cliente acepta recordatorios por WhatsApp
          <span className="block text-sm text-n-600">Le llegan del número de PeluDesk con el nombre del negocio (sus citas, llegadas y vacunas). Puede darse de baja cuando quiera respondiendo BAJA.</span>
        </span>
      </label>

      {pedirDireccion && corta && tiene("recoleccion") && (
        <label className="flex items-start gap-2 rounded-md border-[1.5px] border-n-200 bg-white p-3 text-n-900">
          <input type="checkbox" checked={quiereRecoleccion} onChange={(e) => setQuiereRecoleccion(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>Quiere que pasemos por su perro a su casa</span>
        </label>
      )}

      {pedirDireccion && (!corta || (quiereRecoleccion && tiene("recoleccion"))) && (
        <Field
          label="Dirección (opcional)"
          name="direccion"
          disabled={enviando}
          ayuda="Si la capturas ahora, se calcula la distancia para cotizar la recolección a domicilio. Se puede agregar después."
        />
      )}

      <AccionesFormulario error={estado.error} exito={estado.ok && "Cambios guardados"}>
        <Button type="submit" cargando={enviando}>
          {enviando ? "Guardando…" : textoBoton}
        </Button>
      </AccionesFormulario>
    </form>
  );
}
