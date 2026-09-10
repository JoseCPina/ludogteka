import { revalidatePath } from "next/cache";
import { MODULOS_LISTA } from "@/lib/modulos";

// Helper puro, sin "use server" (un archivo "use server" solo puede
// exportar funciones async), mismo criterio que traducir-error.ts.
//
// Una estancia se crea, se cancela o hace check-in desde un módulo, pero
// afecta a los dos: la ocupación que se muestra en Guardería y en Hotel es
// la de toda la casa. Revalidar solo el módulo desde el que se actuó
// dejaría al otro mostrando un cupo viejo — que es exactamente la clase de
// número desactualizado que hace sobrevender. Son dos rutas: revalidar las
// dos siempre sale más barato que acertarle a cuál tocaba.
export function revalidarModulosEstancia() {
  for (const modulo of MODULOS_LISTA) {
    revalidatePath(modulo.base);
    revalidatePath(`${modulo.base}/checkin`);
    revalidatePath(`${modulo.base}/checkout`);
  }
  revalidatePath("/reservas");
}

export function revalidarSeriesModulos() {
  for (const modulo of MODULOS_LISTA) {
    revalidatePath(`${modulo.base}/series`);
  }
}
