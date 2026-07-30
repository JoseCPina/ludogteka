"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario } from "@/lib/formato";
import { comprarBono } from "../reservas/bono-actions";
import type { MetodoPago } from "../reservas/cobro-actions";

export type BonoCatalogo = { id: string; nombre: string };

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
};

const ETIQUETA_ESTADO: Record<string, string> = {
  activo: "Activo",
  agotado: "Agotado",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

const ESTILO_ESTADO: Record<string, string> = {
  activo: "bg-verde-suave text-verde-oscuro",
  agotado: "bg-n-100 text-n-600",
  vencido: "bg-naranja-suave text-naranja-oscuro",
  cancelado: "bg-n-100 text-n-500",
};

type FilaMetodo = { metodo: MetodoPago; monto: string; propina: string };

export function BonosCliente({
  clienteId,
  catalogo,
  bonos,
}: {
  clienteId: string;
  catalogo: BonoCatalogo[];
  bonos: BonoFila[];
}) {
  const router = useRouter();
  const [vendiendo, setVendiendo] = useState(false);
  const [servicioId, setServicioId] = useState(catalogo[0]?.id ?? "");
  const [notas, setNotas] = useState("");
  const [metodos, setMetodos] = useState<FilaMetodo[]>([{ metodo: "efectivo", monto: "", propina: "0" }]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function actualizarMetodo(i: number, cambios: Partial<FilaMetodo>) {
    setMetodos((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...cambios } : m)));
  }

  async function enviar() {
    const payload = metodos.map((m) => ({
      metodo: m.metodo,
      monto: Number(m.monto) || 0,
      propina: Number(m.propina) || 0,
    }));
    if (payload.some((m) => m.monto <= 0)) {
      setError("Cada método debe tener un monto mayor a cero.");
      return;
    }
    setEnviando(true);
    setError(null);
    const res = await comprarBono(clienteId, servicioId, notas, payload);
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setVendiendo(false);
    setNotas("");
    setMetodos([{ metodo: "efectivo", monto: "", propina: "0" }]);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {bonos.length === 0 ? (
        <p className="text-n-600">Este cliente no tiene bonos todavía.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bonos.map((b) => (
            <li key={b.id} className="rounded-md border border-n-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-n-900">{b.servicio_nombre}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_ESTADO[b.estado] ?? "bg-n-100"}`}>
                  {ETIQUETA_ESTADO[b.estado] ?? b.estado}
                </span>
              </div>
              <p className="text-sm text-n-600">
                {b.servicio_incluido_nombre ?? "—"} · {b.cantidad_disponible}/{b.cantidad_total} disponibles ·
                pagado ${b.precio_pagado.toFixed(2)}
              </p>
              <p className="text-xs text-n-500">
                Comprado {formatearFechaCalendario(b.fecha_compra)}
                {b.fecha_vencimiento ? ` · vence ${formatearFechaCalendario(b.fecha_vencimiento)}` : " · sin vencimiento"}
              </p>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <Alert variante="error" titulo="No se pudo completar la acción">
          {error}
        </Alert>
      )}

      {catalogo.length === 0 ? (
        <p className="text-sm text-n-500">No hay bonos configurados en el catálogo todavía.</p>
      ) : !vendiendo ? (
        <Button type="button" variante="secundario" className="self-start" onClick={() => setVendiendo(true)}>
          Vender bono
        </Button>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
          <Select label="Bono" value={servicioId} onChange={(e) => setServicioId(e.target.value)}>
            {catalogo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
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

          <div className="flex gap-2">
            <Button type="button" disabled={enviando} onClick={enviar}>
              {enviando ? "Vendiendo…" : "Confirmar venta"}
            </Button>
            <Button type="button" variante="secundario" onClick={() => setVendiendo(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
