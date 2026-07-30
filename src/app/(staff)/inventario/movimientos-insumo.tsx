"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import { registrarEntradaCompra, registrarSalida, registrarAjuste } from "./movimientos-actions";

const ETIQUETA_TIPO: Record<string, string> = {
  entrada_compra: "Entrada (compra)",
  salida_consumo: "Salida (consumo)",
  salida_merma: "Merma",
  ajuste_positivo: "Ajuste (+)",
  ajuste_negativo: "Ajuste (−)",
};

const ESTILO_TIPO: Record<string, string> = {
  entrada_compra: "bg-verde-suave text-verde-oscuro",
  salida_consumo: "bg-n-100 text-n-700",
  salida_merma: "bg-naranja-suave text-naranja-oscuro",
  ajuste_positivo: "bg-verde-suave text-verde-oscuro",
  ajuste_negativo: "bg-naranja-suave text-naranja-oscuro",
};

export type MovimientoFila = {
  id: string;
  tipo: string;
  cantidad_base: number;
  fecha_caducidad: string | null;
  motivo: string | null;
  created_at: string;
  compra: { proveedor_nombre: string; cantidad_compra: number; costo_unitario: number; costo_total: number } | null;
};

export type ProveedorOpcion = { id: string; nombre: string };

export function MovimientosInsumo({
  insumoId,
  esAdmin,
  unidadCompraEtiqueta,
  unidadConsumoEtiqueta,
  equivalenciaConsumo,
  requiereCaducidad,
  proveedores,
  movimientos,
}: {
  insumoId: string;
  esAdmin: boolean;
  unidadCompraEtiqueta: string;
  unidadConsumoEtiqueta: string;
  equivalenciaConsumo: number;
  requiereCaducidad: boolean;
  proveedores: ProveedorOpcion[];
  movimientos: MovimientoFila[];
}) {
  const router = useRouter();
  const [formularioAbierto, setFormularioAbierto] = useState<"entrada" | "salida" | "ajuste" | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Entrada
  const [proveedorId, setProveedorId] = useState("");
  const [cantidadCompra, setCantidadCompra] = useState("");
  const [costoUnitario, setCostoUnitario] = useState("");
  const [fechaCaducidad, setFechaCaducidad] = useState("");

  // Salida
  const [tipoSalida, setTipoSalida] = useState<"consumo" | "merma">("consumo");
  const [cantidadSalida, setCantidadSalida] = useState("");
  const [motivoSalida, setMotivoSalida] = useState("");

  // Ajuste
  const [sentidoAjuste, setSentidoAjuste] = useState<"positivo" | "negativo">("positivo");
  const [cantidadAjuste, setCantidadAjuste] = useState("");
  const [motivoAjuste, setMotivoAjuste] = useState("");

  function cerrarFormulario() {
    setFormularioAbierto(null);
    setError(null);
  }

  async function enviarEntrada() {
    setEnviando(true);
    setError(null);
    const res = await registrarEntradaCompra(
      insumoId,
      proveedorId,
      Number(cantidadCompra),
      Number(costoUnitario),
      requiereCaducidad ? fechaCaducidad || null : null
    );
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setProveedorId("");
    setCantidadCompra("");
    setCostoUnitario("");
    setFechaCaducidad("");
    cerrarFormulario();
    router.refresh();
  }

  async function enviarSalida() {
    setEnviando(true);
    setError(null);
    const res = await registrarSalida(insumoId, Number(cantidadSalida), tipoSalida, motivoSalida || null);
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCantidadSalida("");
    setMotivoSalida("");
    cerrarFormulario();
    router.refresh();
  }

  async function enviarAjuste() {
    setEnviando(true);
    setError(null);
    const res = await registrarAjuste(insumoId, Number(cantidadAjuste), sentidoAjuste, motivoAjuste);
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCantidadAjuste("");
    setMotivoAjuste("");
    cerrarFormulario();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {esAdmin && (
          <Button
            type="button"
            variante={formularioAbierto === "entrada" ? "primario" : "secundario"}
            onClick={() => setFormularioAbierto(formularioAbierto === "entrada" ? null : "entrada")}
          >
            Registrar entrada (compra)
          </Button>
        )}
        <Button
          type="button"
          variante={formularioAbierto === "salida" ? "primario" : "secundario"}
          onClick={() => setFormularioAbierto(formularioAbierto === "salida" ? null : "salida")}
        >
          Registrar salida
        </Button>
        <Button
          type="button"
          variante={formularioAbierto === "ajuste" ? "primario" : "secundario"}
          onClick={() => setFormularioAbierto(formularioAbierto === "ajuste" ? null : "ajuste")}
        >
          Ajuste por conteo físico
        </Button>
      </div>

      {error && (
        <Alert variante="error" titulo="No se pudo registrar">
          {error}
        </Alert>
      )}

      {formularioAbierto === "entrada" && (
        <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4">
          <Select label="Proveedor" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} disabled={enviando}>
            <option value="">Elige un proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={`Cantidad comprada (${unidadCompraEtiqueta})`}
              type="number"
              step="0.01"
              min="0"
              value={cantidadCompra}
              onChange={(e) => setCantidadCompra(e.target.value)}
              disabled={enviando}
            />
            <Field
              label={`Costo por ${unidadCompraEtiqueta}`}
              type="number"
              step="0.01"
              min="0"
              value={costoUnitario}
              onChange={(e) => setCostoUnitario(e.target.value)}
              disabled={enviando}
            />
          </div>
          {requiereCaducidad && (
            <Field
              label="Fecha de caducidad de este lote"
              type="date"
              value={fechaCaducidad}
              onChange={(e) => setFechaCaducidad(e.target.value)}
              disabled={enviando}
            />
          )}
          <div className="flex gap-2">
            <Button type="button" disabled={enviando || !proveedorId || !cantidadCompra || !costoUnitario} onClick={enviarEntrada}>
              {enviando ? "Guardando…" : "Registrar entrada"}
            </Button>
            <Button type="button" variante="secundario" onClick={cerrarFormulario} disabled={enviando}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {formularioAbierto === "salida" && (
        <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4">
          <Select label="Tipo" value={tipoSalida} onChange={(e) => setTipoSalida(e.target.value as "consumo" | "merma")} disabled={enviando}>
            <option value="consumo">Consumo</option>
            <option value="merma">Merma</option>
          </Select>
          <Field
            label={`Cantidad (${unidadConsumoEtiqueta})`}
            type="number"
            step="0.01"
            min="0"
            value={cantidadSalida}
            onChange={(e) => setCantidadSalida(e.target.value)}
            disabled={enviando}
          />
          <Field
            label={tipoSalida === "merma" ? "Motivo" : "Motivo (opcional)"}
            value={motivoSalida}
            onChange={(e) => setMotivoSalida(e.target.value)}
            disabled={enviando}
          />
          <div className="flex gap-2">
            <Button type="button" disabled={enviando || !cantidadSalida} onClick={enviarSalida}>
              {enviando ? "Guardando…" : "Registrar salida"}
            </Button>
            <Button type="button" variante="secundario" onClick={cerrarFormulario} disabled={enviando}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {formularioAbierto === "ajuste" && (
        <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4">
          <Select
            label="Sentido"
            value={sentidoAjuste}
            onChange={(e) => setSentidoAjuste(e.target.value as "positivo" | "negativo")}
            disabled={enviando}
          >
            <option value="positivo">Sobra respecto al sistema (+)</option>
            <option value="negativo">Falta respecto al sistema (−)</option>
          </Select>
          <Field
            label={`Cantidad (${unidadConsumoEtiqueta})`}
            type="number"
            step="0.01"
            min="0"
            value={cantidadAjuste}
            onChange={(e) => setCantidadAjuste(e.target.value)}
            disabled={enviando}
          />
          <Field label="Motivo" value={motivoAjuste} onChange={(e) => setMotivoAjuste(e.target.value)} disabled={enviando} />
          <div className="flex gap-2">
            <Button type="button" disabled={enviando || !cantidadAjuste || !motivoAjuste} onClick={enviarAjuste}>
              {enviando ? "Guardando…" : "Registrar ajuste"}
            </Button>
            <Button type="button" variante="secundario" onClick={cerrarFormulario} disabled={enviando}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {movimientos.length === 0 ? (
        <p className="text-n-600">Todavía no hay movimientos para este insumo.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {movimientos.map((m) => {
            const cantidadMostrada = m.cantidad_base / equivalenciaConsumo;
            return (
              <li key={m.id} className="rounded-md border border-n-200 bg-white px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_TIPO[m.tipo]}`}>
                      {ETIQUETA_TIPO[m.tipo] ?? m.tipo}
                    </span>
                    <span className="font-semibold text-n-900">
                      {cantidadMostrada.toLocaleString("es-MX")} {unidadConsumoEtiqueta}
                    </span>
                  </div>
                  <span className="text-n-500">{formatearFecha(m.created_at)}</span>
                </div>
                {m.motivo && <p className="mt-1 text-n-600">{m.motivo}</p>}
                {m.fecha_caducidad && (
                  <p className="mt-1 text-n-600">Caduca: {new Date(m.fecha_caducidad).toLocaleDateString("es-MX")}</p>
                )}
                {esAdmin && m.compra && (
                  <p className="mt-1 text-n-600">
                    {m.compra.proveedor_nombre} · {m.compra.cantidad_compra} × ${m.compra.costo_unitario.toFixed(2)} = $
                    {m.compra.costo_total.toFixed(2)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
