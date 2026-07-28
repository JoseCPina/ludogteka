import { TextareaHTMLAttributes, forwardRef, useId } from "react";

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
        <label htmlFor={textareaId} className="mb-1.5 block text-sm font-semibold text-n-800">
          {label}
        </label>
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={descripcionId}
          className={`w-full rounded-md border-[1.5px] bg-white px-3.5 py-2.5 text-base text-n-900 focus:border-azul focus:outline-none focus:ring-[3px] focus:ring-azul-suave ${
            error ? "border-naranja-oscuro bg-naranja-suave" : "border-n-400"
          } ${className}`}
          {...props}
        />
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
Textarea.displayName = "Textarea";
