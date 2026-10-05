"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { reasignarEstilista } from "./agenda-actions";

export type Estilista = { id: string; nombre: string };

const SIN_ASIGNAR = "";

/**
 * Quién atiende una cita, y cómo cambiarlo.
 *
 *  · Antes de iniciar (reservada/confirmada): un toque en la lista y queda,
 *    sin motivo; también «Sin asignar».
 *  · En curso: «Cambiar estilista», con motivo opcional.
 *  · Terminada: solo con el permiso de corregir (`puedeCorregir`), con motivo
 *    obligatorio; sin él, solo se muestra quién fue.
 *  · Cancelada / no llegó: solo se muestra.
 *
 * La base es la que decide (reasignar_estilista_cita): esto solo esconde lo
 * que de todos modos rechazaría. Confirma con quién quedó y de quién venía.
 */
export function SelectorEstilista({
  citaId,
  estado,
  perroNombre,
  empleadoId,
  nombreActual,
  estilistas,
  puedeCorregir,
  compacto = false,
}: {
  citaId: string;
  estado: string;
  perroNombre: string;
  empleadoId: string | null;
  nombreActual: string | null;
  estilistas: Estilista[];
  puedeCorregir: boolean;
  compacto?: boolean;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [actualId, setActualId] = useState<string | null>(empleadoId);
  const [actualNombre, setActualNombre] = useState<string | null>(nombreActual);
  const [abierto, setAbierto] = useState(false);
  const [elegida, setElegida] = useState<string>(empleadoId ?? SIN_ASIGNAR);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const antesDeIniciar = estado === "reservada" || estado === "confirmada";
  const enCurso = estado === "en_curso";
  const terminada = estado === "finalizada";
  const puedeCambiar = antesDeIniciar || enCurso || (terminada && puedeCorregir);

  async function aplicar(nuevoId: string | null, motivoTexto: string | null) {
    setError(null);
    setAviso(null);
    const res = await envio.ejecutar(() => reasignarEstilista(citaId, nuevoId, motivoTexto));
    if (res.error) {
      setError(res.error);
      setElegida(actualId ?? SIN_ASIGNAR);
      return false;
    }
    if (res.sinCambio) {
      setAviso("Ya estaba con esa persona.");
      return true;
    }
    const nombre = res.a ?? "Sin asignar";
    setActualId(nuevoId);
    setActualNombre(nuevoId ? nombre : null);
    setAviso(
      `${nuevoId ? `Quedó con ${nombre}` : "Quedó sin asignar"} (antes: ${res.de ?? "Sin asignar"}).` +
        (res.ajusteNomina ? " La diferencia de comisión se ajusta en el siguiente pago de nómina de cada quien." : "")
    );
    router.refresh();
    return true;
  }

  const etiquetaLista = `Estilista de ${perroNombre}`;
  const opciones = (
    <>
      {antesDeIniciar && <option value={SIN_ASIGNAR}>Sin asignar</option>}
      {!antesDeIniciar && actualId === null && <option value={SIN_ASIGNAR}>Sin asignar</option>}
      {estilistas.map((e) => (
        <option key={e.id} value={e.id}>
          {e.nombre}
        </option>
      ))}
      {actualId && !estilistas.some((e) => e.id === actualId) && (
        <option value={actualId}>{actualNombre ?? "Estilista anterior"}</option>
      )}
    </>
  );

  const confirmacion = (
    <>
      {error && (
        <p role="alert" className="rounded-md border-l-4 border-coral bg-coral-suave px-3 py-1.5 text-sm font-semibold text-coral-oscuro">
          {error}
        </p>
      )}
      {!error && aviso && (
        <p role="status" data-estilista-aviso className="rounded-md border-l-4 border-menta bg-menta-suave px-3 py-1.5 text-sm font-semibold text-menta-oscuro">
          {aviso}
        </p>
      )}
    </>
  );

  // Cerrada sin permiso (o cancelada / no llegó): solo quién fue.
  if (!puedeCambiar) {
    return (
      <p data-estilista className="text-sm text-n-600">
        Estilista: <span className="font-semibold text-n-800">{actualNombre ?? "Sin asignar"}</span>
      </p>
    );
  }

  if (antesDeIniciar) {
    return (
      <div className="flex flex-col gap-1.5" data-estilista>
        <Select
          label={compacto ? etiquetaLista : "Estilista"}
          value={elegida}
          disabled={envio.cargando}
          onChange={async (e) => {
            const valor = e.target.value;
            setElegida(valor);
            await aplicar(valor === SIN_ASIGNAR ? null : valor, null);
          }}
          className={compacto ? "min-h-11 text-sm" : ""}
        >
          {opciones}
        </Select>
        {confirmacion}
      </div>
    );
  }

  // En curso o terminada (con permiso): se abre un pequeño formulario.
  return (
    <div className="flex flex-col gap-2" data-estilista>
      <p className="text-sm text-n-600">
        Estilista: <span className="font-semibold text-n-800">{actualNombre ?? "Sin asignar"}</span>
      </p>
      {abierto ? (
        <form
          className="flex flex-col gap-3 rounded-md border border-n-200 bg-n-50 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (elegida === (actualId ?? SIN_ASIGNAR)) return setError("Escoge a otra persona.");
            if (terminada && !motivo.trim()) return setError("Escribe el motivo de la corrección.");
            const ok = await aplicar(elegida === SIN_ASIGNAR ? null : elegida, motivo.trim() || null);
            if (ok) {
              setAbierto(false);
              setMotivo("");
            }
          }}
        >
          <Select label="Pasar a" value={elegida} onChange={(e) => setElegida(e.target.value)}>
            {opciones}
          </Select>
          <Textarea
            label={terminada ? "Motivo de la corrección (obligatorio)" : "Motivo (opcional)"}
            rows={2}
            maxLength={300}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            ayuda={
              terminada
                ? "El servicio ya terminó: el cambio queda en el historial y, si ya se pagó su nómina, se ajusta en el siguiente pago."
                : "Por ejemplo: «Ana tomó al perro a la mitad»."
            }
          />
          <AccionesFormulario error={error}>
            <Button type="submit" cargando={envio.cargando}>
              {terminada ? "Corregir estilista" : "Cambiar estilista"}
            </Button>
            <Button type="button" variante="secundario" onClick={() => { setAbierto(false); setError(null); }}>
              Cancelar
            </Button>
          </AccionesFormulario>
        </form>
      ) : (
        <>
          <Button type="button" variante="secundario" className="self-start" onClick={() => { setAbierto(true); setAviso(null); setError(null); setElegida(actualId ?? SIN_ASIGNAR); }}>
            {terminada ? "Corregir estilista" : "Cambiar estilista"}
          </Button>
          {confirmacion}
        </>
      )}
    </div>
  );
}
