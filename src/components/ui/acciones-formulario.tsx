import { ReactNode } from "react";
import { conEnlaces } from "./texto-con-enlaces";

/**
 * El pie de todo formulario: los botones y, junto a ellos, la
 * confirmación o el error de la última acción.
 *
 * El defecto que cierra: en un formulario largo, el "Cambios guardados"
 * (o el "No se pudo guardar") salía solo hasta arriba, así que quien
 * apretaba el botón abajo no veía nada y volvía a apretar. El aviso de
 * arriba se queda (es el que se ve al recargar o al llegar); este es el
 * que se ve donde está el dedo.
 *
 * Uso:
 *   <AccionesFormulario error={estado.error} exito={estado.ok && "Cambios guardados"}>
 *     <Button type="submit" cargando={enviando}>Guardar</Button>
 *   </AccionesFormulario>
 *
 * `exito` acepta el texto a mostrar (o `true` para "Guardado"); `error`
 * el mensaje. Los dos vacíos → solo los botones.
 */
export function AccionesFormulario({
  error,
  exito,
  children,
  className = "",
}: {
  error?: string | null | false;
  exito?: string | boolean | null;
  children: ReactNode;
  className?: string;
}) {
  const textoExito = exito === true ? "Guardado" : exito || null;
  const hayError = Boolean(error);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        {children}
        {hayError ? (
          <span
            role="alert"
            className="inline-flex min-h-11 items-center rounded-md border-l-4 border-coral bg-coral-suave px-3 py-1.5 text-sm font-semibold text-coral-oscuro"
          >
            <span>{conEnlaces(error)}</span>
          </span>
        ) : textoExito ? (
          <span
            role="status"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border-l-4 border-menta bg-menta-suave px-3 py-1.5 text-sm font-semibold text-menta-oscuro"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10.5l4 4 8-9" />
            </svg>
            {textoExito}
          </span>
        ) : null}
      </div>
    </div>
  );
}
