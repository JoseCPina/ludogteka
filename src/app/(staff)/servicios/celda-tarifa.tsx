"use client";

export type ValorCelda = { precio: string; no_aplica: boolean };
export type EstadoBase = "disponible" | "no_aplica" | "sin_tarifa";

// Una celda en blanco es un servicio que no se puede cobrar y nadie se va
// a enterar hasta que un cliente esté esperando en el mostrador — por eso
// "sin_tarifa" nunca se ve como un espacio vacío neutro, se ve alarmante,
// hasta que se captura algo o se marca "no aplica".
export function CeldaTarifa({
  estadoBase,
  valor,
  onChange,
  disabled,
}: {
  estadoBase: EstadoBase;
  valor: ValorCelda;
  onChange: (nuevo: ValorCelda) => void;
  disabled?: boolean;
}) {
  const sinCapturarAun = estadoBase === "sin_tarifa" && !valor.no_aplica && valor.precio === "";

  let estilo = "border-n-300 bg-white";
  if (valor.no_aplica) estilo = "border-n-300 bg-n-100";
  else if (sinCapturarAun) estilo = "border-2 border-naranja-oscuro bg-naranja-suave";

  return (
    <div className={`flex flex-col gap-1 rounded-md border-[1.5px] p-2 ${estilo}`}>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        placeholder={sinCapturarAun ? "Sin capturar" : "—"}
        value={valor.no_aplica ? "" : valor.precio}
        disabled={disabled || valor.no_aplica}
        onChange={(e) => onChange({ ...valor, precio: e.target.value })}
        className={`w-full rounded border-[1.5px] px-2 py-1.5 text-sm tabular-nums focus:border-azul focus:outline-none focus:ring-[2px] focus:ring-azul-suave disabled:bg-n-100 disabled:text-n-400 ${
          sinCapturarAun ? "border-naranja-oscuro placeholder:text-naranja-oscuro placeholder:font-semibold" : "border-n-300"
        }`}
      />
      <label className="flex items-center gap-1.5 text-xs text-n-600">
        <input
          type="checkbox"
          checked={valor.no_aplica}
          disabled={disabled}
          onChange={(e) => onChange({ precio: "", no_aplica: e.target.checked })}
          className="h-3.5 w-3.5"
        />
        No aplica
      </label>
      {sinCapturarAun && (
        <span className="text-xs font-bold text-naranja-oscuro">Sin tarifa</span>
      )}
    </div>
  );
}
