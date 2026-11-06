"use client";

import Link from "next/link";
import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { prepararContratosApp } from "@/app/app/(sesion)/negocios/acciones";
import { FirmarContratoApp } from "@/components/app/firmar-contrato-app";
import { nombreDeContrato } from "@/lib/app/contratos-texto";
import type { RequisitoDueno } from "@/lib/app/requisitos";

/** Lo que falta para reservar o pedir cita (el catálogo de src/lib/app/requisitos.ts): nunca una pared. */
export function RequisitosReserva({ faltan, puedePedirLugar, negocioId, mascotaId }: { faltan: RequisitoDueno[]; puedePedirLugar: boolean; negocioId: string; mascotaId: string }) {
  const envio = useEspera();
  const [contratos, setContratos] = useState<{ id: string; tipo_nombre: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function firmar() {
    setError(null);
    const r = await envio.ejecutar(() => prepararContratosApp(negocioId, mascotaId));
    if (r.error) return setError(r.error);
    setContratos(r.datos ?? []);
  }
  return (
    <div className="apd-tarjeta" style={{ marginTop: "0.5rem" }} data-requisitos>
      <p style={{ fontWeight: 800 }}>{puedePedirLugar ? "Antes de tu lugar" : "Esa fecha no se puede"}</p>
      {faltan.map((f, i) => (
        <div key={`${f.clave}${i}`} style={{ marginTop: "0.75rem" }} data-requisito={f.clave}>
          <p style={{ fontWeight: 700 }}>{f.titulo}</p>
          <p className="apd-nota">{f.explicacion}</p>
          {f.accion === "cartilla" && <Link href={`/mascotas/${mascotaId}/cartilla`} className="apd-boton-sec" style={{ marginTop: "0.5rem" }}>Subir su cartilla</Link>}
          {f.accion === "contrato" && !contratos && (
            <button type="button" className="apd-boton-sec" style={{ marginTop: "0.5rem" }} aria-busy={envio.cargando || undefined} disabled={envio.cargando} onClick={firmar} data-firmar-contrato>
              {envio.cargando ? "Abriendo…" : "Firmar aquí"}
            </button>
          )}
        </div>
      ))}
      {contratos?.map((c) => (
        <div key={c.id} style={{ marginTop: "0.9rem" }}>
          <p className="apd-ceja">{nombreDeContrato(c.tipo_nombre)}</p>
          <FirmarContratoApp negocioId={negocioId} contratoId={c.id} tipoNombre={c.tipo_nombre} />
        </div>
      ))}
      {error && <p className="apd-aviso apd-aviso-error" role="alert">{error}</p>}
    </div>
  );
}
