import { formatearFechaCalendario } from "@/lib/formato";

export type EstadoRequisitoItem = {
  tipo_requisito_id: string;
  clave: string;
  etiqueta: string;
  es_critica: boolean;
  ultima_fecha_aplicacion: string | null;
  fecha_vencimiento: string | null;
  estado: "sin_registro" | "vigente" | "por_vencer" | "vencida";
};

// Orden fijo de exhibición (no lo trae la vista): coincide con el orden de
// alta del catálogo, no alfabético — así bordetella no queda perdida entre
// antirrábica y desparasitación.
const ORDEN_CLAVES = ["antirrabica", "multiple_sextuple", "bordetella", "desparasitacion_interna"];

export function ordenarEstadoRequisitos(items: EstadoRequisitoItem[]): EstadoRequisitoItem[] {
  return [...items].sort(
    (a, b) => ORDEN_CLAVES.indexOf(a.clave) - ORDEN_CLAVES.indexOf(b.clave)
  );
}

const ESTILOS_ESTADO: Record<
  EstadoRequisitoItem["estado"],
  { fondo: string; borde: string; texto: string; etiqueta: string }
> = {
  // sin_registro usa el MISMO tratamiento visual que vencida a propósito:
  // es el caso más peligroso (nadie aplicó nunca la vacuna) y no debe leerse
  // como "más tranquilo" que una vencida solo por ser un estado distinto.
  sin_registro: {
    fondo: "bg-naranja-suave",
    borde: "border-naranja",
    texto: "text-naranja-oscuro",
    etiqueta: "Sin registro",
  },
  vencida: {
    fondo: "bg-naranja-suave",
    borde: "border-naranja",
    texto: "text-naranja-oscuro",
    etiqueta: "Vencida",
  },
  por_vencer: {
    fondo: "bg-amarillo-suave",
    borde: "border-amarillo",
    texto: "text-amarillo-oscuro",
    etiqueta: "Por vencer",
  },
  vigente: {
    fondo: "bg-verde-suave",
    borde: "border-verde",
    texto: "text-verde-oscuro",
    etiqueta: "Vigente",
  },
};

export function ResumenSanitario({
  items,
  tamano = "grande",
}: {
  items: EstadoRequisitoItem[];
  tamano?: "grande" | "compacto";
}) {
  const ordenados = ordenarEstadoRequisitos(items);
  const esGrande = tamano === "grande";

  return (
    <div className="flex flex-wrap gap-2">
      {ordenados.map((item) => {
        const estilo = ESTILOS_ESTADO[item.estado];
        return (
          <div
            key={item.tipo_requisito_id}
            className={`flex items-center gap-1.5 rounded-full border-[1.5px] ${estilo.borde} ${estilo.fondo} ${
              esGrande ? "px-3 py-1.5 text-sm" : "px-2 py-1 text-xs"
            } font-bold ${estilo.texto}`}
            title={
              item.ultima_fecha_aplicacion
                ? `Última aplicación: ${formatearFechaCalendario(item.ultima_fecha_aplicacion)}`
                : "Nunca se ha registrado"
            }
          >
            {item.es_critica && (
              <span
                className="rounded-full bg-azul px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white"
                title="Vacuna crítica para este negocio: se contagia en entornos de grupo"
              >
                Crítica
              </span>
            )}
            <span>{item.etiqueta}</span>
            <span aria-hidden>·</span>
            <span>{estilo.etiqueta}</span>
            {esGrande && item.fecha_vencimiento && item.estado !== "sin_registro" && (
              <span className="font-normal opacity-80">
                ({formatearFechaCalendario(item.fecha_vencimiento)})
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
