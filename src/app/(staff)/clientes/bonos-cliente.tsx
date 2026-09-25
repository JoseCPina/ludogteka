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
import { describirBono, describirPaquete } from "@/lib/bonos/descripcion";

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

type FilaMetodo = { metodo: MetodoPago; monto: string; propina: string };

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
}: {
  catalogo: BonoCatalogo[];
  bonos: BonoFila[];
  // Los perros vivos del cliente, a los que se les puede vender.
  perros: PerroParaBono[];
  perroInicial?: string | null;
}) {
  const router = useRouter();
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
  const [metodos, setMetodos] = useState<FilaMetodo[]>([{ metodo: "efectivo", monto: "", propina: "0" }]);
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
    }));
    if (!perroId) {
      setError("Escoge el perro para el que es el paquete.");
      return;
    }
    if (payload.some((m) => m.monto <= 0)) {
      setError("Cada método debe tener un monto mayor a cero.");
      return;
    }
    setError(null);
    const res = await enviando.ejecutar(() => comprarBono(perroId, servicioId, notas, payload));
    if (res.error) {
      setError(res.error);
      return;
    }
    setExito(`Paquete vendido para ${perros.find((p) => p.id === perroId)?.nombre ?? "el perro"}`);
    setVendiendo(false);
    setNotas("");
    setMetodos([{ metodo: "efectivo", monto: "", propina: "0" }]);
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

          {metodos.map((m, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <Select
                  label="Método"
                  value={m.metodo}
                  onChange={(e) => actualizarMetodo(i, { metodo: e.target.value as MetodoPago })}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="terminal">Terminal</option>
                  <option value="transferencia">Transferencia</option>
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
            </div>
          ))}
          <Button
            type="button"
            variante="secundario"
            className="self-start"
            onClick={() => setMetodos((prev) => [...prev, { metodo: "efectivo", monto: "", propina: "0" }])}
          >
            + Repartir en otro método
          </Button>

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
