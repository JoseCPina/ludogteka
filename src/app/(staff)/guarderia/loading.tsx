import { Esqueleto, EsqueletoBotones, EsqueletoColumnas, EsqueletoTarjetas, EsqueletoTitulo } from "@/components/ui/esqueleto";

// UX: el tablero del módulo con su forma (botones de arriba, ocupación y las columnas de llegan, se van y siguen aquí).
export default function Cargando() {
  return (
    <Esqueleto etiqueta="Guardería">
      <EsqueletoTitulo ancho="w-40" />
      <EsqueletoBotones n={4} />
      <EsqueletoTarjetas n={3} columnas="sm:grid-cols-3" alto="h-20" />
      <EsqueletoColumnas n={3} filas={3} />
    </Esqueleto>
  );
}
