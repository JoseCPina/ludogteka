"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Mientras falte algo (firma, pago, la hora), la pantalla se actualiza sola cada 15 segundos. */
export function Refrescar({ activo }: { activo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!activo) return;
    const id = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(id);
  }, [activo, router]);
  return null;
}
