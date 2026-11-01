import { Barra, Esqueleto, EsqueletoSeccion, EsqueletoTitulo } from "@/components/ui/esqueleto";

// UX: Caja con su forma (turno, «¿A quién le cobras?» y las cuentas por cobrar).
export default function CargandoCaja() {
  return (
    <Esqueleto etiqueta="la caja">
      <EsqueletoTitulo ancho="w-32" />
      <Barra className="h-20 w-full rounded-lg" />
      <div className="flex flex-col gap-3">
        <Barra className="h-6 w-48" />
        <Barra className="h-12 w-full" />
      </div>
      <EsqueletoSeccion filas={5} alto="h-16" />
    </Esqueleto>
  );
}
