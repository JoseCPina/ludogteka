import { Barra, Esqueleto, EsqueletoBotones, EsqueletoColumnas, EsqueletoTitulo } from "@/components/ui/esqueleto";

// UX: la agenda de estética con su forma (botones, selector de día y columnas de citas).
export default function CargandoAgenda() {
  return (
    <Esqueleto etiqueta="la agenda de estética">
      <EsqueletoTitulo ancho="w-40" />
      <EsqueletoBotones n={2} />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <Barra key={i} className="h-11 w-20 rounded-full" />
        ))}
      </div>
      <EsqueletoColumnas n={3} filas={4} />
    </Esqueleto>
  );
}
