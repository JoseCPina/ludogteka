"use client";

import Link from "next/link";
import type { ServicioOfrecible } from "@/lib/servicios/ofrecibles";

// Las <option> de un selector de servicios: el que no se puede cobrar se
// ve, pero no se puede elegir, y dice por qué. Va junto con
// `AvisoServiciosSinPrecio`, que le explica a recepción qué hacer.
export function OpcionesServicio({ servicios }: { servicios: ServicioOfrecible[] }) {
  return (
    <>
      {servicios.map((s) => (
        <option key={s.id} value={s.id} disabled={!s.cotizable}>
          {s.nombre}
          {!s.cotizable ? " — sin precio capturado" : ""}
        </option>
      ))}
    </>
  );
}

export function AvisoServiciosSinPrecio({ servicios }: { servicios: ServicioOfrecible[] }) {
  const sinPrecio = servicios.filter((s) => !s.cotizable);
  if (sinPrecio.length === 0) return null;
  return (
    <p className="rounded-md border-[1.5px] border-ambar bg-ambar-suave px-3 py-2 text-sm text-ambar-oscuro">
      {sinPrecio.length === 1 ? "Hay un servicio" : `Hay ${sinPrecio.length} servicios`} sin precio
      capturado. No es que no exista{sinPrecio.length === 1 ? "" : "n"}: falta capturar su tarifa para
      poder reservarlo{sinPrecio.length === 1 ? "" : "s"}:{" "}
      {sinPrecio.map((s, i) => (
        <span key={s.id}>
          {i > 0 && ", "}
          <Link href={`/servicios/${s.id}/tarifas`} className="font-semibold underline">
            {s.nombre}
          </Link>
        </span>
      ))}
      .
    </p>
  );
}
