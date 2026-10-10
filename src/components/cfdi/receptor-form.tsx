"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import type { ReceptorManual } from "@/app/(staff)/caja/facturacion-actions";
import type { ItemCatalogo } from "./textos";

// Los datos fiscales de quien recibe la factura, capturados al momento (cliente
// sin datos, «Público en general», o para corregir una factura). Las reglas
// reales (formato del RFC, régimen que cuadra con la persona…) las vuelve a
// comprobar la base; aquí solo se evita mandar lo obvio.
export function ReceptorForm({
  catalogos,
  inicial,
  cargando,
  error,
  textoBoton,
  onEnviar,
  onCancelar,
}: {
  catalogos: ItemCatalogo[];
  inicial?: Partial<ReceptorManual> | null;
  cargando: boolean;
  error: string | null;
  textoBoton: string;
  onEnviar: (r: ReceptorManual) => void;
  onCancelar?: () => void;
}) {
  const [rfc, setRfc] = useState(inicial?.rfc ?? "");
  const [nombre, setNombre] = useState(inicial?.nombre_fiscal ?? "");
  const [cp, setCp] = useState(inicial?.cp ?? "");
  const [regimen, setRegimen] = useState(inicial?.regimen_fiscal ?? "");
  const [uso, setUso] = useState(inicial?.uso_cfdi ?? "G03");
  const [email, setEmail] = useState(inicial?.email ?? "");
  const [local, setLocal] = useState<string | null>(null);
  const extranjero = rfc.trim().toUpperCase() === "XEXX010101000";

  function enviar() {
    setLocal(null);
    const r = rfc.trim().toUpperCase();
    if (r === "XAXX010101000") {
      setLocal("El RFC genérico del público en general no se factura aparte: esa venta entra en la factura global del periodo.");
      return;
    }
    if (!r) return setLocal("Escribe el RFC.");
    if (!nombre.trim()) return setLocal("Escribe el nombre o razón social como viene en la constancia.");
    if (!extranjero && !/^\d{5}$/.test(cp.trim())) return setLocal("El código postal fiscal tiene 5 dígitos.");
    if (!extranjero && !regimen) return setLocal("Escoge el régimen fiscal.");
    onEnviar({ rfc: r, nombre_fiscal: nombre.trim(), cp: cp.trim(), regimen_fiscal: regimen, uso_cfdi: uso, email: email.trim() || undefined });
  }

  const regimenes = catalogos.filter((c) => c.tipo === "regimen_fiscal");
  const usos = catalogos.filter((c) => c.tipo === "uso_cfdi");

  return (
    <div className="flex flex-col gap-3 rounded-md border border-n-200 bg-white p-3">
      <p className="text-sm text-n-700">
        Pídele al cliente su constancia de situación fiscal y copia los datos tal cual. Para un extranjero sin RFC escribe XEXX010101000.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="RFC" value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} maxLength={13} autoComplete="off" />
        <Field label="Nombre o razón social (como en la constancia)" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        {!extranjero && <Field label="Código postal fiscal" value={cp} onChange={(e) => setCp(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" />}
        {!extranjero && (
          <Select label="Régimen fiscal" value={regimen} onChange={(e) => setRegimen(e.target.value)}>
            <option value="">Escoge…</option>
            {regimenes.map((r) => (
              <option key={r.clave} value={r.clave}>
                {r.clave} · {r.descripcion}
              </option>
            ))}
          </Select>
        )}
        {!extranjero && (
          <Select label="Uso del CFDI" value={uso} onChange={(e) => setUso(e.target.value)}>
            {usos.map((u) => (
              <option key={u.clave} value={u.clave}>
                {u.clave} · {u.descripcion}
              </option>
            ))}
          </Select>
        )}
        <Field label="Correo para mandarle la factura (opcional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <AccionesFormulario error={local ?? error}>
        <Button type="button" cargando={cargando} onClick={enviar}>
          {cargando ? "Timbrando…" : textoBoton}
        </Button>
        {onCancelar && (
          <Button type="button" variante="secundario" onClick={onCancelar} disabled={cargando}>
            Cancelar
          </Button>
        )}
      </AccionesFormulario>
    </div>
  );
}
