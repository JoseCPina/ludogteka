import { SelectHTMLAttributes, forwardRef, useId } from "react";

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
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-semibold text-n-800">
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={descripcionId}
          className={`min-h-12 w-full rounded-md border-[1.5px] bg-white px-3.5 text-base text-n-900 focus:border-azul focus:outline-none focus:ring-[3px] focus:ring-azul-suave ${
            error ? "border-naranja-oscuro bg-naranja-suave" : "border-n-400"
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        {error && (
          <p id={descripcionId} className="mt-1.5 text-sm font-semibold text-naranja-oscuro">
            {error}
          </p>
        )}
        {!error && ayuda && (
          <p id={descripcionId} className="mt-1.5 text-sm text-n-600">
            {ayuda}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";
