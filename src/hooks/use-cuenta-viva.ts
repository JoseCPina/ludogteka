"use client";

import { useEffect, useRef } from "react";
import { conTope } from "@/lib/ui/espera";
import { dinero } from "@/lib/dinero";
import { estadoDeCuentas, type EstadoDeCuenta } from "@/app/(staff)/reservas/cuenta-estado-actions";

export const SONDEO_CUENTA_MS = 8000;

export type BaseCuenta = { id: string; saldo: number; total?: number };

/**
 * El aviso «El saldo cambió» (N39/N41), armado SIEMPRE con el saldo vivo: null mientras se actualiza, cuando no hubo
 * cambio, cuando el saldo volvió al de antes o cuando el monto escrito ya coincide con el saldo de ahora.
 */
export function textoSaldoCambio(o: { antes: number | null; ahora: number; escrito: number; montoTocado: boolean; actualizando: boolean }): string | null {
  if (o.actualizando || o.antes === null || Math.abs(o.antes - o.ahora) <= 0.005) return null;
  const base = `El saldo cambió: antes era ${dinero(o.antes)} y ahora es ${dinero(o.ahora)}.`;
  if (!o.montoTocado) return `${base} El monto ya se actualizó.`;
  if (Math.abs(o.escrito - o.ahora) <= 0.005) return null;
  return `${base} El monto que escribiste (${dinero(o.escrito)}) ya no corresponde: revísalo antes de cobrar.`;
}

/** ¿Cambió algo respecto a lo que la pantalla muestra? Pura: la usa la prueba. */
export function cuentasCambiaron(base: BaseCuenta[], vivo: EstadoDeCuenta[]): boolean {
  return base.some((b) => {
    const v = vivo.find((x) => x.id === b.id);
    if (!v) return false;
    return Math.abs(v.saldo - b.saldo) > 0.005 || (b.total !== undefined && Math.abs(v.total - b.total) > 0.005);
  });
}

/**
 * Sondeo corto de la cuenta que se está cobrando (N29): cada 8 s, con la pestaña al frente, pregunta el total y el
 * saldo vivos; si ya no son los que la pantalla muestra, llama `alCambiar` (que refresca la pantalla y avisa).
 * Al cambiar `base` (la pantalla ya se actualizó) el sondeo sigue contra lo nuevo.
 */
export function useCuentaViva(base: BaseCuenta[], alCambiar: (vivo: EstadoDeCuenta[], anterior: BaseCuenta[]) => void, activo = true) {
  const baseRef = useRef(base);
  const alCambiarRef = useRef(alCambiar);
  useEffect(() => {
    baseRef.current = base;
    alCambiarRef.current = alCambiar;
  });
  const ids = base.map((b) => b.id).join(",");

  useEffect(() => {
    if (!activo || !ids) return;
    let vivo = true;
    let enCurso = false;
    async function revisar() {
      if (!vivo || enCurso || document.visibilityState !== "visible") return;
      enCurso = true;
      try {
        const r = await conTope(estadoDeCuentas(ids.split(",")));
        if (!vivo || r.error) return;
        if (cuentasCambiaron(baseRef.current, r.cuentas)) alCambiarRef.current(r.cuentas, baseRef.current);
      } catch {
        // Sin red o tiempo agotado: la siguiente vuelta lo vuelve a intentar.
      } finally {
        enCurso = false;
      }
    }
    const t = setInterval(revisar, SONDEO_CUENTA_MS);
    const alVolver = () => void revisar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [ids, activo]);
}
