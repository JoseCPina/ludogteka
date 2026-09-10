"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearTelefono } from "@/lib/telefono";
import { guardarConfiguracionNegocio } from "./configuracion-actions";

export type ConfiguracionVigente = {
  cupo_diurno: number | null;
  cupo_nocturno: number | null;
  base_direccion: string | null;
  telefono_recepcion: string | null;
  estado: string;
};

/**
 * El cupo, la dirección de la base y el WhatsApp de recepción.
 *
 * El teléfono es el que se le ofrece al cliente en "¿olvidaste tu
 * contraseña?": si está vacío, esa pantalla no puede abrirle WhatsApp a
 * nadie y solo le dice que llame. Por eso el aviso de arriba cuando falta.
 *
 * Guardar inserta una versión nueva, no reescribe la anterior: mismo
 * patrón que tarifas. Lo que no se toca se arrastra del vigente.
 */
export function ConfiguracionNegocio({ vigente }: { vigente: ConfiguracionVigente | null }) {
  const router = useRouter();
  const [cupoDiurno, setCupoDiurno] = useState(String(vigente?.cupo_diurno ?? ""));
  const [cupoNocturno, setCupoNocturno] = useState(String(vigente?.cupo_nocturno ?? ""));
  const [telefono, setTelefono] = useState(vigente?.telefono_recepcion ?? "");
  const [baseDireccion, setBaseDireccion] = useState(vigente?.base_direccion ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function guardar() {
    setError(null);
    setOk(false);
    setGuardando(true);
    const res = await guardarConfiguracionNegocio({
      cupoDiurno: Number(cupoDiurno),
      cupoNocturno: Number(cupoNocturno),
      telefonoRecepcion: telefono,
      baseDireccion,
    });
    setGuardando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOk(true);
    router.refresh();
  }

  const sinTelefono = !vigente?.telefono_recepcion;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      {error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {error}
        </Alert>
      )}
      {ok && <Alert variante="exito" titulo="Configuración guardada" />}

      {sinTelefono && (
        <Alert variante="advertencia" titulo="Falta el WhatsApp de recepción">
          Sin él, un cliente que olvide su contraseña no tiene a dónde escribir: la pantalla de
          entrada solo puede decirle que llame o se pase al mostrador.
        </Alert>
      )}

      <Field
        label="WhatsApp de recepción"
        inputMode="tel"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        placeholder="444 123 4567"
        ayuda={
          vigente?.telefono_recepcion
            ? `Hoy: ${formatearTelefono(vigente.telefono_recepcion)}. Es a donde llega el "olvidé mi contraseña" de los clientes.`
            : 'Es a donde llega el "olvidé mi contraseña" de los clientes.'
        }
      />

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Cupo de día"
          type="number"
          min="0"
          value={cupoDiurno}
          onChange={(e) => setCupoDiurno(e.target.value)}
          ayuda="Perros que caben en el área común."
        />
        <Field
          label="Cupo de noche"
          type="number"
          min="0"
          value={cupoNocturno}
          onChange={(e) => setCupoNocturno(e.target.value)}
          ayuda="Los que tienen dónde dormir."
        />
      </div>

      <Field
        label="Dirección de la base (opcional)"
        value={baseDireccion}
        onChange={(e) => setBaseDireccion(e.target.value)}
        placeholder="Donde se guarda la camioneta"
        ayuda="Desde aquí se mide la ruta para cotizar la recolección a domicilio."
      />

      <Button type="button" disabled={guardando} onClick={guardar} className="self-start">
        {guardando ? "Guardando…" : "Guardar configuración"}
      </Button>

      <p className="text-sm text-n-600">
        Se guarda como una versión nueva con la fecha de hoy; la anterior queda en el historial. El
        horario por día de la semana no se toca aquí y se conserva tal cual.
      </p>
    </div>
  );
}
