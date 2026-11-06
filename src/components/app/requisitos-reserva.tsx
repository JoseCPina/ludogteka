"use client";

import type { RequisitoDueno } from "@/lib/app/requisitos";

/**
 * Lo que falta para reservar o pedir cita (el catálogo de src/lib/app/requisitos.ts): nunca una pared. Cada requisito
 * dice qué es y qué puede hacer el dueño; el contrato de alta no aparece (se firma después de reservar o ahí mismo) y la
 * cartilla de la app no se promete como registro del negocio.
 */
export function RequisitosReserva({ faltan, puedePedirLugar }: { faltan: RequisitoDueno[]; puedePedirLugar: boolean; negocioId?: string; mascotaId?: string }) {
  return (
    <div className="apd-tarjeta" style={{ marginTop: "0.5rem" }} data-requisitos>
      <p style={{ fontWeight: 800 }}>{puedePedirLugar ? "Antes de tu lugar" : "Esa fecha no se puede"}</p>
      {faltan.map((f, i) => (
        <div key={`${f.clave}${i}`} style={{ marginTop: "0.75rem" }} data-requisito={f.clave}>
          <p style={{ fontWeight: 700 }}>{f.titulo}</p>
          <p className="apd-nota">{f.explicacion}</p>
        </div>
      ))}
    </div>
  );
}
