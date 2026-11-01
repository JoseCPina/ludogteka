import { Barra, Esqueleto, EsqueletoTabla, EsqueletoTarjetas, EsqueletoTitulo } from "@/components/ui/esqueleto";

// UX: Reportes con su forma (periodo, cifras y tablas de desglose).
export default function CargandoReportes() {
  return (
    <Esqueleto etiqueta="los reportes">
      <EsqueletoTitulo ancho="w-40" />
      <div className="flex flex-wrap items-end gap-3">
        <Barra className="h-12 w-44" />
        <Barra className="h-12 w-44" />
        <Barra className="h-12 w-28" />
      </div>
      <EsqueletoTarjetas n={4} />
      <EsqueletoTabla filas={5} />
      <EsqueletoTabla filas={4} />
    </Esqueleto>
  );
}
