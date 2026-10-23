// QA S27: «Guardar perro» redirige a esta ficha. Con este esqueleto el «Guardando…» termina en cuanto el perro quedó
// guardado y la ficha llega por streaming, en vez de esperar a que se pinte entera (igual que /clientes).
export default function CargandoPerro() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-8 w-48 animate-pulse rounded bg-n-200 motion-reduce:animate-none" />
      <div className="h-40 animate-pulse rounded-lg bg-n-200 motion-reduce:animate-none" />
      <div className="h-64 animate-pulse rounded-lg bg-n-200 motion-reduce:animate-none" />
    </div>
  );
}
