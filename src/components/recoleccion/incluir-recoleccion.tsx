"use client";

import { useEffect, useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Alternar } from "@/components/ui/alternar";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { dinero } from "@/lib/dinero";
import { cotizarRecoleccion, datosParaRecoleccion } from "@/app/(staff)/recolecciones/actions";
import { ETIQUETA_PUNTO, type PedidoRecoleccion, type PuntoPartida } from "@/lib/recoleccion/tipos";

export type ValorRecoleccion = { activa: boolean; pedido: PedidoRecoleccion | null; cotizada: boolean };
export const SIN_RECOLECCION: ValorRecoleccion = { activa: false, pedido: null, cotizada: false };

/**
 * «Incluir recolección» al crear o editar una reserva de estética, hotel o guardería: dirección del cliente (la guardada
 * o una nueva), punto de partida de la camioneta (el local o la base, lo que ya se configura en Ubicación), hora
 * estimada y el cargo según la tarifa por km del negocio. Se cotiza ANTES de guardar (los km de la ficha, o Google para
 * una dirección nueva, o a mano) y el padre guarda la recolección junto con la reserva. Es un bloque controlado: lo que
 * se manda al guardar sale de `valor.pedido`, que solo existe con una cotización válida.
 */
export function IncluirRecoleccion({
  clienteId,
  fechaTexto,
  horaInicial,
  valor,
  onChange,
}: {
  clienteId: string | null;
  // Qué día es (texto para la persona): «la entrada del 12 de noviembre», «la cita».
  fechaTexto: string;
  horaInicial?: string | null;
  valor: ValorRecoleccion;
  onChange: (v: ValorRecoleccion) => void;
}) {
  const cotizando = useEspera();
  const [direccionGuardada, setDireccionGuardada] = useState<string | null>(null);
  const [puntos, setPuntos] = useState<{ negocio: string | null; base: string | null }>({ negocio: null, base: null });
  const [usarGuardada, setUsarGuardada] = useState(true);
  const [direccion, setDireccion] = useState("");
  const [punto, setPunto] = useState<PuntoPartida>("negocio");
  const [hora, setHora] = useState(horaInicial ?? "");
  const [kmManual, setKmManual] = useState("");
  const [pedirKm, setPedirKm] = useState(false);
  const [notas, setNotas] = useState("");
  const [guardarDireccion, setGuardarDireccion] = useState(false);
  const [resumen, setResumen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Al prender el bloque con un cliente: su dirección guardada y los puntos de partida del negocio.
  useEffect(() => {
    if (!valor.activa || !clienteId) return;
    let vivo = true;
    datosParaRecoleccion(clienteId).then((r) => {
      if (!vivo || r.error) return;
      setDireccionGuardada(r.direccion ?? null);
      setPuntos(r.puntos ?? { negocio: null, base: null });
      if (r.direccion) {
        setUsarGuardada(true);
        setDireccion(r.direccion);
      } else {
        setUsarGuardada(false);
      }
      if (!r.puntos?.base) setPunto("negocio");
    });
    return () => { vivo = false; };
  }, [valor.activa, clienteId]);

  // Cualquier cambio invalida la cotización: el padre no guarda hasta volver a cotizar.
  function invalidar() {
    setResumen(null);
    if (valor.cotizada) onChange({ ...valor, pedido: null, cotizada: false });
  }

  async function cotizar() {
    if (!clienteId) return setError("Primero elige al cliente.");
    const dir = (usarGuardada ? direccionGuardada ?? "" : direccion).trim();
    setError(null);
    const km = pedirKm && kmManual !== "" ? Number(kmManual) : null;
    const r = await cotizando.ejecutar(() => cotizarRecoleccion(clienteId, dir, punto, km));
    if (r.error && !r.cotizacion) {
      setError(r.error);
      if (/km a mano/i.test(r.error)) setPedirKm(true);
      return;
    }
    const c = r.cotizacion!;
    if (r.error) {
      setError(r.error);
      return;
    }
    if (c.km == null) {
      setPedirKm(true);
      setError("No pudimos calcular la distancia. Escribe los km de ida.");
      return;
    }
    const pedido: PedidoRecoleccion = {
      direccion: dir,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      punto,
      km: Number(c.km),
      hora: hora || null,
      notas,
      guardarDireccion: !usarGuardada && guardarDireccion,
    };
    const desde = c.punto_direccion ? ` desde ${punto === "base" ? "la base" : "el local"}` : "";
    setResumen(`${c.km} km${desde}${c.origen_km === "guardada" ? " (distancia guardada del cliente)" : c.origen_km === "calculada" ? " (calculados por el mapa)" : " (a mano)"} · ${c.precio != null ? dinero(c.precio) : "sin precio"}${c.precio_km != null ? ` (${dinero(c.precio_km)} por km)` : ""}${r.simulado ? " · coordenadas simuladas (sin llave de Google en este ambiente)" : ""}`);
    onChange({ activa: true, pedido, cotizada: true });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4" data-incluir-recoleccion>
      <div className="flex items-start gap-3">
        <Alternar activo={valor.activa} onClick={() => { const activa = !valor.activa; onChange(activa ? { activa, pedido: null, cotizada: false } : SIN_RECOLECCION); setError(null); setResumen(null); }} aria-labelledby="incluir-recoleccion-titulo" className="mt-0.5 shrink-0" />
        <div>
          <p id="incluir-recoleccion-titulo" className="font-semibold text-n-900">Incluir recolección</p>
          <p className="text-sm text-n-600">La camioneta pasa por {fechaTexto}. El cargo por km entra a la cuenta y la recolección sale en el tablero del día.</p>
        </div>
      </div>
      {valor.activa && (
        <div className="flex flex-col gap-3 border-t border-border pt-3" data-recoleccion-campos>
          {!clienteId ? (
            <p className="text-sm text-n-600">Elige al cliente para ver su dirección.</p>
          ) : (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-semibold text-n-800">Dirección</legend>
                {direccionGuardada && (
                  <label className="flex items-start gap-2 text-sm text-n-800">
                    <input type="radio" name="recoleccion-direccion" className="mt-1" checked={usarGuardada} onChange={() => { setUsarGuardada(true); setDireccion(direccionGuardada); invalidar(); }} />
                    <span>La guardada: <span className="text-n-900">{direccionGuardada}</span></span>
                  </label>
                )}
                <label className="flex items-start gap-2 text-sm text-n-800">
                  <input type="radio" name="recoleccion-direccion" className="mt-1" checked={!usarGuardada} onChange={() => { setUsarGuardada(false); setDireccion(""); invalidar(); }} />
                  <span>{direccionGuardada ? "Otra dirección" : "Escribir la dirección"}</span>
                </label>
                {!usarGuardada && (
                  <>
                    <Field label="Calle, número y colonia" value={direccion} onChange={(e) => { setDireccion(e.target.value); invalidar(); }} placeholder="Ej. Av. Himno Nacional 1230, Tangamanga" />
                    <label className="flex items-center gap-2 text-sm text-n-700">
                      <input type="checkbox" checked={guardarDireccion} onChange={(e) => setGuardarDireccion(e.target.checked)} />
                      Guardarla en la ficha del cliente
                    </label>
                  </>
                )}
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Sale desde" value={punto} onChange={(e) => { setPunto(e.target.value as PuntoPartida); invalidar(); }} ayuda={punto === "base" ? puntos.base ?? undefined : puntos.negocio ?? undefined}>
                  <option value="negocio">{ETIQUETA_PUNTO.negocio}</option>
                  {puntos.base && <option value="base">{ETIQUETA_PUNTO.base}</option>}
                </Select>
                <Field label="Hora estimada" type="time" value={hora} onChange={(e) => { setHora(e.target.value); if (valor.pedido) onChange({ ...valor, pedido: { ...valor.pedido, hora: e.target.value || null } }); }} />
              </div>
              {pedirKm && (
                <Field label="Kilómetros de ida (a mano)" type="number" min="0" step="0.5" value={kmManual} onChange={(e) => { setKmManual(e.target.value); invalidar(); }} ayuda="Cuando el mapa no puede calcularlos." />
              )}
              <Field label="Notas para quien recoge (opcional)" value={notas} onChange={(e) => { setNotas(e.target.value); if (valor.pedido) onChange({ ...valor, pedido: { ...valor.pedido, notas: e.target.value } }); }} placeholder="Ej. Tocar en el portón negro" />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variante="secundario" tamano="compacto" cargando={cotizando.cargando} onClick={cotizar} data-cotizar-recoleccion>
                  {valor.cotizada ? "Volver a cotizar" : "Cotizar recolección"}
                </Button>
                {resumen && <p className="text-sm font-semibold text-menta-oscuro" data-recoleccion-resumen>{resumen}</p>}
                {!resumen && !error && <p className="text-sm text-n-600">Cotiza antes de guardar: el cargo entra a la cuenta con ese precio.</p>}
              </div>
              {error && (
                <p role="alert" className="rounded-md border-l-4 border-coral bg-coral-suave px-3 py-2 text-sm font-semibold text-coral-oscuro">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
