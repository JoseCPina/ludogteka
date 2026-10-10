"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import type { ItemCatalogo } from "@/components/cfdi/textos";
import { guardarConfigFiscal, type ConfigFiscal } from "./actions";

const VACIA: ConfigFiscal = {
  activa: false,
  modo: "pruebas",
  rfc: "",
  razon_social: "",
  regimen_fiscal: "",
  cp_expedicion: "",
  tipo_persona: "fisica",
  serie: "A",
  global_periodicidad: "mes",
  global_automatica: false,
};

export function ConfigFiscalForm({ inicial, catalogos, editable }: { inicial: ConfigFiscal | null; catalogos: ItemCatalogo[]; editable: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const [c, setC] = useState<ConfigFiscal>(inicial ?? VACIA);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const resico = c.regimen_fiscal === "626";
  const poner = <K extends keyof ConfigFiscal>(k: K, v: ConfigFiscal[K]) => setC((x) => ({ ...x, [k]: v }));

  async function guardar() {
    setError(null);
    setExito(null);
    const envia = resico ? { ...c, global_periodicidad: "mes" as const } : c;
    const r = await envio.ejecutar(() => guardarConfigFiscal(envia));
    if (r.error) return setError(r.error);
    setExito(r.aviso ?? "Guardado");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-4">
      <p className="text-sm text-n-600">Tal como vienen en la constancia de situación fiscal del negocio. Con estos datos se emiten todas las facturas.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="RFC" value={c.rfc} onChange={(e) => poner("rfc", e.target.value.toUpperCase())} maxLength={13} disabled={!editable} />
        <Field label="Razón social (como en la constancia)" value={c.razon_social} onChange={(e) => poner("razon_social", e.target.value)} disabled={!editable} />
        <Select label="Régimen fiscal" value={c.regimen_fiscal} onChange={(e) => poner("regimen_fiscal", e.target.value)} disabled={!editable}>
          <option value="">Escoge…</option>
          {catalogos.map((r) => (
            <option key={r.clave} value={r.clave}>
              {r.clave} · {r.descripcion}
            </option>
          ))}
        </Select>
        <Field
          label="Código postal del lugar de expedición"
          value={c.cp_expedicion}
          onChange={(e) => poner("cp_expedicion", e.target.value.replace(/\D/g, "").slice(0, 5))}
          inputMode="numeric"
          disabled={!editable}
        />
        <Select
          label="Tipo de persona"
          ayuda="La consulta veterinaria sale exenta de IVA solo si eres persona física o sociedad civil."
          value={c.tipo_persona}
          onChange={(e) => poner("tipo_persona", e.target.value as ConfigFiscal["tipo_persona"])}
          disabled={!editable}
        >
          <option value="fisica">Persona física</option>
          <option value="moral">Persona moral</option>
          <option value="sociedad_civil">Sociedad civil</option>
        </Select>
        <Field label="Serie de las facturas" value={c.serie} onChange={(e) => poner("serie", e.target.value.toUpperCase())} maxLength={10} disabled={!editable} />
        <Select
          label="Factura global al público en general"
          ayuda={resico ? "En RESICO la global es solo mensual." : "Cada cuánto se junta lo que no se facturó a nombre de nadie."}
          value={resico ? "mes" : c.global_periodicidad}
          onChange={(e) => poner("global_periodicidad", e.target.value as ConfigFiscal["global_periodicidad"])}
          disabled={!editable || resico}
        >
          <option value="dia">Diaria</option>
          <option value="semana">Semanal</option>
          <option value="mes">Mensual</option>
        </Select>
        <Select
          label="Modo"
          ayuda="En pruebas se usa el sandbox: las facturas no valen ante el SAT."
          value={c.modo}
          onChange={(e) => poner("modo", e.target.value as ConfigFiscal["modo"])}
          disabled={!editable}
        >
          <option value="pruebas">Pruebas (sandbox)</option>
          <option value="produccion">Producción (facturas reales)</option>
        </Select>
      </div>
      <label className="flex items-start gap-2 text-sm text-n-800">
        <input type="checkbox" className="mt-1" checked={c.global_automatica} onChange={(e) => poner("global_automatica", e.target.checked)} disabled={!editable} />
        <span>Emitir la factura global sola al cerrar cada periodo (si no, la emites tú desde Facturas; la regla pide hacerlo dentro de las 24 horas siguientes al cierre).</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-n-800">
        <input type="checkbox" className="mt-1" checked={c.activa} onChange={(e) => poner("activa", e.target.checked)} disabled={!editable} />
        <span>Facturación activa (aparece «Facturar» en los cobros).</span>
      </label>
      {editable && (
        <AccionesFormulario error={error} exito={exito}>
          <Button type="button" cargando={envio.cargando} onClick={guardar}>
            {envio.cargando ? "Guardando…" : "Guardar datos fiscales"}
          </Button>
        </AccionesFormulario>
      )}
    </div>
  );
}
