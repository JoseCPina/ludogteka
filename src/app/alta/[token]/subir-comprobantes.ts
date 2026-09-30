import { conTope } from "@/lib/ui/espera";
import { comprimirImagen } from "@/lib/imagen";
import { proponerComprobanteAlta } from "../acciones";
import type { RequisitoDePerro, TipoRequisitoAlta } from "@/lib/alta/requisitos";
import { cubierto } from "@/lib/alta/requisitos";
import type { Comprobantes } from "./comprobantes-perro";
import type { ResumenPerro } from "./resumen-requisitos";

/**
 * Sube, uno por uno y después del alta, los comprobantes que el dueño dejó
 * en el formulario, y arma el resumen de lo que quedó: lo que se mandó
 * (en revisión) y lo que sigue sin registro (no subió archivo, o la subida
 * falló). Una subida que falla no tumba el alta: ese requisito queda
 * «sin registro» y se le dice; lo vuelve a subir desde su portal.
 */
export async function subirComprobantesAlta(
  token: string,
  perros: { perroId: string; nombre: string; pendientes: (TipoRequisitoAlta | RequisitoDePerro)[]; valores: Comprobantes }[],
  avisar: (texto: string | null) => void
): Promise<ResumenPerro[]> {
  const resumen: ResumenPerro[] = [];
  for (const perro of perros) {
    const pendientes = perro.pendientes.filter((r) => !("estado" in r) || !cubierto(r));
    const enRevision: string[] = [];
    const sinRegistro: string[] = [];
    for (const tipo of pendientes) {
      const valor = perro.valores[tipo.id];
      if (!valor?.archivo) {
        sinRegistro.push(tipo.etiqueta);
        continue;
      }
      avisar(`Mandando el comprobante de ${tipo.etiqueta.toLowerCase()} de ${perro.nombre}…`);
      try {
        const esPdf = valor.archivo.type === "application/pdf";
        const archivo = esPdf
          ? valor.archivo
          : new File([await comprimirImagen(valor.archivo, 1600)], "comprobante.jpg", { type: "image/jpeg" });
        const datos = new FormData();
        datos.append("tipo_requisito_id", tipo.id);
        datos.append("fecha_aplicacion", valor.fecha);
        datos.append("archivo", archivo);
        const r = await conTope(proponerComprobanteAlta(token, perro.perroId, datos), 60_000);
        if (r.error) sinRegistro.push(tipo.etiqueta);
        else enRevision.push(tipo.etiqueta);
      } catch {
        sinRegistro.push(tipo.etiqueta);
      }
    }
    // Lo que ya estaba cubierto (vigente o en revisión de antes) no se repite.
    resumen.push({ perro_nombre: perro.nombre, en_revision: enRevision, sin_registro: sinRegistro });
  }
  avisar(null);
  return resumen;
}
