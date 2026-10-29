// Lo que ve quien explora la demo al subir una foto o un archivo: la foto se queda en pantalla y esto
// dice que no se guarda (src/lib/solo-lectura.ts: AVISO_FOTO_DEMO, AVISO_ARCHIVO_DEMO). No es un error.
export function AvisoDemo({ texto, className = "" }: { texto: string; className?: string }) {
  return (
    <p role="status" data-aviso-demo className={`rounded-md bg-morado-suave px-3 py-2 text-sm font-medium text-morado ${className}`}>
      {texto}
    </p>
  );
}
