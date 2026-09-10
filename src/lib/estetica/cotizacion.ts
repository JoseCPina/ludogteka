import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Los precios de estética, listos para enseñárselos a alguien que
 * todavía no es cliente.
 *
 * Son TRES servicios distintos, no variantes de precio del mismo: cada
 * uno incluye cosas diferentes, y esa lista es lo que hace entendible la
 * diferencia entre $190 y $390. Por eso viajan con su `incluye`.
 *
 * Lo que viaja al navegador va indexado por identificadores opacos, nunca
 * por el nombre del grupo de precio. El dueño escoge "shih tzu" y ve
 * números; que su perro comparta cajón con un cocker es cosa del negocio.
 */
export type EstadoCelda = "disponible" | "no_aplica" | "sin_tarifa";

export type CeldaPrecio = {
  estado: EstadoCelda;
  precio: number | null;
  // Precio alternativo del MISMO servicio cuando el perro llega enredado.
  // Solo el baño estético completo lo tiene, y solo en los grupos donde el
  // negocio cobra distinto por eso.
  precioPeloMaltratado: number | null;
};

export type ServicioEstetica = {
  clave: string;
  nombre: string;
  incluye: string[];
};

export type CotizacionEstetica = {
  servicios: ServicioEstetica[];
  // grupoId -> clave de servicio -> celda, para los grupos con precio
  // único sin importar el tamaño del perro.
  precios: Record<string, Record<string, CeldaPrecio>>;
  // Igual, pero para el grupo que cobra por talla: una capa más.
  preciosPorTalla: Record<string, Record<string, Record<string, CeldaPrecio>>>;
  // razaId -> grupoId. El grupo es un uuid opaco: sin su nombre, saber que
  // dos razas comparten cajón no le dice nada a nadie.
  grupoDeRaza: Record<string, string>;
  grupoPredeterminado: string;
  gruposPorTalla: string[];
  // Las razas que significan "no sé": disparan el aviso fuerte.
  razasDesconocidas: string[];
  // Lo más caro que el negocio cobra hoy, para poder decir hasta dónde
  // puede llegar un estimado incierto con un número real y no con un
  // "puede subir" que nadie sabe cuánto significa.
  topeConocido: number | null;
  // Las tallas que se le pueden ofrecer al dueño, y con qué estado.
  tallas: { id: string; etiqueta: string; estado: EstadoCelda }[];
};

const CLAVES = ["estetica_estetico", "estetica_rapado", "estetica_expres"];

export async function cargarCotizacionEstetica(
  supabase: SupabaseClient
): Promise<CotizacionEstetica | null> {
  const [{ data: servicios }, { data: grupos }, { data: razas }, { data: tamanos }] =
    await Promise.all([
      supabase
        .from("servicios")
        .select("id, clave, nombre, incluye, orden")
        .in("clave", CLAVES)
        .is("deleted_at", null)
        .order("orden"),
      supabase
        .from("grupos_raza")
        .select("id, depende_tamano, es_predeterminado")
        .is("deleted_at", null),
      supabase.from("razas").select("id, grupo_raza_id, es_desconocida").is("deleted_at", null),
      supabase
        .from("tamanos_categoria")
        .select("id, etiqueta")
        .is("deleted_at", null)
        .order("orden"),
    ]);

  if (!servicios || servicios.length === 0) return null;

  const { data: tarifas } = await supabase
    .from("tarifas_vigentes")
    .select("servicio_id, grupo_raza_id, tamano_id, precio, precio_pelo_maltratado, no_aplica")
    .in(
      "servicio_id",
      servicios.map((s) => s.id)
    );

  const grupoPredeterminado = (grupos ?? []).find((g) => g.es_predeterminado);
  if (!grupoPredeterminado) return null;

  type FilaTarifa = {
    servicio_id: string;
    grupo_raza_id: string | null;
    tamano_id: string | null;
    precio: number | null;
    precio_pelo_maltratado: number | null;
    no_aplica: boolean;
  };
  const filas = (tarifas ?? []) as unknown as FilaTarifa[];

  const celda = (t: FilaTarifa | undefined): CeldaPrecio => {
    if (!t) return { estado: "sin_tarifa", precio: null, precioPeloMaltratado: null };
    if (t.no_aplica) return { estado: "no_aplica", precio: null, precioPeloMaltratado: null };
    return {
      estado: "disponible",
      precio: Number(t.precio),
      precioPeloMaltratado:
        t.precio_pelo_maltratado === null ? null : Number(t.precio_pelo_maltratado),
    };
  };

  const precios: CotizacionEstetica["precios"] = {};
  const preciosPorTalla: CotizacionEstetica["preciosPorTalla"] = {};

  for (const grupo of grupos ?? []) {
    const suyas = filas.filter((t) => t.grupo_raza_id === grupo.id);
    if (grupo.depende_tamano) {
      preciosPorTalla[grupo.id] = {};
      for (const s of servicios) {
        const porTalla: Record<string, CeldaPrecio> = {};
        for (const talla of tamanos ?? []) {
          porTalla[talla.id] = celda(
            suyas.find((t) => t.servicio_id === s.id && t.tamano_id === talla.id)
          );
        }
        preciosPorTalla[grupo.id][s.clave as string] = porTalla;
      }
    } else {
      precios[grupo.id] = {};
      for (const s of servicios) {
        precios[grupo.id][s.clave as string] = celda(suyas.find((t) => t.servicio_id === s.id));
      }
    }
  }

  const todos = filas.filter((t) => !t.no_aplica && t.precio !== null).map((t) => Number(t.precio));

  // Qué tallas se le ofrecen al dueño, y la diferencia que importa:
  //
  //   no_aplica   -> el negocio no la ofrece. Se oculta: enseñar una
  //                  opción que va a rebotar no ayuda a nadie.
  //   sin_tarifa  -> a alguien se le olvidó capturar ese precio. NO se
  //                  oculta: si desapareciera, el dueño dejaría de poder
  //                  escoger el tamaño de su perro y nadie se enteraría
  //                  del olvido — en la matriz un hueco sale alarmante,
  //                  aquí desaparecería en silencio. Se muestra, y el
  //                  panel de admin lo reporta.
  const porTallaDefecto = preciosPorTalla[grupoPredeterminado.id]?.["estetica_estetico"] ?? {};
  const tallas = (tamanos ?? [])
    .map((t) => ({
      id: t.id as string,
      etiqueta: t.etiqueta as string,
      estado: (porTallaDefecto[t.id]?.estado ?? "sin_tarifa") as EstadoCelda,
    }))
    .filter((t) => t.estado !== "no_aplica");

  return {
    servicios: servicios.map((s) => ({
      clave: s.clave as string,
      nombre: s.nombre as string,
      incluye: (s.incluye as string[] | null) ?? [],
    })),
    precios,
    preciosPorTalla,
    grupoDeRaza: Object.fromEntries(
      (razas ?? []).map((r) => [r.id as string, r.grupo_raza_id as string])
    ),
    grupoPredeterminado: grupoPredeterminado.id as string,
    gruposPorTalla: (grupos ?? []).filter((g) => g.depende_tamano).map((g) => g.id as string),
    razasDesconocidas: (razas ?? []).filter((r) => r.es_desconocida).map((r) => r.id as string),
    topeConocido: todos.length > 0 ? Math.max(...todos) : null,
    tallas,
  };
}

/**
 * Los tres servicios ya resueltos para un perro concreto.
 *
 * `firmeza` dice qué tan confiable es el número, y es la parte que más
 * importa: un estimado que no dice cuánto puede moverse se lee como un
 * precio, y la persona llega con ese billete en la mano.
 */
export type Firmeza = "afinado" | "rango" | "incierto" | "sin_dato";

export type PrecioDeServicio = ServicioEstetica & CeldaPrecio;

export type CotizacionDePerro = {
  servicios: PrecioDeServicio[];
  firmeza: Firmeza;
};

const SIN_TARIFA: CeldaPrecio = { estado: "sin_tarifa", precio: null, precioPeloMaltratado: null };

export function cotizarPerro(
  cotizacion: CotizacionEstetica,
  razaId: string | null,
  razaEscrita: string,
  tamanoId: string
): CotizacionDePerro | null {
  if (!razaEscrita.trim()) return null;

  // Sin raza del catálogo el perro cae al grupo por defecto: lo mismo que
  // hace la vista perro_grupo_raza del lado de la base.
  const grupoId =
    (razaId ? cotizacion.grupoDeRaza[razaId] : null) ?? cotizacion.grupoPredeterminado;
  const desconocida = !razaId || cotizacion.razasDesconocidas.includes(razaId);
  const porTalla = cotizacion.gruposPorTalla.includes(grupoId);

  const servicios: PrecioDeServicio[] = cotizacion.servicios.map((s) => {
    if (!porTalla) {
      return { ...s, ...(cotizacion.precios[grupoId]?.[s.clave] ?? SIN_TARIFA) };
    }
    const mapa = cotizacion.preciosPorTalla[grupoId]?.[s.clave] ?? {};
    if (tamanoId) return { ...s, ...(mapa[tamanoId] ?? SIN_TARIFA) };

    // Sin tamaño escogido se enseña el más barato del grupo, que es
    // literalmente el "desde".
    const disponibles = Object.values(mapa)
      .filter((c) => c.estado === "disponible")
      .sort((a, b) => (a.precio ?? 0) - (b.precio ?? 0));
    if (disponibles.length > 0) return { ...s, ...disponibles[0] };
    // Si ninguna talla tiene precio, el estado que manda es el que
    // comparten: no_aplica si el negocio no lo ofrece, hueco si falta.
    const algunNoAplica = Object.values(mapa).some((c) => c.estado === "no_aplica");
    return {
      ...s,
      ...(algunNoAplica
        ? { estado: "no_aplica" as const, precio: null, precioPeloMaltratado: null }
        : SIN_TARIFA),
    };
  });

  const hayAlguno = servicios.some((s) => s.estado === "disponible");

  let firmeza: Firmeza;
  if (!hayAlguno) firmeza = "sin_dato";
  else if (desconocida) firmeza = "incierto";
  else if (porTalla && !tamanoId) firmeza = "rango";
  else firmeza = "afinado";

  return { servicios, firmeza };
}
