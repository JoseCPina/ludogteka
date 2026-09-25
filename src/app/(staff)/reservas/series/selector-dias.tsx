import { DIAS_SEMANA } from "./dias-semana";

// Botones de días de la semana de una serie. Los días en que el servicio
// no se puede dar (guardería en día cerrado) se ven deshabilitados con la
// razón, en vez de esconderse: así se entiende por qué no está.
export function SelectorDias({
  dias,
  onAlternar,
  diasCerrados,
}: {
  dias: number[];
  onAlternar: (dia: number) => void;
  diasCerrados: number[];
}) {
  const cerradosElegidos = DIAS_SEMANA.filter((d) => diasCerrados.includes(d.valor));
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-n-800">Días de la semana</p>
      <div className="flex flex-wrap gap-2">
        {DIAS_SEMANA.map((d) => {
          // Un día cerrado que ya venía elegido (una serie vieja) se puede
          // quitar; lo que no se puede es elegirlo.
          const cerrado = diasCerrados.includes(d.valor) && !dias.includes(d.valor);
          return (
            <button
              key={d.valor}
              type="button"
              onClick={() => onAlternar(d.valor)}
              disabled={cerrado}
              title={diasCerrados.includes(d.valor) ? `Guardería no abre en ${d.larga.toLowerCase()}` : undefined}
              className={`rounded-full border-[1.5px] px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:border-n-100 disabled:bg-n-100 disabled:text-n-500 disabled:line-through ${
                dias.includes(d.valor)
                  ? "border-morado bg-morado-suave text-morado"
                  : "border-n-200 bg-white text-n-600 hover:border-n-300"
              }`}
            >
              {d.corta}
            </button>
          );
        })}
      </div>
      {cerradosElegidos.length > 0 && (
        <p className="mt-1.5 text-sm text-n-600">
          Guardería no abre en {cerradosElegidos.map((d) => d.larga.toLowerCase()).join(" ni ")}.
        </p>
      )}
    </div>
  );
}
