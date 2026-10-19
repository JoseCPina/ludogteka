"use client";

import { useRouter } from "next/navigation";
import { useCuentaViva } from "@/hooks/use-cuenta-viva";

/**
 * QA S15: el encabezado de una reserva (saldo y avisos de la cuenta) se pone al día solo cuando otra persona cobra,
 * anula o carga algo, con el mismo sondeo de la pantalla de cobro; no pinta nada.
 */
export function RefrescoCuenta({ reservaId, saldo, total }: { reservaId: string; saldo: number; total: number }) {
  const router = useRouter();
  useCuentaViva([{ id: reservaId, saldo, total }], () => router.refresh());
  return null;
}
