"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { BuscadorClientes } from "@/components/buscador-clientes";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { formatearTelefono } from "@/lib/telefono";
import type { ClienteBuscable } from "@/lib/clientes/buscables";
import { crearVentaRapida } from "./venta-actions";

export type ProductoVenta = { id: string; nombre: string; precio: number; unidad: string; disponible: number };

type Renglon = { clave: number; insumoId: string | null; concepto: string; precio: string; cantidad: string };

const dinero = (v: number) => `$${v.toFixed(2)}`;
let siguiente = 1;

export function VentaRapida({
  clientes,
  productos,
  conInventario,
  turnoAbierto,
  clienteInicial,
}: {
  clientes: ClienteBuscable[];
  productos: ProductoVenta[];
  conInventario: boolean;
  turnoAbierto: boolean;
  clienteInicial: string | null;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [cliente, setCliente] = useState<ClienteBuscable | null>(() => clientes.find((c) => c.id === clienteInicial) ?? null);
  const [buscando, setBuscando] = useState(false);
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [productoElegido, setProductoElegido] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);

  const porId = new Map(productos.map((p) => [p.id, p]));
  const precioDe = (r: Renglon) => (r.insumoId ? porId.get(r.insumoId)?.precio ?? 0 : Number(r.precio) || 0);
  const total = renglones.reduce((s, r) => s + precioDe(r) * (Number(r.cantidad) || 0), 0);

  function cambiar(clave: number, cambios: Partial<Renglon>) {
    setRenglones((prev) => prev.map((r) => (r.clave === clave ? { ...r, ...cambios } : r)));
  }

  function agregarProducto() {
    if (!productoElegido) return;
    const ya = renglones.find((r) => r.insumoId === productoElegido);
    if (ya) cambiar(ya.clave, { cantidad: String((Number(ya.cantidad) || 0) + 1) });
    else setRenglones((prev) => [...prev, { clave: siguiente++, insumoId: productoElegido, concepto: "", precio: "", cantidad: "1" }]);
    setProductoElegido("");
  }

  async function cobrar() {
    setError(null);
    if (renglones.length === 0) return setError("Agrega al menos un producto o concepto.");
    const lineas = renglones.map((r) => ({
      insumoId: r.insumoId,
      concepto: r.concepto,
      precio: r.insumoId ? null : Number(r.precio),
      cantidad: Number(r.cantidad),
    }));
    const res = await envio.ejecutar(() => crearVentaRapida(cliente?.id ?? null, lineas, notas));
    if (res.error || !res.reservaId) return setError(res.error ?? "No se pudo crear la venta.");
    router.push(`/caja/cobrar/${res.reservaId}`);
  }

  return (
    <div className="flex flex-col gap-6">
      {!turnoAbierto && (
        <Alert variante="advertencia" titulo="No hay turno de caja abierto">
          Puedes armar la venta, pero para cobrarla en mostrador o con terminal{" "}
          <Link href="/caja/turno" className="font-semibold underline">
            abre el turno
          </Link>
          .
        </Alert>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">¿A quién?</h2>
        {buscando ? (
          <div className="flex flex-col gap-2">
            <BuscadorClientes
              clientes={clientes}
              onElegir={(c) => {
                setCliente(c);
                setBuscando(false);
              }}
              listarSinBusqueda={false}
              autoFocus
            />
            <Button type="button" variante="secundario" className="self-start" onClick={() => setBuscando(false)}>
              Dejarlo en Público en general
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
            <div>
              <p className="text-sm text-n-600">Cliente</p>
              <p className="font-bold text-n-900">{cliente ? cliente.nombre : "Público en general"}</p>
              <p className="text-sm text-n-600">
                {cliente ? formatearTelefono(cliente.telefono) : "Si es cliente de la casa, escógelo y la venta queda en su cuenta."}
              </p>
            </div>
            <div className="flex gap-2">
              {cliente && (
                <Button type="button" variante="secundario" onClick={() => setCliente(null)}>
                  Quitar cliente
                </Button>
              )}
              <Button type="button" variante="secundario" onClick={() => setBuscando(true)}>
                {cliente ? "Cambiar" : "Escoger cliente"}
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">¿Qué se vende?</h2>

        {conInventario && productos.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <Select label="Producto del inventario" value={productoElegido} onChange={(e) => setProductoElegido(e.target.value)}>
                <option value="">Escoge un producto</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.disponible <= 0}>
                    {p.nombre} · {dinero(p.precio)} por {p.unidad}
                    {p.disponible <= 0 ? " · sin existencia" : ` · quedan ${p.disponible}`}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="button" variante="secundario" onClick={agregarProducto} disabled={!productoElegido}>
              Agregar producto
            </Button>
          </div>
        ) : conInventario ? (
          <p className="text-sm text-n-600">
            No hay productos a la venta. Para vender uno del inventario, márcalo «Se vende en mostrador» con su precio en{" "}
            <Link href="/inventario" className="font-semibold text-morado hover:underline">
              Inventario
            </Link>
            .
          </p>
        ) : null}

        <Button
          type="button"
          variante="secundario"
          className="self-start"
          onClick={() => setRenglones((prev) => [...prev, { clave: siguiente++, insumoId: null, concepto: "", precio: "", cantidad: "1" }])}
        >
          Agregar concepto libre
        </Button>

        {renglones.length > 0 && (
          <ul className="flex flex-col gap-2">
            {renglones.map((r) => {
              const p = r.insumoId ? porId.get(r.insumoId) : null;
              return (
                <li key={r.clave} className="flex flex-wrap items-end gap-3 rounded-lg border border-n-200 bg-white p-3" data-renglon-venta>
                  {p ? (
                    <div className="min-w-48 flex-1">
                      <p className="text-sm text-n-600">Producto</p>
                      <p className="font-semibold text-n-900">{p.nombre}</p>
                      <p className="text-xs text-n-500">
                        {dinero(p.precio)} por {p.unidad} (precio de catálogo)
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-48 flex-1">
                        <Field label="Concepto" value={r.concepto} onChange={(e) => cambiar(r.clave, { concepto: e.target.value })} placeholder="ej. Moño de regalo" />
                      </div>
                      <div className="w-32">
                        <Field label="Precio" type="number" min="0" step="0.01" value={r.precio} onChange={(e) => cambiar(r.clave, { precio: e.target.value })} />
                      </div>
                    </>
                  )}
                  <div className="w-24">
                    <Field
                      label="Cantidad"
                      type="number"
                      min="1"
                      step={p ? "0.01" : "1"}
                      value={r.cantidad}
                      onChange={(e) => cambiar(r.clave, { cantidad: e.target.value })}
                    />
                  </div>
                  <p className="pb-2 font-semibold text-n-900">{dinero(precioDe(r) * (Number(r.cantidad) || 0))}</p>
                  <Button type="button" variante="secundario" onClick={() => setRenglones((prev) => prev.filter((x) => x.clave !== r.clave))}>
                    Quitar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <Field label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="ej. Para regalo" />
        <p className="text-sm text-n-600">
          ¿Precio distinto al del catálogo? Aplica un descuento al cobrar: recepción tiene el mismo tope de siempre.
        </p>
      </section>

      <AccionesFormulario error={error}>
        <Button type="button" cargando={envio.cargando} onClick={cobrar} disabled={renglones.length === 0}>
          {envio.cargando ? "Armando la cuenta…" : `Cobrar ${dinero(total)}`}
        </Button>
      </AccionesFormulario>
    </div>
  );
}
