"use client";

import { Button } from "@/components/ui/button";

export function BotonImprimir() {
  return (
    <Button type="button" variante="secundario" onClick={() => window.print()}>
      Imprimir o guardar PDF
    </Button>
  );
}
