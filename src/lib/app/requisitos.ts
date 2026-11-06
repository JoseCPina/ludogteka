/**
 * El catálogo ÚNICO de lo que falta para reservar o pedir cita, dicho para cada quien. Lo usan la app, el portal, la API
 * y el panel: la base (`portal_requisitos_reserva`, `clave_de_rechazo_reserva`) solo da la clave. El contrato de alta NO es requisito: se
 * reserva y se firma después o ahí mismo (`contratos_por_firmar`), y `mensajeParaDueno`
 * traduce con este mismo catálogo cualquier rechazo que llegue como texto. Un `validar_*` nuevo se agrega aquí.
 */
export type ClaveRequisito = "evaluacion" | "sanitario" | "cupo" | "celo" | "gestante" | "alerta" | "talla" | "pelaje" | "grupo_precio" | "precio" | "fecha" | "cliente_baja" | "otro";

export type MotivoBase = { clave: ClaveRequisito | string; dato?: string | null; estado?: string | null; detalle?: string | null };
/** Sin acción en pantalla por ahora: lo que falta se resuelve con el negocio (la cartilla de la app no entra sola a su expediente). */
export type AccionRequisito = null;
export type RequisitoDueno = { clave: string; titulo: string; explicacion: string; accion: AccionRequisito };

/** «fecha» se arregla escogiendo otro día u hora; «cliente_baja», hablando con el negocio. No dejan solicitud. */
export function dejaSolicitud(clave: string): boolean {
  return clave !== "fecha" && clave !== "cliente_baja";
}

const PIDE_LUGAR = "Pide tu lugar y el negocio te contacta.";

export function requisitoParaDueno(m: MotivoBase): RequisitoDueno {
  switch (m.clave) {
    case "evaluacion":
      return { clave: m.clave, titulo: "Evaluación de comportamiento", accion: null, explicacion: "Antes de la primera estancia, el negocio hace una evaluación de comportamiento para que tu mascota conviva bien con los demás. Pide tu lugar y el negocio te contacta para agendarla." };
    case "sanitario": {
      const que = m.dato ? m.dato : "Una vacuna o desparasitación";
      const como = m.estado === "vencida" ? "está vencida" : "no está registrada";
      return { clave: m.clave, titulo: que, accion: null, explicacion: `${que} ${como} en este negocio, y la pide para cuidar a todos los que se quedan. Lleva su cartilla o el comprobante el día que vayas, o mándaselo al negocio por WhatsApp, para que lo registre en su expediente. ${PIDE_LUGAR}` };
    }
    case "cupo":
      return { clave: m.clave, titulo: "No hay lugar en esas fechas", accion: null, explicacion: `Esos días ya están llenos. ${PIDE_LUGAR.replace("te contacta", "te dice si se puede hacer espacio")}` };
    case "celo":
      return { clave: m.clave, titulo: "Está marcada en celo", accion: null, explicacion: `Mientras dure, el negocio no recibe a tu mascota con los demás. Si ya pasó, avísale. ${PIDE_LUGAR}` };
    case "gestante":
      return { clave: m.clave, titulo: "Está marcada como gestante", accion: null, explicacion: `En este estado el negocio no la recibe con los demás. Si ya no aplica, avísale. ${PIDE_LUGAR}` };
    case "alerta":
      return { clave: m.clave, titulo: "El negocio quiere revisarlo contigo", accion: null, explicacion: `Tiene una nota en su expediente que el negocio revisa antes de recibirla. ${PIDE_LUGAR}` };
    case "talla":
      return { clave: m.clave, titulo: "Falta su talla", accion: null, explicacion: `El precio depende de su talla y el negocio todavía no la tiene. ${PIDE_LUGAR}` };
    case "pelaje":
      return { clave: m.clave, titulo: "Falta su tipo de pelaje", accion: null, explicacion: `El precio depende de su pelaje y el negocio todavía no lo tiene, o ese servicio no se ofrece para su pelaje. ${PIDE_LUGAR}` };
    case "grupo_precio":
    case "precio":
      return { clave: m.clave, titulo: "Falta confirmar el precio", accion: null, explicacion: `El negocio tiene que confirmar el precio de este servicio para tu mascota. ${PIDE_LUGAR}` };
    case "fecha":
      return { clave: m.clave, titulo: "Escoge otra fecha", accion: null, explicacion: quitarRutas(m.detalle) || "Esa fecha no está disponible. Escoge otra." };
    case "cliente_baja":
      return { clave: m.clave, titulo: "Tu expediente está dado de baja", accion: null, explicacion: "Este negocio dio de baja tu expediente. Escríbele por WhatsApp para reactivarlo." };
    default:
      return { clave: "otro", titulo: "El negocio tiene que revisarlo", accion: null, explicacion: `${quitarRutas(m.detalle) || "Falta un dato en el expediente de tu mascota."} ${PIDE_LUGAR}` };
  }
}

/** Lo mismo, dicho al personal: qué revisar en la solicitud. */
export function requisitoParaPersonal(m: MotivoBase): string {
  switch (m.clave) {
    case "evaluacion": return "Sin evaluación de comportamiento";
    case "sanitario": return `${m.dato ?? "Requisito sanitario"}: ${m.estado === "vencida" ? "vencida" : "sin registro"}`;
    case "cupo": return "Sin cupo en esas fechas";
    case "celo": return "Marcada en celo (sin excepción: quita la marca si ya pasó)";
    case "gestante": return "Marcada como gestante (sin excepción: quita la marca si ya no aplica)";
    case "alerta": return "Tiene una alerta que bloquea estancias (sin excepción: revísala en su expediente)";
    case "talla": return "Falta su talla";
    case "pelaje": return "Falta su pelaje, o el servicio no aplica a su pelaje";
    case "grupo_precio": return "Su raza no tiene grupo de precio";
    case "precio": return "Falta la tarifa de este servicio";
    default: return m.detalle ?? "Otro requisito";
  }
}

function quitarRutas(texto: string | null | undefined): string {
  if (!texto) return "";
  return texto
    .trim()
    .split(/(?<=[.:;])\s+/)
    .filter((f) => !/(^|\s|\()\/[a-z]/i.test(f) && !/un admin|el permiso/i.test(f))
    .join(" ")
    .replace(/[:;,]\s*$/, ".")
    .trim();
}

/** Un rechazo que llega como texto de la base, a su clave (los mismos patrones de `clave_de_rechazo_reserva`). */
export function claveDeMensaje(texto: string): string | null {
  if (/cliente no encontrado/i.test(texto)) return "cliente_baja";
  if (/evaluaci[oó]n previa/i.test(texto)) return "evaluacion";
  if (/requisito sanitario|vigentes? de /i.test(texto)) return "sanitario";
  if (/no hay cupo/i.test(texto)) return "cupo";
  if (/en celo/i.test(texto)) return "celo";
  if (/gestante/i.test(texto)) return "gestante";
  if (/tiene activa la alerta/i.test(texto)) return "alerta";
  if (/talla registrada/i.test(texto)) return "talla";
  if (/pelaje/i.test(texto)) return "pelaje";
  if (/grupo de precio|grupo de raza/i.test(texto)) return "grupo_precio";
  return null;
}
