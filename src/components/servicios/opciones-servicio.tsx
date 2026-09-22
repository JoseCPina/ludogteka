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
    <p className="rounded-md border-[1.5px] border-amarillo bg-amarillo-suave px-3 py-2 text-sm text-amarillo-oscuro">
      {sinPrecio.length === 1 ? "Hay un servicio" : `Hay ${sinPrecio.length} servicios`} sin precio
      capturado ({sinPrecio.map((s) => s.nombre).join(", ")}). No es que no exista: falta capturar
      su tarifa en{" "}
      <Link href="/servicios" className="font-semibold underline">
        Servicios
      </Link>{" "}
      para poder reservarlo.
    </p>
  );
}
