import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * El precio estimado del baño estético, listo para enseñárselo a alguien
 * que todavía no es cliente.
 *
 * Lo que viaja al navegador es un precio por RAZA, nunca el grupo. El
 * dueño escoge "shih tzu" y ve un número; que ese número lo compartan
 * varias razas no le dice a qué cajón de precio del negocio pertenece su
 * perro, y el nombre del grupo no sale de aquí.
 *
 * `esDesconocida` sí viaja, y no es un descuido: es lo que permite
 * avisarle distinto a quien contestó "no sé / mestizo". Ese perro cotiza
 * como pelo corto, y si resulta tener manto largo el precio real puede
 * ser bastante mayor. Un "desde $250" sin ese aviso es la manera de que
 * llegue esperando $250 y le cobren $450 — que es exactamente lo que un
 * precio estimado debe evitar, no provocar.
 *
 * Ojo con la distinción, que ya se equivocó una vez: "no sé" NO es lo
 * mismo que "cae en el grupo predeterminado". El grupo predeterminado es
 * el de pelo corto, donde viven el labrador y el bóxer, y un labrador
 * grande cuesta $490 con toda certeza. Confundirlas ponía el aviso de
 * "como no nos dijiste la raza" encima de una cotización correcta.
 */
export type PrecioRaza = {
  // El mínimo de lo capturado para ese perro. null = no hay tarifa: la
  // pantalla no inventa un número, dice que recepción lo cotiza.
  desde: number | null;
  // Solo cuando el precio de ese perro depende de su talla. La pantalla
  // afina el estimado en cuanto el dueño escoge tamaño.
  porTalla: Record<string, number> | null;
  // El dueño no identificó el pelo de su perro: escogió "no sé / mestizo"
  // o escribió una raza que no está en el catálogo.
  esDesconocida: boolean;
};

export type CotizacionEstetica = {
  servicioNombre: string;
  incluye: string[];
  // Lo más caro que el negocio cobra hoy por este servicio. Solo se usa
  // para el aviso de "no sé / mestizo": decirle "puede llegar a $790" con
  // el número real del cartel es más honesto —y más útil— que un "puede
  // subir" que nadie sabe cuánto significa.
  topeConocido: number | null;
  porRaza: Record<string, PrecioRaza>;
  // Para quien escribe una raza que no está en el catálogo: cotiza igual
  // que el "no sé / mestizo".
  predeterminado: PrecioRaza;
};

const CLAVE_SERVICIO = "estetica_estetico";

export async function cargarCotizacionEstetica(
  supabase: SupabaseClient
): Promise<CotizacionEstetica | null> {
  const { data: servicio } = await supabase
    .from("servicios")
    .select("id, nombre, incluye")
    .eq("clave", CLAVE_SERVICIO)
    .is("deleted_at", null)
    .maybeSingle();

  if (!servicio) return null;

  const [{ data: grupos }, { data: razas }, { data: tarifas }] = await Promise.all([
    supabase.from("grupos_raza").select("id, depende_tamano, es_predeterminado").is("deleted_at", null),
    supabase.from("razas").select("id, grupo_raza_id, es_desconocida").is("deleted_at", null),
    supabase
      .from("tarifas_vigentes")
      .select("grupo_raza_id, tamano_id, precio, no_aplica")
      .eq("servicio_id", servicio.id),
  ]);

  const precioPorGrupo = new Map<string, PrecioRaza>();
  for (const grupo of grupos ?? []) {
    const suyas = (tarifas ?? []).filter(
      (t) => t.grupo_raza_id === grupo.id && !t.no_aplica && t.precio !== null
    );

    let porTalla: Record<string, number> | null = null;
    if (grupo.depende_tamano) {
      porTalla = {};
      for (const t of suyas) {
        if (t.tamano_id) porTalla[t.tamano_id] = Number(t.precio);
      }
      if (Object.keys(porTalla).length === 0) porTalla = null;
    }

    const precios = suyas.map((t) => Number(t.precio));
    precioPorGrupo.set(grupo.id, {
      desde: precios.length > 0 ? Math.min(...precios) : null,
      porTalla,
      esDesconocida: false,
    });
  }

  const sinTarifa: PrecioRaza = { desde: null, porTalla: null, esDesconocida: false };
  const grupoDefecto = (grupos ?? []).find((g) => g.es_predeterminado);

  const porRaza: Record<string, PrecioRaza> = {};
  for (const raza of razas ?? []) {
    const base = precioPorGrupo.get(raza.grupo_raza_id) ?? sinTarifa;
    porRaza[raza.id] = { ...base, esDesconocida: Boolean(raza.es_desconocida) };
  }

  const todos = (tarifas ?? [])
    .filter((t) => !t.no_aplica && t.precio !== null)
    .map((t) => Number(t.precio));

  return {
    servicioNombre: servicio.nombre,
    incluye: (servicio.incluye as string[] | null) ?? [],
    topeConocido: todos.length > 0 ? Math.max(...todos) : null,
    porRaza,
    // Una raza escrita a mano y fuera del catálogo cotiza igual que "no
    // sé": no sabemos su pelo, y eso es lo que decide el precio.
    predeterminado: {
      ...(grupoDefecto ? (precioPorGrupo.get(grupoDefecto.id) ?? sinTarifa) : sinTarifa),
      esDesconocida: true,
    },
  };
}

/**
 * El estimado que se pinta, dado lo que el dueño lleva contestado.
 *
 * Devuelve el número y, sobre todo, qué tan firme es. Un estimado que no
 * dice cuánto puede moverse es peor que no darlo: la persona lo lee como
 * un precio y llega con ese billete en la mano.
 */
export type Estimado = {
  desde: number | null;
  // 'afinado'  — el precio de su perro, con su talla ya escogida
  // 'rango'    — depende de la talla y todavía no la sabemos
  // 'incierto' — cotiza con el grupo por defecto ("no sé"/mestizo o fuera
  //              del catálogo): puede subir bastante si tiene manto largo
  // 'sin_dato' — no hay tarifa capturada para ese perro
  firmeza: "afinado" | "rango" | "incierto" | "sin_dato";
};

export function estimadoDeRaza(
  cotizacion: CotizacionEstetica,
  razaId: string | null,
  razaEscrita: string,
  tamanoId: string
): Estimado | null {
  if (!razaEscrita.trim()) return null;

  const precio = razaId ? cotizacion.porRaza[razaId] : cotizacion.predeterminado;
  if (!precio) return null;
  if (precio.desde === null) return { desde: null, firmeza: "sin_dato" };

  if (precio.esDesconocida) {
    // Aun con talla escogida el estimado sigue siendo incierto: lo que no
    // sabemos de este perro no es su tamaño, es su pelo.
    const conTalla = precio.porTalla?.[tamanoId];
    return { desde: conTalla ?? precio.desde, firmeza: "incierto" };
  }

  if (precio.porTalla) {
    const conTalla = precio.porTalla[tamanoId];
    return conTalla !== undefined
      ? { desde: conTalla, firmeza: "afinado" }
      : { desde: precio.desde, firmeza: "rango" };
  }

  return { desde: precio.desde, firmeza: "afinado" };
}
