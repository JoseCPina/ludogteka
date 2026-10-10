"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { guardarDatosFiscalesCliente } from "@/app/(staff)/admin/facturacion/actions";
import type { ItemCatalogo } from "./textos";

type Datos = { rfc: string; nombre_fiscal: string; cp: string; regimen_fiscal: string; uso_cfdi: string; email: string | null };

export function DatosFiscalesForm({ clienteId, inicial, catalogos, editable }: { clienteId: string; inicial: Datos | null; catalogos: ItemCatalogo[]; editable: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const [rfc, setRfc] = useState(inicial?.rfc ?? "");
  const [nombre, setNombre] = useState(inicial?.nombre_fiscal ?? "");
  const [cp, setCp] = useState(inicial?.cp ?? "");
  const [regimen, setRegimen] = useState(inicial?.regimen_fiscal ?? "");
  const [uso, setUso] = useState(inicial?.uso_cfdi ?? "G03");
  const [email, setEmail] = useState(inicial?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setExito(null);
    const r = await envio.ejecutar(() =>
      guardarDatosFiscalesCliente(clienteId, { rfc, nombre_fiscal: nombre, cp, regimen_fiscal: regimen, uso_cfdi: uso, email: email.trim() || undefined })
    );
    if (r.error) return setError(r.error);
    setExito(r.aviso ?? "Guardado");
    router.refresh();
  }

  if (!editable && !inicial) return <p className="text-sm text-n-600">Este cliente no tiene datos fiscales. Quien tenga el permiso «Editar datos fiscales» puede capturarlos.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="RFC" value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} maxLength={13} disabled={!editable} autoComplete="off" />
        <Field label="Nombre o razón social (como en la constancia)" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={!editable} autoComplete="off" />
        <Field label="Código postal fiscal" value={cp} onChange={(e) => setCp(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" disabled={!editable} />
        <Select label="Régimen fiscal" value={regimen} onChange={(e) => setRegimen(e.target.value)} disabled={!editable}>
          <option value="">Escoge…</option>
          {catalogos
            .filter((c) => c.tipo === "regimen_fiscal")
            .map((r) => (
              <option key={r.clave} value={r.clave}>
                {r.clave} · {r.descripcion}
              </option>
            ))}
        </Select>
        <Select label="Uso del CFDI" value={uso} onChange={(e) => setUso(e.target.value)} disabled={!editable}>
          {catalogos
            .filter((c) => c.tipo === "uso_cfdi")
            .map((u) => (
              <option key={u.clave} value={u.clave}>
                {u.clave} · {u.descripcion}
              </option>
            ))}
        </Select>
        <Field label="Correo para mandarle la factura (opcional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!editable} />
      </div>
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
