import { SelectHTMLAttributes, forwardRef, useId } from "react";
import { CLASE_AYUDA, CLASE_ERROR, CLASE_ETIQUETA, claseCampo } from "./campo-base";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  ayuda?: string;
};

export const Select = forwardRef<HTMLSelectElement, Props>(
  ({ label, error, ayuda, id, className = "", children, ...props }, ref) => {
    const idGenerado = useId();
    const selectId = id ?? idGenerado;
    const descripcionId = error
      ? `${selectId}-error`
      : ayuda
        ? `${selectId}-ayuda`
        : undefined;

    return (
      <div>
        <label htmlFor={selectId} className={CLASE_ETIQUETA}>
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={descripcionId}
          className={claseCampo({ error, className: `cursor-pointer ${className}` })}
          {...props}
        >
          {children}
        </select>
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
Select.displayName = "Select";
