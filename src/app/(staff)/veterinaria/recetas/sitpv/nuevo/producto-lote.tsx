"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { formatearFechaCalendario } from "@/lib/formato";
import type { ProductoConLotes } from "@/lib/veterinaria/lotes";

/** Producto (Grupo I), su registro SENASICA y el lote: el lote solo ofrece los del producto elegido, con existencia. */
export function ProductoYLoteEspejo({ productos, conLotes }: { productos: { id: string; nombre: string; registro_senasica: string | null }[]; conLotes: ProductoConLotes[] }) {
  const [productoId, setProductoId] = useState(productos[0]?.id ?? "");
  const [loteId, setLoteId] = useState("");
  const lotes = conLotes.find((p) => p.id === productoId)?.lotes ?? [];
  return (
    <>
      <Select label="Producto (Grupo I)" name="insumo_id" required value={productoId} onChange={(e) => { setProductoId(e.target.value); setLoteId(""); }}>
        {productos.map((p) => (
          <option key={p.id} value={p.id}>{p.nombre}{p.registro_senasica ? ` · reg. ${p.registro_senasica}` : ""}</option>
        ))}
      </Select>
      <Field label="Número de registro SENASICA" name="registro_senasica" ayuda="Vacío: el que ya tiene el producto. Si no tiene, captúralo aquí." />
      <Select label="Lote (opcional)" name="lote_id" value={loteId} onChange={(e) => setLoteId(e.target.value)} ayuda={lotes.length === 0 ? "Este producto no tiene lotes con existencia." : undefined}>
        <option value="">— Sin lote —</option>
        {lotes.map((l) => (
          <option key={l.id} value={l.id}>{l.codigo}{l.caducidad ? ` · caduca ${formatearFechaCalendario(l.caducidad)}` : ""}</option>
        ))}
      </Select>
    </>
  );
}
