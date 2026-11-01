/**
 * Negocio en solo lectura por prueba vencida o falta de pago (QA N151, 30 de octubre de 2026): UNA sola regla de qué
 * se bloquea en pantalla, para que nadie llene un formulario para enterarse al final de que no se guarda. La base
 * sigue siendo la que impide escribir (negocio_escribible(), políticas `<tabla>_escritura_*`); esto lo dice antes.
 *
 * - El servidor decide si hay bloqueo (`bloqueoDeEscritura()`, src/lib/cobro/bloqueo-escritura-servidor.ts) y el
 *   layout del personal lo pasa a `<ProveedorEscritura>` (src/components/escritura-contexto.tsx).
 * - En pantalla, `esControlDeEscritura()` decide qué botón, enlace o campo escribe; el proveedor lo muestra
 *   deshabilitado (`aria-disabled`, campos de solo lectura) y al tocarlo enseña el aviso con el texto de la franja.
 * - Lo que lee (buscar, filtrar, exportar, imprimir) o lo que hace falta para salir del bloqueo (contratar, pagar)
 *   va dentro de `data-sin-bloqueo` (en un `<Button>`, la prop `sinBloqueo`).
 *
 * El demo NO usa esto: es un escaparate que se recorre con los formularios abiertos y dice «En la demo no se guardan
 * cambios» al guardar (MENSAJE_DEMO).
 */
import { rutaDeHref } from "@/lib/auth/acceso";

export type MotivoBloqueo = "prueba_vencida" | "solo_lectura" | "cancelado";

export type BloqueoEscritura = {
  motivo: MotivoBloqueo;
  // El texto de la franja y del aviso al tocar un botón bloqueado.
  mensaje: string;
  // Solo para el admin: el botón para salir del bloqueo.
  boton: { texto: string; href: string } | null;
};

export const ESTADOS_CON_BLOQUEO: readonly string[] = ["prueba_vencida", "solo_lectura", "cancelado"];

export function textoBloqueo(motivo: MotivoBloqueo, esAdmin: boolean): BloqueoEscritura {
  if (esAdmin) {
    const [mensaje, boton] =
      motivo === "prueba_vencida"
        ? ["Tu prueba terminó: tus datos están a salvo. Contrata para seguir capturando.", "Contratar"]
        : motivo === "cancelado"
          ? ["Tu suscripción terminó: tus datos están a salvo. Contrata para seguir capturando.", "Contratar"]
          : ["No se pudo cobrar tu suscripción: tus datos están a salvo. Paga para seguir capturando.", "Pagar ahora"];
    return { motivo, mensaje, boton: { texto: boton, href: "/admin/modulos" } };
  }
  const mensaje =
    motivo === "prueba_vencida"
      ? "La prueba del negocio terminó. Pídele al dueño que contrate para seguir capturando."
      : motivo === "cancelado"
        ? "La suscripción del negocio terminó. Pídele al dueño que contrate para seguir capturando."
        : "No se pudo cobrar la suscripción del negocio. Pídele al dueño que pague para seguir capturando.";
  return { motivo, mensaje, boton: null };
}

/** Páginas que solo sirven para capturar algo (alta, check-in, cobro, venta…): un enlace a ellas es de escritura. */
const RUTA_DE_CAPTURA = /\/(nuevo|nueva|checkin|checkout|walkin|cobrar|cobrar-junto|cargo|venta|ajustes-servicio)$|^\/caja\/pases$|^\/admin\/importar(\/|$)|^\/bienvenida\/./;

// La ayuda (artículos, asistente y tickets de soporte) queda abierta: la base deja escribir un ticket aunque el negocio
// esté en solo lectura, y es por donde se pide ayuda justamente entonces.
const RUTA_LIBRE = /^\/ayuda(\/|$)/;

export function esRutaDeCaptura(ruta: string | null | undefined): boolean {
  return Boolean(ruta && RUTA_DE_CAPTURA.test(ruta) && !RUTA_LIBRE.test(ruta));
}

// Lo que dice un botón que escribe o que abre dónde escribir. «Cancelar», «Cerrar», «Ver», «Anterior»… no.
const VERBO_DE_ESCRITURA =
  /^\s*\+?\s*(nuev[oa]s?|agregar|añadir|crear|registrar|agendar|reservar|cobrar|check-?\s?in|check-?\s?out|hacer check|firmar|subir|tomar foto|editar|guardar|capturar|vender|aplicar|confirmar|eliminar|borrar|quitar|anular|dar de (alta|baja)|abrir turno|cerrar turno|enviar|mandar|avisar|marcar|iniciar|finalizar|terminar|empezar|devolver|reembolsar|importar|invitar|asignar|corregir|cambiar (?!de negocio)|ajustar|ajuste|recibir|entregar|mover|descartar|reagendar|pausar|reanudar|reactivar|deshacer|generar|timbrar|emitir|designar|vincular|desvincular|reasignar|prender|apagar|conectar|desconectar|cancelar\s+(?!y\b)\S|repartir|pedir|solicitar|configurar|rechazar|aprobar|autorizar|revisad[oa]|es (una|esta) raza|surtir|reprogramar|no (se presentó|llegó|vino|se aplicó)|suspender|poner|pasar a|recargo|cerrar (la |esta )?(cuenta|consulta|estancia|cita))/i;
const SALIR_DE_FORMULARIO = /^\s*(cancelar|cerrar|volver|regresar|ocultar|ver|mostrar|atrás|anterior|siguiente)\b/i;

const textoDe = (el: Element) =>
  ((el as HTMLElement).innerText || (el as HTMLInputElement).value || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();

const SELECTOR_CAMPO = "input:not([type=hidden]):not([type=search]), textarea, select";
// Hasta dónde se busca, desde el botón que guarda, el bloque con sus campos (QA S53, N155: «Guardar la nueva hora» →
// su fila de botones → la caja de «Reprogramar» con «Nueva fecha y hora» y «Motivo»).
const NIVELES_DE_BLOQUE = 3;

/**
 * El bloque de un botón que guarda sin `<form>` ni `<AccionesFormulario>` (QA S53, N155): el formulario de reprogramar,
 * el de cancelar con motivo, el de «no se presentó», el de eliminar… son una caja con sus campos y sus botones. Es el
 * ancestro más cercano (hasta 3 niveles) que tiene algún campo; nunca la página entera ni un filtro.
 */
export function bloqueDeBoton(boton: Element): Element | null {
  let el: Element | null = boton.parentElement;
  for (let i = 0; i < NIVELES_DE_BLOQUE && el; i++, el = el.parentElement) {
    if (el.tagName === "MAIN" || el.tagName === "BODY" || el.tagName === "FORM" || el.getAttribute("role") === "search") return null;
    if (el.querySelector(SELECTOR_CAMPO)) return el;
  }
  return null;
}

/** ¿Este botón guarda? (lo dice su texto, o `Button cargando` lo marca con `data-escritura`). */
function esBotonQueGuarda(el: Element): boolean {
  if (el.closest("[data-sin-bloqueo]")) return false;
  return el.hasAttribute("data-escritura") || VERBO_DE_ESCRITURA.test(textoDe(el));
}

/**
 * Los formularios de la pantalla: lo que rodea a cada `<AccionesFormulario>` que tiene un botón que guarda (la app
 * no siempre usa `<form>`: muchos guardan con un botón y `useEspera`), y el bloque de cada botón que guarda suelto
 * (QA S53, N155: así quedaban libres los campos y «Dejarla como estaba» de la reprogramación con la prueba vencida,
 * porque la primera corrección solo miraba `<form>`, las páginas de captura y `<AccionesFormulario>`).
 */
export function alcancesDeFormulario(raiz: ParentNode): Element[] {
  const alcances: Element[] = [];
  for (const af of raiz.querySelectorAll("[data-acciones-formulario]")) {
    if (af.querySelector("[data-escritura], button:not([type=button])") && af.parentElement) alcances.push(af.parentElement);
  }
  for (const b of raiz.querySelectorAll("button, [role=button]")) {
    if (b.closest("form, [data-acciones-formulario]") || !esBotonQueGuarda(b)) continue;
    const bloque = bloqueDeBoton(b);
    if (bloque && !alcances.includes(bloque)) {
      alcances.push(bloque);
      BLOQUES_SUELTOS.add(bloque);
    }
  }
  return alcances;
}

// Los bloques de un botón suelto (no los de `<AccionesFormulario>`): ahí se deshabilita TODO, también «Dejarla como
// estaba» o «No», porque el bloque entero es el formulario.
const BLOQUES_SUELTOS = new WeakSet<Element>();

/**
 * ¿Este elemento escribe (o lleva a escribir)? `ruta` es la página que se está viendo: en una página de captura, todo
 * campo y botón es de escritura salvo lo marcado `data-sin-bloqueo`.
 */
export function esControlDeEscritura(el: Element, ruta: string, alcances: readonly Element[]): boolean {
  if (el.closest("[data-sin-bloqueo]") || RUTA_LIBRE.test(ruta)) return false;
  const tag = el.tagName;
  if (tag === "A") {
    const href = el.getAttribute("href") ?? "";
    const ruta = rutaDeHref(href);
    // Un enlace a otro sitio (WhatsApp, un PDF) o a la ayuda no escribe aquí; uno a una sección de esta misma
    // página («Registrar evaluación» → #requisitos) sí cuenta por lo que dice.
    if ((ruta === null && !href.startsWith("#")) || (ruta && RUTA_LIBRE.test(ruta))) return false;
    return esRutaDeCaptura(ruta) || VERBO_DE_ESCRITURA.test(textoDe(el));
  }
  if (tag === "INPUT" && (el as HTMLInputElement).type === "hidden") return false;
  if (tag === "INPUT" && (el as HTMLInputElement).type === "file") return true;
  if (el.hasAttribute("data-escritura")) return true;
  const esBoton = tag === "BUTTON" || el.getAttribute("role") === "button" || (tag === "INPUT" && /^(submit|button)$/.test((el as HTMLInputElement).type));
  const texto = esBoton ? textoDe(el) : "";
  if (esBoton && VERBO_DE_ESCRITURA.test(texto)) return true;
  // Salir de un formulario o moverse por él siempre se puede. «Cancelar» a secas solo es salir dentro de un
  // formulario; suelto, junto a un registro (un servicio extra, una cuenta), cancela ESE registro (QA N152).
  if (esBoton && (el as HTMLButtonElement).type === "button" && SALIR_DE_FORMULARIO.test(texto)) {
    // Dentro de un bloque SUELTO (N155) no cuenta como salir: ese bloque se bloquea entero, y puede ser la lista de un
    // tablero donde «Cancelar» abre el formulario para cancelar el registro (los servicios extra de Recepción).
    if (!/^\s*cancelar\b/i.test(texto) || el.closest("form, [data-acciones-formulario]") || alcances.some((a) => !BLOQUES_SUELTOS.has(a) && a.contains(el))) return false;
    return true;
  }
  // QA S53 (N155): en el bloque de un botón que guarda (reprogramar, cancelar con motivo, «no se presentó»…) se
  // deshabilita el formulario ENTERO: sus campos y sus otros botones («Dejarla como estaba», «No»), no solo el que guarda.
  // Lo que está dentro de un filtro (formulario GET o `role=search`) nunca es parte de ese bloque: buscar y filtrar
  // siguen aunque el bloque de un botón que guarda abarque la sección entera (el periodo de asistencia del empleado).
  const enFiltro = Boolean(el.closest("[role=search]")) || (el.closest("form")?.getAttribute("method") ?? "").toLowerCase() === "get";
  if (esBoton && !enFiltro && alcances.some((a) => BLOQUES_SUELTOS.has(a) && a.contains(el))) return true;
  // QA N152: un select, una casilla o un interruptor guardan al cambiar (el estilista de la cita, un permiso, un
  // recordatorio prendido): cuentan siempre, salvo en un filtro (formulario GET o `role=search`) o marcados
  // `data-sin-bloqueo`.
  const esSelector = tag === "SELECT" || (tag === "INPUT" && /^(checkbox|radio)$/.test((el as HTMLInputElement).type)) || /^(switch|checkbox|radio)$/.test(el.getAttribute("role") ?? "");
  const esCampo = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || esSelector;
  if (!esBoton && !esCampo) return false;
  if (esCampo && tag === "INPUT" && (el as HTMLInputElement).type === "search") return false;
  const form = el.closest("form");
  const filtro = Boolean(el.closest("[role=search]")) || (form !== null && (form.getAttribute("method") ?? "").toLowerCase() === "get");
  if (esSelector) return !filtro;
  if (form) return !filtro;
  if (esRutaDeCaptura(ruta)) return true;
  return esCampo && alcances.some((a) => a.contains(el));
}
