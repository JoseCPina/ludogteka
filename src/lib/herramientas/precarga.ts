import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono } from "@/lib/telefono";
import { registrarEventoHerramienta } from "./telemetria";
import { servicioMercado } from "@/lib/mercado/catalogo";

/**
 * Al abrir la prueba gratis, lo que la persona capturó en las herramientas con ese mismo teléfono se carga en su
 * negocio (herramientas_capturas → su cuenta) y se anota el evento «cuenta» por herramienta. Corre con la secret key
 * del negocio recién creado; nunca detiene el registro: lo que falle queda en los logs y en `aplicado_detalle`.
 *
 * Qué entiende hoy:
 *  · precios-mercado: { servicio: clave canónica, talla, precio } → una tarifa en el servicio del negocio que
 *    corresponde (hotel_noche, guarderia_dia, estetica_estetico/estetica_rapado), marcada «Calculado» para que el
 *    admin la confirme en Servicios y precios.
 * Una herramienta nueva agrega su rama aquí.
 */
const SERVICIO_DEL_NEGOCIO: Record<string, string> = { noche_hotel: "hotel_noche", dia_guarderia: "guarderia_dia", bano: "estetica_estetico", bano_y_corte: "estetica_rapado" };

type Captura = { id: string; herramienta: string; datos: Record<string, unknown> };

export async function aplicarPrecarga(negocioId: string, telefono: string): Promise<{ aplicadas: number; herramientas: string[] }> {
  const salida = { aplicadas: 0, herramientas: [] as string[] };
  try {
    const tel = normalizarTelefono(telefono);
    if (!tel) return salida;
    const plataforma = createSupabaseAdminClient();
    // En el orden en que las capturó: la primera que tocó un servicio es la que queda.
    const { data } = await plataforma.from("herramientas_capturas").select("id, herramienta, datos, prospecto_id").eq("telefono_norm", tel).is("deleted_at", null).is("aplicado_at", null).order("created_at").order("id").limit(20);
    for (const c of (data ?? []) as (Captura & { prospecto_id: string | null })[]) {
      let detalle = "sin nada que precargar";
      try {
        if (c.herramienta === "precios-mercado") detalle = await precargarTarifa(negocioId, c.datos);
        if (c.herramienta === "lista-de-precios") detalle = await precargarListaDePrecios(negocioId, c.datos);
        if (c.herramienta === "contrato") detalle = await precargarContrato(negocioId, c.datos);
      } catch (e) {
        detalle = `error: ${e instanceof Error ? e.message : e}`;
        console.error("[herramientas] precarga", c.herramienta, detalle);
      }
      await plataforma.from("herramientas_capturas").update({ aplicado_negocio_id: negocioId, aplicado_at: new Date().toISOString(), aplicado_detalle: detalle.slice(0, 1000) }).eq("id", c.id);
      await registrarEventoHerramienta({ herramienta: c.herramienta, evento: "cuenta", giro: (c.datos.giro as string | null) ?? null, ciudad: (c.datos.ciudad as string | null) ?? null, prospectoId: c.prospecto_id, negocioId, sinFiltroNavegador: true });
      salida.herramientas.push(c.herramienta);
      if (!detalle.startsWith("error") && detalle !== "sin nada que precargar") salida.aplicadas++;
    }
  } catch (e) {
    console.error("[herramientas] precarga", e instanceof Error ? e.message : e);
  }
  return salida;
}

const CATEGORIA_DE_GIRO: Record<string, string> = { estetica: "estetica", hotel: "hotel", guarderia: "guarderia", veterinaria: "estetica" };
const UNIDAD_DE: Record<string, string> = { "por noche": "noche", "por día": "dia", "por hora": "hora", "por km": "km" };
const slugClave = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

/**
 * La lista de precios que armó en /lista-de-precios: cada servicio del catálogo del índice va a su servicio del negocio
 * (como precargarTarifa, con su talla); los demás («Deslanado», «Baño medicado») se crean como servicios de la
 * categoría del giro con una tarifa plana «Calculado». Veterinaria no tiene catálogo de servicios en `servicios`
 * (vive en el módulo clínico): esos quedan como servicios de estética para que no se pierdan y el admin los acomode.
 */
async function precargarListaDePrecios(negocioId: string, datos: Record<string, unknown>): Promise<string> {
  const servicios = Array.isArray(datos.servicios) ? (datos.servicios as { nombre?: string; precio?: number; canonico?: string | null; talla?: string | null; unidad?: string | null }[]) : [];
  const giro = String(datos.giro ?? "");
  const categoria = CATEGORIA_DE_GIRO[giro];
  if (!servicios.length || !categoria) return "sin servicios que precargar";
  const admin = createSupabaseAdminClient(negocioId);
  const hoy = new Date().toISOString().slice(0, 10);
  const resumen: string[] = [];
  let orden = 100;
  for (const s of servicios.slice(0, 30)) {
    const precio = Number(s.precio);
    const nombre = String(s.nombre ?? "").trim().slice(0, 80);
    if (!nombre || !Number.isFinite(precio) || precio <= 0) continue;
    if (s.canonico && SERVICIO_DEL_NEGOCIO[s.canonico]) {
      const r = await precargarTarifa(negocioId, { servicio: s.canonico, precio, talla: s.talla ?? null });
      resumen.push(`${nombre}: ${r}`);
      continue;
    }
    const clave = `lista_${slugClave(nombre)}`;
    const { data: existe } = await admin.from("servicios").select("id").eq("negocio_id", negocioId).eq("clave", clave).is("deleted_at", null).maybeSingle();
    let servicioId = existe?.id as string | undefined;
    if (!servicioId) {
      const { data: nuevo, error } = await admin
        .from("servicios")
        // Un servicio de estética lleva duración (servicios_duracion_solo_estetica): 60 min como punto de partida; los demás, ninguna.
        .insert({ negocio_id: negocioId, clave, nombre, categoria, unidad: UNIDAD_DE[s.unidad ?? ""] ?? "sesion", duracion_minutos: categoria === "estetica" ? 60 : null, depende_tamano: false, depende_pelaje: false, depende_cantidad: false, depende_grupo_raza: false, orden: orden++ })
        .select("id")
        .maybeSingle();
      if (error || !nuevo) {
        resumen.push(`${nombre}: no se pudo crear (${error?.message ?? "sin id"})`);
        continue;
      }
      servicioId = nuevo.id as string;
    }
    const { error: eT } = await admin.from("tarifas").insert({ negocio_id: negocioId, servicio_id: servicioId, precio, vigencia_desde: hoy, calculado: true, cantidad_desde: 1 });
    resumen.push(eT ? `${nombre}: tarifa no guardada (${eT.message})` : `${nombre}: $${precio} «Calculado»`);
  }
  // Lo que falló va primero: es lo que hay que leer.
  resumen.sort((a, b) => Number(/no se pudo|no guardada/.test(b)) - Number(/no se pudo|no guardada/.test(a)));
  return resumen.length ? resumen.join("; ").slice(0, 1000) : "sin precios válidos";
}

/**
 * El contrato que armó en /contrato-guarderia-hotel queda publicado como su contrato general (el de alta, sin
 * categorías, que todo negocio nuevo trae sin texto): versión 1, activa, con las variables que PeluDesk llena al
 * firmar. Si el negocio ya tenía uno publicado no se toca. Estética no se precarga: en la app no hay contratos de
 * estética (sus condiciones son solo la hoja en PDF).
 */
async function precargarContrato(negocioId: string, datos: Record<string, unknown>): Promise<string> {
  const tipo = String(datos.tipo ?? "");
  const titulo = String(datos.titulo ?? "").trim();
  const cuerpo = String(datos.cuerpo ?? "").trim();
  if (tipo === "estetica") return "condiciones de estética: solo en PDF (la app no firma contratos de estética)";
  if (!titulo || !cuerpo) return "sin contrato que precargar";
  const admin = createSupabaseAdminClient(negocioId);
  const { data: tipos } = await admin.from("tipos_contrato").select("id, categorias_servicio, orden").eq("negocio_id", negocioId).is("deleted_at", null).eq("se_genera_al", "alta").order("orden");
  const general = (tipos ?? []).find((t) => ((t.categorias_servicio as string[] | null) ?? []).length === 0);
  if (!general) return "el negocio no tiene el tipo de contrato general";
  const { data: previas } = await admin.from("plantillas_contrato").select("id, activa, version").eq("negocio_id", negocioId).eq("tipo_contrato_id", general.id).is("deleted_at", null).order("version", { ascending: false }).limit(5);
  if ((previas ?? []).some((p) => p.activa)) return "el negocio ya tenía un contrato publicado";
  const version = Number(previas?.[0]?.version ?? 0) + 1;
  const { error } = await admin.from("plantillas_contrato").insert({ negocio_id: negocioId, tipo_contrato_id: general.id, version, titulo: titulo.slice(0, 200), cuerpo, activa: true, requiere_refirma: false });
  if (error) throw new Error(error.message);
  return `contrato de ${tipo} publicado como contrato general (versión ${version})`;
}

/** El precio que escribió en el índice queda como tarifa «Calculado» del servicio equivalente del negocio. */
async function precargarTarifa(negocioId: string, datos: Record<string, unknown>): Promise<string> {
  const clave = String(datos.servicio ?? "");
  const precio = Number(datos.precio);
  const talla = typeof datos.talla === "string" ? datos.talla : null;
  const canonico = servicioMercado(clave);
  const claveNegocio = SERVICIO_DEL_NEGOCIO[clave];
  if (!canonico || !claveNegocio || !Number.isFinite(precio) || precio <= 0) return "sin precio que precargar";
  const admin = createSupabaseAdminClient(negocioId);
  const { data: servicio } = await admin.from("servicios").select("id, depende_tamano, depende_grupo_raza").eq("negocio_id", negocioId).eq("clave", claveNegocio).is("deleted_at", null).maybeSingle();
  if (!servicio) return `el negocio no tiene el servicio ${claveNegocio}`;
  const { data: existentes } = await admin.from("tarifas").select("tamano_id, calculado").eq("negocio_id", negocioId).eq("servicio_id", servicio.id).is("deleted_at", null).limit(200);
  if ((existentes ?? []).some((t) => !t.calculado)) return "el servicio ya tenía tarifas capturadas";
  const hoy = new Date().toISOString().slice(0, 10);
  const filas: Record<string, unknown>[] = [];
  if (servicio.depende_tamano) {
    // Con talla, solo esa (grande cubre gigante); sin talla, todas con el mismo precio como punto de partida.
    const TALLAS: Record<string, string[]> = { chico: ["chico"], mediano: ["mediano"], grande: ["grande", "gigante"] };
    const conTarifa = new Set((existentes ?? []).map((t) => t.tamano_id as string | null));
    const { data: tamanos } = await admin.from("tamanos_categoria").select("id, clave").is("deleted_at", null);
    for (const t of (tamanos ?? []).filter((x) => !talla || !TALLAS[talla] || TALLAS[talla].includes(x.clave as string))) {
      if (conTarifa.has(t.id as string)) continue;
      filas.push({ negocio_id: negocioId, servicio_id: servicio.id, tamano_id: t.id, precio, vigencia_desde: hoy, calculado: true, cantidad_desde: 1 });
    }
    if (!filas.length) return "esa talla ya estaba precargada";
  } else if (servicio.depende_grupo_raza) {
    // Por grupo de raza no hay talla: con una precarga basta (la primera que llegue).
    if ((existentes ?? []).length) return "ya estaba precargado";
    const { data: grupos } = await admin.from("grupos_raza").select("id").eq("negocio_id", negocioId).is("deleted_at", null);
    for (const g of grupos ?? []) filas.push({ negocio_id: negocioId, servicio_id: servicio.id, grupo_raza_id: g.id, precio, vigencia_desde: hoy, calculado: true, cantidad_desde: 1 });
  } else {
    filas.push({ negocio_id: negocioId, servicio_id: servicio.id, precio, vigencia_desde: hoy, calculado: true, cantidad_desde: 1 });
  }
  if (!filas.length) return "sin combinaciones donde poner el precio";
  const { error } = await admin.from("tarifas").insert(filas);
  if (error) throw new Error(error.message);
  return `${filas.length} tarifas «Calculado» en ${claveNegocio} con $${precio}${talla ? ` (talla ${talla})` : ""}`;
}
