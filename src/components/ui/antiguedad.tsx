import { desdeCuando, esMuyViejo } from "@/lib/antiguedad";

// La antigüedad de una fila: "Esperando desde hace 3 días". Con más de
// una semana se vuelve naranja y fuerte, para que lo viejo no se pierda
// entre lo de hoy; entre 8 y 13 días (cuando el texto todavía dice "días")
// además lo dice con palabras, para no depender solo del color.
export function Antiguedad({
  dias,
  prefijo = "Esperando",
  texto,
}: {
  dias: number;
  prefijo?: string;
  // Para frases que no son "desde…" (p. ej. "Vencida hace 10 días").
  texto?: string;
}) {
  const viejo = esMuyViejo(dias);
  const frase = texto ?? `${prefijo} ${desdeCuando(dias)}`;
  return (
    <span
      className={`w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${
        viejo ? "bg-coral-suave text-coral-oscuro" : "bg-n-100 text-n-700"
      }`}
    >
      {viejo && dias < 14 ? `${frase} · más de una semana` : frase}
    </span>
  );
}
