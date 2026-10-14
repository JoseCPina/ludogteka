"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// Las demos de abajo no cargan hasta que el visitante se acerca (300 px antes):
// su JavaScript sale del paquete inicial de la landing.
const DEMOS = {
  vet: dynamic(() => import("./demos/vet"), { ssr: false }),
  hotel: dynamic(() => import("./demos/hotel"), { ssr: false }),
  estetica: dynamic(() => import("./demos/estetica"), { ssr: false }),
  reportes: dynamic(() => import("./demos/reportes"), { ssr: false }),
  cobros: dynamic(() => import("./demos/cobros"), { ssr: false }),
  memoria: dynamic(() => import("./demos/memoria"), { ssr: false }),
};
export type IdDemo = keyof typeof DEMOS;

export function DemoDiferida({ id, reserva }: { id: IdDemo; reserva: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cerca, setCerca] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setCerca(true);
        obs.disconnect();
      },
      { rootMargin: "300px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const Demo = DEMOS[id];
  return (
    <div ref={ref} className={reserva}>
      {cerca && <Demo />}
    </div>
  );
}
