"use client";

import { useEffect, useRef, useState } from "react";
import { conTope, mensajeDeFallo } from "@/lib/ui/espera";
import type { CotizacionLinea } from "@/lib/servicios/cotizacion-linea";
import { cotizarLineaServicio } from "@/lib/servicios/cotizacion-linea-actions";

export type PedidoCotizacion = { perroId: string; servicioId: string; entrada: string | null; salida: string | null; horas: number | null };
export type ResultadoCotizacion = { cotizacion: CotizacionLinea } | { error: string };

/**
 * QA R50 (N133): cotiza cada línea (perro + servicio + fechas) con cotizar_linea_servicio en cuanto se marca o cambia.
 * Cada respuesta se guarda con la clave de lo que se preguntó: una respuesta vieja nunca se ve como la de otras fechas.
 * `de(pedido)` es `undefined` mientras se calcula; `recalcular(perroId)` vuelve a preguntar (después de guardar la talla).
 */
export function useCotizacionLineas(pedidos: PedidoCotizacion[]) {
  const [versiones, setVersiones] = useState<Record<string, number>>({});
  const [resultados, setResultados] = useState<Record<string, ResultadoCotizacion>>({});
  const enCamino = useRef(new Set<string>());
  const clave = (p: PedidoCotizacion) => `${p.perroId}|${p.servicioId}|${p.entrada ?? ""}|${p.salida ?? ""}|${p.horas ?? ""}|${versiones[p.perroId] ?? 0}`;
  const porClave = new Map(pedidos.filter((p) => p.perroId && p.servicioId).map((p) => [clave(p), p] as const));
  const claves = [...porClave.keys()].join(";");

  useEffect(() => {
    for (const k of claves ? claves.split(";") : []) {
      const p = porClave.get(k);
      if (!p || resultados[k] || enCamino.current.has(k)) continue;
      enCamino.current.add(k);
      void conTope(cotizarLineaServicio(p.perroId, p.servicioId, p.entrada, p.salida, p.horas))
        .then((r): ResultadoCotizacion => (r.error || !r.cotizacion ? { error: r.error ?? "No pudimos calcular el precio." } : { cotizacion: r.cotizacion }))
        .catch((e): ResultadoCotizacion => ({ error: mensajeDeFallo(e) }))
        .then((r) => {
          enCamino.current.delete(k);
          setResultados((prev) => ({ ...prev, [k]: r }));
        });
    }
    // porClave se arma de `claves`: con la misma cadena es el mismo pedido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claves, resultados]);

  return {
    de: (p: PedidoCotizacion): ResultadoCotizacion | undefined => resultados[clave(p)],
    recalcular: (perroId: string) => setVersiones((v) => ({ ...v, [perroId]: (v[perroId] ?? 0) + 1 })),
  };
}

/** ¿La línea tiene precio? (lo que habilita guardar). */
export function lineaConPrecio(r: ResultadoCotizacion | undefined): boolean {
  return Boolean(r && "cotizacion" in r && r.cotizacion.estado === "ok");
}
