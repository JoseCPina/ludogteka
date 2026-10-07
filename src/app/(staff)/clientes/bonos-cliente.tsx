"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { formatearFechaCalendario } from "@/lib/formato";
import { comprarBono } from "../reservas/bono-actions";
import type { MetodoPago } from "../reservas/cobro-actions";
import { CamposTarjetaManual } from "@/components/cobro/campos-tarjeta-manual";
import {
  AVISO_COBRO_TARJETA,
  ETIQUETA_TARJETA_MANUAL,
  cargaTarjetaManual,
  datosVacios,
  validarTarjetaManual,
  type DatosTarjetaManual,
} from "@/lib/cobro/tarjeta-manual";
import type { OpcionesCobroManual } from "@/lib/cobro/opciones-manual";
import { describirBono, describirPaquete } from "@/lib/bonos/descripcion";
import { AjustarDiasPase } from "@/components/pases/ajustar-dias-pase";
import { HistorialPase } from "@/components/pases/historial-pase";
import { useZonaNegocio } from "@/components/zona-negocio";
import { hoyNegocio } from "@/lib/formato";

export type BonoCatalogo = {
  id: string;
  nombre: string;
  cantidad_incluida?: number | null;
  vigencia_dias?: number | null;
  ilimitado?: boolean | null;
};

export type BonoFila = {
  id: string;
  servicio_nombre: string;
  servicio_incluido_nombre: string | null;
  cantidad_total: number;
  cantidad_disponible: number;
  precio_pagado: number;
  fecha_compra: string;
  fecha_vencimiento: string | null;
  estado: string;
  // El perro para el que se vendió: solo él lo consume.
  perro_id: string | null;
  perro_nombre: string | null;
  // Mensualidad: sin tope de días. cantidad_total ahí es el número de
  // días que abre guardería en la vigencia, no un tope comercial — por eso no se
  // muestra como "22/22 disponibles".
  ilimitado?: boolean;
};

export type PerroParaBono = { id: string; nombre: string };

const ETIQUETA_ESTADO: Record<string, string> = {
  activo: "Activo",
  agotado: "Agotado",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

const ESTILO_ESTADO: Record<string, string> = {
  activo: "bg-menta-suave text-menta-oscuro",
  agotado: "bg-n-100 text-n-600",
  vencido: "bg-coral-suave text-coral-oscuro",
  cancelado: "bg-n-100 text-n-500",
};

type FilaMetodo = { metodo: MetodoPago; monto: string; propina: string; tarjeta: DatosTarjetaManual };

const nuevaFila = (): FilaMetodo => ({ metodo: "efectivo", monto: "", propina: "0", tarjeta: datosVacios() });

// Los paquetes agrupados por perro, en el orden en que llegan (los más
// recientes primero).
function agruparPorPerro(bonos: BonoFila[]): [string, BonoFila[]][] {
  const grupos = new Map<string, BonoFila[]>();
  for (const b of bonos) {
    const clave = b.perro_nombre ?? "Sin perro asignado";
    grupos.set(clave, [...(grupos.get(clave) ?? []), b]);
  }
  return Array.from(grupos.entries());
}

/**
 * Los paquetes (day pass, mensualidad) de los perros de un cliente.
 *
 * El paquete es POR PERRO: se vende para uno y solo ese lo consume. Un
 * dueño con dos perros que quiere pases para ambos compra dos paquetes.
 * Por eso vender pide escoger el perro, y el saldo se lee por perro.
 */
export function BonosCliente({
  catalogo,
  bonos,
  perros,
  perroInicial,
  opcionesCobro = { terminalManualBloqueada: false, puedeTarjetaManual: false },
  puedeAjustar = false,
  esAdmin = false,
}: {
  catalogo: BonoCatalogo[];
  bonos: BonoFila[];
  // Los perros vivos del cliente, a los que se les puede vender.
  perros: PerroParaBono[];
  perroInicial?: string | null;
  // Qué métodos se pueden capturar a mano (ver cargarOpcionesCobroManual).
  opcionesCobro?: OpcionesCobroManual;
  // Permiso «Ajustar días de pases»: corregir los días usados y registrar un
  // pase que ya venía usándose. esAdmin además puede extender la vigencia.
  puedeAjustar?: boolean;
  esAdmin?: boolean;
}) {
  const router = useRouter();
  const hoy = hoyNegocio(useZonaNegocio());
  const [usoPrevio, setUsoPrevio] = useState(false);
  const [diasUsados, setDiasUsados] = useState("");
  const [fechasUsados, setFechasUsados] = useState<string[]>([]);
  const [notaUsados, setNotaUsados] = useState("");
  const [vendiendo, setVendiendo] = useState(false);
  const [perroId, setPerroId] = useState(
    perroInicial && perros.some((p) => p.id === perroInicial)
      ? perroInicial
      : perros.length === 1
        ? perros[0].id
        : ""
  );
  const [servicioId, setServicioId] = useState(catalogo[0]?.id ?? "");
  const [notas, setNotas] = useState("");
  const [metodos, setMetodos] = useState<FilaMetodo[]>([nuevaFila()]);
  const enviando = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  function actualizarMetodo(i: number, cambios: Partial<FilaMetodo>) {
    setMetodos((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...cambios } : m)));
  }

  function abrirVenta() {
    setError(null);
    setExito(null);
    setVendiendo(true);
  }

  async function enviar() {
    const payload = metodos.map((m) => ({
      metodo: m.metodo,
      monto: Number(m.monto) || 0,
      propina: Number(m.propina) || 0,
      ...(m.metodo === "tarjeta_manual" ? cargaTarjetaManual(m.tarjeta) : {}),
    }));
    if (!perroId) {
      setError("Escoge el perro para el que es el paquete.");
      return;
    }
    if (payload.some((m) => m.monto <= 0)) {
      setError("Cada método debe tener un monto mayor a cero.");
      return;
    }
    for (const m of metodos) {
      const falla = m.metodo === "tarjeta_manual" ? validarTarjetaManual(m.tarjeta) : null;
      if (falla) {
        setError(falla);
        return;
      }
    }
    const n = usoPrevio ? Number(diasUsados) : 0;
    const paquete = catalogo.find((c) => c.id === servicioId);
    if (usoPrevio) {
      if (!Number.isInteger(n) || n < 1) {
        setError("Escribe cuántos días ya lleva usados (mínimo 1), o desmarca la casilla.");
        return;
      }
      if (paquete && !paquete.ilimitado && paquete.cantidad_incluida && n > paquete.cantidad_incluida) {
        setError(`Este paquete es de ${paquete.cantidad_incluida} días: no puede empezar con ${n} usados.`);
        return;
      }
      const fechasLlenas = fechasUsados.slice(0, n).filter(Boolean);
      if (fechasLlenas.length !== 0 && fechasLlenas.length !== Math.min(n, 10)) {
        setError("Completa las fechas de los días usados o déjalas todas vacías.");
        return;
      }
    }
    setError(null);
    const fechasEnvio = usoPrevio && n <= 10 && fechasUsados.slice(0, n).filter(Boolean).length === n ? fechasUsados.slice(0, n) : [];
    const res = await enviando.ejecutar(() =>
      comprarBono(perroId, servicioId, notas, payload, usoPrevio ? { diasUsados: n, fechas: fechasEnvio, nota: notaUsados } : undefined)
    );
    if (res.error) {
      setError(res.error);
      return;
    }
    setExito(`Paquete vendido para ${perros.find((p) => p.id === perroId)?.nombre ?? "el perro"}`);
    setVendiendo(false);
    setNotas("");
    setMetodos([nuevaFila()]);
    setUsoPrevio(false);
    setDiasUsados("");
    setFechasUsados([]);
    setNotaUsados("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {bonos.length === 0 ? (
        <p className="text-n-600">
          {perros.length === 1
            ? `${perros[0].nombre} no tiene paquetes todavía.`
            : "Ningún perro de este cliente tiene paquetes todavía."}
        </p>
      ) : (
        agruparPorPerro(bonos).map(([nombrePerro, lista]) => (
          <div key={nombrePerro} className="flex flex-col gap-2">
            <p className="text-sm font-bold text-n-800">{nombrePerro}</p>
            <ul className="flex flex-col gap-2">
              {lista.map((b) => (
                <li key={b.id} className="rounded-md border border-n-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-n-900">{b.servicio_nombre}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_ESTADO[b.estado] ?? "bg-n-100"}`}>
                      {ETIQUETA_ESTADO[b.estado] ?? b.estado}
                    </span>
                  </div>
                  <p className="text-sm text-n-700">{describirBono(b)}</p>
                  <p className="text-sm text-n-600">
                    {b.servicio_incluido_nombre ?? "—"} · pagado ${b.precio_pagado.toFixed(2)}
                  </p>
                  <p className="text-xs text-n-500">
                    Comprado {formatearFechaCalendario(b.fecha_compra)}
                    {b.fecha_vencimiento ? ` · vence ${formatearFechaCalendario(b.fecha_vencimiento)}` : " · sin vencimiento"}
                  </p>
                  {b.estado !== "cancelado" && (
                    <div className="mt-2 flex flex-col gap-1">
                      {puedeAjustar && <AjustarDiasPase pase={{ ...b, perro_nombre: b.perro_nombre }} esAdmin={esAdmin} />}
                      <HistorialPase bonoId={b.id} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {catalogo.length === 0 ? (
        <p className="text-sm text-n-500">No hay bonos configurados en el catálogo todavía.</p>
      ) : perros.length === 0 ? (
        <p className="text-sm text-n-600">
          Este cliente no tiene perros vivos registrados: el paquete se vende para un perro.
        </p>
      ) : !vendiendo ? (
        <AccionesFormulario error={error} exito={exito}>
          <Button type="button" variante="secundario" onClick={abrirVenta}>
            Vender paquete
          </Button>
        </AccionesFormulario>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
          <Select label="Perro" value={perroId} onChange={(e) => setPerroId(e.target.value)}>
            {perros.length > 1 && <option value="">Escoge el perro…</option>}
            {perros.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
          <p className="-mt-1 text-sm text-n-600">
            El paquete es solo de este perro. Para otro perro del mismo dueño se vende otro paquete.
          </p>

          <Select label="Paquete" value={servicioId} onChange={(e) => setServicioId(e.target.value)}>
            {catalogo.map((c) => (
              <option key={c.id} value={c.id}>
                {describirPaquete({
                  nombre: c.nombre,
                  cantidad_incluida: c.cantidad_incluida ?? null,
                  vigencia_dias: c.vigencia_dias ?? null,
                  ilimitado: c.ilimitado,
                })}
              </option>
            ))}
          </Select>

          {opcionesCobro.terminalManualBloqueada && <p className="text-sm text-n-600">{AVISO_COBRO_TARJETA}</p>}
          {metodos.map((m, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <Select
                  label="Método"
                  value={m.metodo}
                  onChange={(e) => actualizarMetodo(i, { metodo: e.target.value as MetodoPago })}
                >
                  <option value="efectivo">Efectivo</option>
                  {!opcionesCobro.terminalManualBloqueada && <option value="terminal">Terminal</option>}
                  <option value="transferencia">Transferencia</option>
                  {opcionesCobro.puedeTarjetaManual && <option value="tarjeta_manual">{ETIQUETA_TARJETA_MANUAL}</option>}
                </Select>
              </div>
              <div className="w-32">
                <Field
                  label="Monto"
                  type="number"
                  min="0"
                  step="0.01"
                  value={m.monto}
                  onChange={(e) => actualizarMetodo(i, { monto: e.target.value })}
                />
              </div>
              <div className="w-32">
                <Field
                  label="Propina"
                  type="number"
                  min="0"
                  step="0.01"
                  value={m.propina}
                  onChange={(e) => actualizarMetodo(i, { propina: e.target.value })}
                />
              </div>
              {metodos.length > 1 && (
                <Button
                  type="button"
                  variante="secundario"
                  onClick={() => setMetodos((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  Quitar
                </Button>
              )}
              {m.metodo === "tarjeta_manual" && (
                <CamposTarjetaManual valor={m.tarjeta} onChange={(cambios) => actualizarMetodo(i, { tarjeta: { ...m.tarjeta, ...cambios } })} />
              )}
            </div>
          ))}
          <Button
            type="button"
            variante="secundario"
            className="self-start"
            onClick={() => setMetodos((prev) => [...prev, nuevaFila()])}
          >
            + Repartir en otro método
          </Button>

          {puedeAjustar && (
            <div className="flex flex-col gap-2 rounded-md border border-n-200 bg-white p-3">
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-n-800">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={usoPrevio}
                  onChange={(e) => setUsoPrevio(e.target.checked)}
                />
                Este paquete ya lleva días usados
              </label>
              {usoPrevio && (
                <>
                  <div className="w-44">
                    <Field
                      label="Días que ya lleva usados"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={diasUsados}
                      onChange={(e) => setDiasUsados(e.target.value)}
                    />
                  </div>
                  {Number(diasUsados) >= 1 && Number(diasUsados) <= 10 && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {Array.from({ length: Number(diasUsados) }, (_, i) => (
                        <Field
                          key={i}
                          label={`Fecha del día ${i + 1} (opcional)`}
                          type="date"
                          max={hoy}
                          value={fechasUsados[i] ?? ""}
                          onChange={(e) => {
                            const valor = e.target.value;
                            setFechasUsados(Array.from({ length: Number(diasUsados) }, (_, j) => (j === i ? valor : (fechasUsados[j] ?? ""))));
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <Textarea label="Nota (opcional)" value={notaUsados} onChange={(e) => setNotaUsados(e.target.value)} />
                  <p className="text-sm text-n-600">
                    Solo baja el saldo de días: no genera ningún cobro extra ni mueve la caja. Queda en el historial del pase.
                  </p>
                </>
              )}
            </div>
          )}

          <Textarea label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />

          <AccionesFormulario error={error}>
            <Button type="button" cargando={enviando.cargando} onClick={enviar}>
              {enviando.cargando ? "Vendiendo…" : "Confirmar venta"}
            </Button>
            <Button type="button" variante="secundario" onClick={() => setVendiendo(false)}>
              Cancelar
            </Button>
          </AccionesFormulario>
        </div>
      )}
    </div>
  );
}
