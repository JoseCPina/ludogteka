import { urlApp } from "@/lib/negocio/host";

// En el portal de cada negocio: la app para dueños junta todas sus mascotas, de todos sus negocios, con la misma cuenta.
export function AvisoAppPortal() {
  return (
    <div className="bg-morado-suave px-4 py-2 text-center text-sm text-n-900" data-aviso-app-duenos>
      Todas tus mascotas, de todos tus negocios, en un solo lugar:{" "}
      <a href={urlApp()} className="font-semibold text-morado underline underline-offset-2">
        la app PeluDesk
      </a>
      . Entras con tu mismo número.
    </div>
  );
}
