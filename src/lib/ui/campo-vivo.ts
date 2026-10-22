import type { KeyboardEvent, RefObject } from "react";

// QA S25: un motivo de cancelación quedó recortado («PRUEBA QA») porque la acción usaba el estado de React y el
// teclado del celular todavía no había entregado la última palabra (composición) cuando se tocó el botón o Enter.
// Al confirmar se lee lo que dice el CAMPO en ese momento (como el monto del cobro, N46), y Enter confirma solo
// cuando el teclado ya terminó de componer. Uso: `const ref = useRef<HTMLTextAreaElement>(null)`, `ref={ref}`,
// `onKeyDown` con `esEnterParaConfirmar` y, en el manejador, `valorDelCampo(ref, estado)`.
export function valorDelCampo(ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>, respaldo: string): string {
  return ref.current?.value ?? respaldo;
}

// Enter (sin Shift y fuera de composición): el manejador confirma. Va en línea en el onKeyDown:
// `onKeyDown={(e) => { if (esEnterParaConfirmar(e)) { e.preventDefault(); void confirmar(); } }}`.
export function esEnterParaConfirmar(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing;
}
