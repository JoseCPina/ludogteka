export type AlertaActivaItem = { id: string; etiqueta: string };
export type AlergiaGraveItem = { id: string; alergeno: string };

// Se muestra entero, sin acordeón ni "ver más": si recepción tiene que
// dar clic para enterarse de que un perro muerde, el diseño falló. Por
// eso este componente nunca colapsa nada — o no renderiza nada (perro sin
// alertas activas ni alergias graves), o muestra todo de inmediato.
export function AlertaCriticaBanner({
  alertas,
  alergiasGraves,
  tamano = "grande",
}: {
  alertas: AlertaActivaItem[];
  alergiasGraves: AlergiaGraveItem[];
  tamano?: "grande" | "compacto";
}) {
  if (alertas.length === 0 && alergiasGraves.length === 0) return null;

  const esGrande = tamano === "grande";

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border-2 border-naranja-oscuro bg-naranja-suave ${
        esGrande ? "p-4" : "p-2.5"
      }`}
      role="alert"
    >
      <p
        className={`font-extrabold uppercase tracking-wide text-naranja-oscuro ${
          esGrande ? "text-sm" : "text-xs"
        }`}
      >
        ⚠ Atención al manejo
      </p>
      <div className="flex flex-wrap gap-2">
        {alertas.map((a) => (
          <span
            key={a.id}
            className={`rounded-full bg-naranja-oscuro font-bold text-white ${
              esGrande ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"
            }`}
          >
            {a.etiqueta}
          </span>
        ))}
        {alergiasGraves.map((al) => (
          <span
            key={al.id}
            className={`rounded-full bg-naranja-oscuro font-bold text-white ${
              esGrande ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"
            }`}
          >
            Alergia grave: {al.alergeno}
          </span>
        ))}
      </div>
    </div>
  );
}
