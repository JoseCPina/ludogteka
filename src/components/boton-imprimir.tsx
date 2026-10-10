"use client";

import { Button } from "@/components/ui/button";

export function BotonImprimirPagina({ texto = "Imprimir o guardar PDF" }: { texto?: string }) {
  return (
    <Button type="button" variante="secundario" onClick={() => window.print()}>
      {texto}
    </Button>
  );
}
