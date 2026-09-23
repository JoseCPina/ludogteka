// Un perro que solo viene a estética no tiene requisitos sanitarios que
// cumplir: son de guardería y hotel. En vez de los chips en rojo (que se
// leen como "le falta"), una nota neutra que dice cuándo sí se le van a
// pedir. El bloqueo al reservar guardería u hotel no cambia.
export function NotaSoloEstetica({ tamano = "grande" }: { tamano?: "grande" | "compacto" }) {
  const compacto = tamano === "compacto";
  return (
    <p
      className={`inline-flex items-center gap-1.5 rounded-full border border-n-200 bg-n-50 text-n-600 ${
        compacto ? "px-2 py-0.5 text-xs" : "px-3 py-1.5 text-sm"
      }`}
    >
      Solo estética · vacunas no requeridas
      {!compacto && <span className="text-n-500">(se piden si reserva guardería u hotel)</span>}
    </p>
  );
}
