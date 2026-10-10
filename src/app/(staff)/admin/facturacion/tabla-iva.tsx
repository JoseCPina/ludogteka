"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { ETIQUETA_CLASE, ivaPorOmision } from "@/components/cfdi/textos";
import { buscarClavesSat, guardarClaseIva } from "./actions";

export type ClaseGuardada = { clase: string; tratamiento: "tasa" | "exento"; tasa: number; clave_prod_serv: string; clave_unidad: string; unidad: string };

const ORDEN = ["estetica", "hospedaje", "guarderia", "otro_servicio", "consulta_veterinaria", "medicina_patente", "alimento_mascotas", "otro_producto"];

export function TablaIva({ guardadas, tipoPersona, editable }: { guardadas: ClaseGuardada[]; tipoPersona: string | null; editable: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-n-600">
        El IVA que lleva cada tipo de concepto en la factura, ya incluido en tus precios. Sin cambios, medicinas de patente veterinarias van a 0 %, alimento procesado y los servicios a 16 %, y la consulta veterinaria exenta solo si eres persona física o sociedad civil. Las claves del SAT se buscan en el catálogo del servicio de timbrado.
      </p>
      <ul className="flex flex-col gap-3">
        {ORDEN.map((clase) => {
          const g = guardadas.find((x) => x.clase === clase);
          const d = ivaPorOmision(clase, tipoPersona);
          return (
            <Fila
              key={`${clase}-${g ? "g" : "d"}-${tipoPersona}`}
              clase={clase}
              editable={editable}
              personalizada={Boolean(g)}
              inicial={{
                tratamiento: g?.tratamiento ?? d.tratamiento,
                tasa: g ? g.tasa : d.tasa,
                clave_prod_serv: g?.clave_prod_serv ?? "01010101",
                clave_unidad: g?.clave_unidad ?? (["medicina_patente", "alimento_mascotas", "otro_producto"].includes(clase) ? "H87" : "E48"),
                unidad: g?.unidad ?? (["medicina_patente", "alimento_mascotas", "otro_producto"].includes(clase) ? "Pieza" : "Unidad de servicio"),
              }}
            />
          );
        })}
      </ul>
    </div>
  );
}

function Fila({ clase, inicial, personalizada, editable }: { clase: string; inicial: Omit<ClaseGuardada, "clase">; personalizada: boolean; editable: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const buscando = useEspera();
  const [trat, setTrat] = useState(inicial.tratamiento);
  const [tasa, setTasa] = useState(String(Math.round(inicial.tasa * 10000) / 100));
  const [clave, setClave] = useState(inicial.clave_prod_serv);
  const [unidadClave, setUnidadClave] = useState(inicial.clave_unidad);
  const [unidad, setUnidad] = useState(inicial.unidad);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<{ clave: string; descripcion: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function buscar() {
    setError(null);
    const r = await buscando.ejecutar(() => buscarClavesSat("productos", q));
    if (r.error) setError(r.error);
    setResultados(r.items);
  }
  async function guardar() {
    setError(null);
    setExito(null);
    const r = await envio.ejecutar(() =>
      guardarClaseIva(clase, trat, trat === "exento" ? 0 : Number(tasa) / 100, clave.trim(), unidadClave.trim(), unidad.trim())
    );
    if (r.error) return setError(r.error);
    setExito(r.aviso ?? "Guardado");
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-n-900">{ETIQUETA_CLASE[clase]}</p>
        <span className="text-xs text-n-500">{personalizada ? "Personalizado" : "Valor por omisión"}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Select label="IVA" value={trat} onChange={(e) => setTrat(e.target.value as "tasa" | "exento")} disabled={!editable}>
          <option value="tasa">Con tasa</option>
          <option value="exento">Exento</option>
        </Select>
        <Field label="Tasa (%)" type="number" min="0" max="100" step="0.01" value={trat === "exento" ? "0" : tasa} onChange={(e) => setTasa(e.target.value)} disabled={!editable || trat === "exento"} />
        <Field label="Clave del producto o servicio (SAT)" value={clave} onChange={(e) => setClave(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" disabled={!editable} />
        <Field label="Clave de unidad" value={unidadClave} onChange={(e) => setUnidadClave(e.target.value.toUpperCase())} maxLength={3} disabled={!editable} />
      </div>
      <Field label="Nombre de la unidad" value={unidad} onChange={(e) => setUnidad(e.target.value)} disabled={!editable} />
      {editable && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Buscar clave en el catálogo del SAT" value={q} onChange={(e) => setQ(e.target.value)} placeholder="por ejemplo: estética canina" />
            <Button type="button" variante="secundario" cargando={buscando.cargando} disabled={q.trim().length < 3} onClick={buscar}>
              Buscar
            </Button>
          </div>
          {resultados.length > 0 && (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-n-200 p-1 text-sm">
              {resultados.map((r) => (
                <li key={r.clave}>
                  <button
                    type="button"
                    className="w-full rounded px-2 py-1 text-left hover:bg-n-100"
                    onClick={() => {
                      setClave(r.clave);
                      setResultados([]);
                    }}
                  >
                    <span className="font-semibold">{r.clave}</span> · {r.descripcion}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {editable && (
        <AccionesFormulario error={error} exito={exito}>
          <Button type="button" cargando={envio.cargando} onClick={guardar}>
            {envio.cargando ? "Guardando…" : "Guardar"}
          </Button>
        </AccionesFormulario>
      )}
    </li>
  );
}
