import { Esqueleto, EsqueletoBotones, EsqueletoColumnas, EsqueletoSeccion, EsqueletoTarjetas, EsqueletoTitulo } from "@/components/ui/esqueleto";

// UX: el tablero del día con su forma (botones de arriba, adentro ahora, necesita atención, citas y entradas/salidas).
export default function CargandoRecepcion() {
  return (
    <Esqueleto etiqueta="el tablero del día">
      <EsqueletoTitulo ancho="w-56" />
      <EsqueletoBotones n={4} />
      <EsqueletoTarjetas n={4} />
      <EsqueletoSeccion filas={2} />
      <EsqueletoColumnas n={3} filas={2} />
    </Esqueleto>
  );
}
