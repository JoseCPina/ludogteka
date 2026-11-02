import { TextareaHTMLAttributes, forwardRef, useId } from "react";
import { CLASE_AYUDA, CLASE_ERROR, CLASE_ETIQUETA, claseCampo } from "./campo-base";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  ayuda?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(
  ({ label, error, ayuda, id, className = "", rows = 3, ...props }, ref) => {
    const idGenerado = useId();
    const textareaId = id ?? idGenerado;
    const descripcionId = error
      ? `${textareaId}-error`
      : ayuda
        ? `${textareaId}-ayuda`
        : undefined;

    return (
      <div>
        <label htmlFor={textareaId} className={CLASE_ETIQUETA}>
          {label}
        </label>
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={descripcionId}
          className={claseCampo({ error, multilinea: true, className })}
          {...props}
        />
        {error && (
          <p id={descripcionId} className={CLASE_ERROR}>
            {error}
          </p>
        )}
        {!error && ayuda && (
          <p id={descripcionId} className={CLASE_AYUDA}>
            {ayuda}
          </p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";
