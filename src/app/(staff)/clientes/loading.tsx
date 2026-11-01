import { Barra, Esqueleto, EsqueletoBotones, EsqueletoTitulo } from "@/components/ui/esqueleto";

// UX: la lista de clientes con su forma (botones, buscador y renglones de dueño con sus perros).
export default function CargandoClientes() {
  return (
    <Esqueleto etiqueta="los clientes">
      <EsqueletoTitulo ancho="w-40" />
      <EsqueletoBotones n={2} />
      <Barra className="h-12 w-full" />
      <div className="flex flex-col divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Barra className="h-10 w-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Barra className="h-4 w-1/3" />
              <Barra className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </Esqueleto>
  );
}
