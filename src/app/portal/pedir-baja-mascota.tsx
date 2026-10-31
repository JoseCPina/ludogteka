"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { useEspera } from "@/hooks/use-espera";
import { valorDelCampo } from "@/lib/ui/campo-vivo";
import { MOTIVOS_BAJA, nombreMotivoBaja, type MotivoBaja } from "@/lib/perros/baja";
import { solicitarBajaMascota } from "./baja-actions";

export type SolicitudBajaPortal = { id: string; motivo: MotivoBaja; nota: string | null; resultado: string; respuesta: string | null; created_at: string; atendida_at: string | null };

/**
 * «Pedir la baja» en la ficha de la mascota del portal: motivo y nota; el negocio la confirma. Si ya hay una pendiente
 * lo dice; si la última se rechazó, enseña la respuesta del negocio.
 */
export function PedirBajaMascota({ perroId, nombre, femenino, solicitudes }: { perroId: string; nombre: string; femenino: boolean; solicitudes: SolicitudBajaPortal[] }) {
  const router = useRouter();
  const envio = useEspera();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState<MotivoBaja | "">("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const campoNota = useRef<HTMLTextAreaElement>(null);
  const pendiente = solicitudes.find((s) => s.resultado === "pendiente");
  const ultimaRechazada = !pendiente ? solicitudes.find((s) => s.resultado === "rechazada") : null;

  const pedir = async () => {
    setError(null);
    if (!motivo) return setError("Elige el motivo.");
    const notaFinal = valorDelCampo(campoNota, nota);
    setNota(notaFinal);
    const res = await envio.ejecutar(() => solicitarBajaMascota(perroId, motivo, notaFinal));
    if (res.error) return setError(res.error);
    setExito("Listo. El negocio va a confirmar la baja; mientras, todo sigue igual.");
    setAbierto(false);
    router.refresh();
  };

  return (
    <section className="flex flex-col gap-3 border-t border-n-200 pt-6" data-pedir-baja>
      <h2 className="text-lg font-bold text-n-900">Dar de baja a {nombre}</h2>
      {pendiente ? (
        <Alert variante="info" titulo="Ya pediste la baja">
          Motivo: {nombreMotivoBaja(pendiente.motivo).toLowerCase()}. El negocio la va a confirmar; mientras, todo sigue igual.
        </Alert>
      ) : (
        <>
          {ultimaRechazada && (
            <Alert variante="advertencia" titulo="La última solicitud no se aceptó">
              {ultimaRechazada.respuesta ? `El negocio dice: «${ultimaRechazada.respuesta}».` : "El negocio no la aceptó."} Si quieres, pídela otra vez o escríbeles.
            </Alert>
          )}
          <p className="text-sm text-n-700">
            Si {nombre} ya no va a venir, cambió de dueño, se capturó por error o falleció, pídenos darl{femenino ? "a" : "o"} de baja. Nosotros lo confirmamos; su historial se conserva.
          </p>
          {!abierto && (
            <Button type="button" variante="secundario" className="self-start" onClick={() => setAbierto(true)} data-abrir-pedir-baja>
              Pedir la baja…
            </Button>
          )}
          {abierto && (
            <form
              method="post"
              className="flex flex-col gap-4 rounded-md border border-n-200 bg-white p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void pedir();
              }}
            >
              <Select label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoBaja | "")} required>
                <option value="">Elige el motivo…</option>
                {MOTIVOS_BAJA.map((m) => (
                  <option key={m.clave} value={m.clave}>{m.nombre}</option>
                ))}
              </Select>
              <Textarea ref={campoNota} label="Algo que quieras decirnos (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={500} />
              <AccionesFormulario error={error} exito={exito}>
                <Button type="submit" variante="peligro" cargando={envio.cargando} data-confirmar-pedir-baja>
                  Pedir la baja
                </Button>
                <Button type="button" variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Button>
              </AccionesFormulario>
            </form>
          )}
          {!abierto && (error || exito) && <AccionesFormulario error={error} exito={exito}>{null}</AccionesFormulario>}
        </>
      )}
    </section>
  );
}
