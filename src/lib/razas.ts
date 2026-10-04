import type { SupabaseClient } from "@supabase/supabase-js";
import type { RazaOpcion } from "@/components/selector-raza";

/**
 * El catálogo de razas para el buscador.
 *
 * Se manda entero al navegador (unas decenas de razas, unos pocos KB) en
 * vez de buscar contra la base a cada tecla: la lista casi no cambia, y
 * el alta la llena gente desde el celular, muchas veces con la señal del
 * estacionamiento. Filtrar en el cliente es instantáneo y no depende de
 * la red.
 *
 * Recibe el cliente de Supabase porque lo llaman desde permisos
 * distintos: las pantallas del negocio con la sesión del empleado, y el
 * alta pública con la secret key, que ahí no hay nadie autenticado
 * todavía. El contenido es el mismo — es un catálogo, no datos de nadie.
 */
export async function cargarRazas(
  supabase: SupabaseClient,
  // PeluDesk: el catálogo de razas es de toda la plataforma, pero el grupo
  // de precio de cada raza es de cada negocio (razas_grupo). Se filtra a
  // mano porque el alta pública llega aquí con la secret key.
  negocioId: string,
  opciones: { conGrupo?: boolean } = {}
): Promise<RazaOpcion[]> {
  const [{ data }, { data: gruposCrudo }] = await Promise.all([
    supabase
      .from("razas")
      .select("id, nombre, alias, es_desconocida")
      .is("deleted_at", null)
      .order("nombre"),
    opciones.conGrupo
      ? supabase
          .from("razas_grupo")
          .select("raza_id, grupos_raza(nombre, depende_tamano)")
          .eq("negocio_id", negocioId)
          .is("deleted_at", null)
      : Promise.resolve({ data: null }),
  ]);

  const grupoDe = new Map(
    ((gruposCrudo ?? []) as unknown as {
      raza_id: string;
      grupos_raza: { nombre: string; depende_tamano: boolean } | null;
    }[]).map((g) => [g.raza_id, g.grupos_raza])
  );

  return ((data ?? []) as unknown as {
    id: string;
    nombre: string;
    alias: string[] | null;
    es_desconocida: boolean | null;
  }[]).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    alias: r.alias ?? [],
    es_desconocida: Boolean(r.es_desconocida),
    // El grupo solo viaja cuando quien mira es del negocio. En la
    // pantalla del cliente ni siquiera se manda: no tiene por qué saber
    // en qué cajón de precio cae su perro, y mandarlo invita a enseñarlo.
    ...(opciones.conGrupo
      ? {
          grupo_nombre: grupoDe.get(r.id)?.nombre,
          grupo_depende_tamano: grupoDe.get(r.id)?.depende_tamano ?? false,
        }
      : {}),
  }));
}

// "Bóxer" y "boxer", "shih tzu" y "shitzu": quien captura escribe como se
// dice, no como se escribe. Sin quitar acentos ni bajar a minúsculas, la
// búsqueda falla justo con las razas que más se teclean mal.
export function normalizarTextoRaza(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Qué raza del catálogo corresponde EXACTAMENTE a un texto escrito a
 * mano, o null si no hay una sola respuesta obvia.
 *
 * Deliberadamente estricto: coincidencia exacta contra el nombre o
 * alguno de los alias, nada de parecidos. Esto alimenta la sugerencia de
 * la normalización en bloque, y esa pantalla escribe el grupo del que
 * sale el precio del baño. Una coincidencia laxa convertiría "pastor" en
 * "pastor alemán" a ciegas y cambiaría cuánto se le cobra a ese perro
 * sin que nadie lo haya decidido. Lo que no es obvio lo contesta una
 * persona.
 */
export function sugerirRaza(razas: RazaOpcion[], texto: string): RazaOpcion | null {
  const q = normalizarTextoRaza(texto);
  if (!q) return null;

  const coincidencias = razas.filter((raza) =>
    [raza.nombre, ...raza.alias].some((candidato) => normalizarTextoRaza(candidato) === q)
  );
  return coincidencias.length === 1 ? coincidencias[0] : null;
}

/**
 * Cuántos perros vivos todavía no tienen raza del catálogo.
 *
 * Es el número que hace visible el problema: mientras un perro no tenga
 * `raza_id`, su baño se cotiza con el grupo predeterminado (pelo corto,
 * el más barato). No es un dato faltante cualquiera — es dinero mal
 * cobrado en cada cita, sin que nadie se entere.
 */
export async function contarPerrosSinRazaCatalogo(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from("perros")
    .select("id", { count: "exact", head: true })
    .is("raza_id", null)
    .is("deleted_at", null)
    .eq("fallecido", false);
  return count ?? 0;
}

const PALABRAS_VACIAS = new Set(["perro", "perra", "perros", "perras", "raza", "razas", "de", "del", "la", "el", "los", "las", "un", "una", "mi"]);

/**
 * El texto de una raza en su forma comparable: minúsculas, sin acentos ni
 * signos ni espacios dobles, sin palabras vacías («perro», «raza») y en
 * singular. Es la gemela EXACTA de `public.normalizar_raza()` de la base (la
 * que agrupa los perros fuera del catálogo): un cambio aquí se hace allá y la
 * auditoría `razas-dev.mjs` compara las dos con los mismos textos.
 */
export function normalizarRaza(texto: string): string {
  const base = (texto ?? "")
    .toLowerCase()
    .replace(/[áàäâã]/g, "a")
    .replace(/[éèëê]/g, "e")
    .replace(/[íìïî]/g, "i")
    .replace(/[óòöôõ]/g, "o")
    .replace(/[úùüû]/g, "u")
    .replace(/ñ/g, "n")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const salida: string[] = [];
  for (let w of base.split(/ +/)) {
    if (!w || PALABRAS_VACIAS.has(w)) continue;
    if (w.length > 5 && /(ores|eres|eses|anes)$/.test(w)) w = w.slice(0, -2);
    else if (w.length > 3 && /[^s]s$/.test(w)) w = w.slice(0, -1);
    salida.push(w);
  }
  return salida.join(" ");
}

/**
 * Parecido entre dos textos de raza, 0 a 1: la misma cuenta que
 * `extensions.similarity()` (pg_trgm) de la base, que es lo que usa
 * /perros/razas para sugerir. Cada palabra se rodea de espacios, se parte en
 * trigramas y se compara la intersección contra la unión.
 */
export function similitudRaza(a: string, b: string): number {
  const trigramas = (t: string) => {
    const s = new Set<string>();
    for (const palabra of normalizarRaza(t).split(" ")) {
      if (!palabra) continue;
      const p = `  ${palabra} `;
      for (let i = 0; i + 3 <= p.length; i += 1) s.add(p.slice(i, i + 3));
    }
    return s;
  };
  const A = trigramas(a);
  const B = trigramas(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const x of A) if (B.has(x)) comunes += 1;
  return comunes / (A.size + B.size - comunes);
}

export const UMBRAL_PARECIDO = 0.4;

export type SugerenciaRaza = { raza: RazaOpcion; parecido: boolean };

/**
 * Lo que se le enseña a quien escribe en «Raza»: primero las que empiezan
 * con lo tecleado, luego las que lo contienen (por nombre o por cualquiera de
 * sus otros nombres, ya normalizados como los normaliza la base), y al final
 * las que solo se PARECEN (trigramas ≥ 0.4), marcadas como tales.
 */
export function buscarRazasCatalogo(razas: RazaOpcion[], consulta: string, maximo = 8): SugerenciaRaza[] {
  const q = normalizarRaza(consulta);
  if (!q) return razas.slice(0, maximo).map((raza) => ({ raza, parecido: false }));
  const empiezan: RazaOpcion[] = [];
  const contienen: RazaOpcion[] = [];
  const parecidas: { raza: RazaOpcion; puntaje: number }[] = [];
  for (const raza of razas) {
    const candidatos = [raza.nombre, ...raza.alias].map(normalizarRaza).filter(Boolean);
    if (candidatos.some((c) => c.startsWith(q))) empiezan.push(raza);
    else if (candidatos.some((c) => c.includes(q))) contienen.push(raza);
    else if (q.length >= 3) {
      const puntaje = Math.max(...candidatos.map((c) => similitudRaza(c, q)));
      if (puntaje >= UMBRAL_PARECIDO) parecidas.push({ raza, puntaje });
    }
  }
  parecidas.sort((x, y) => y.puntaje - x.puntaje);
  return [
    ...empiezan.map((raza) => ({ raza, parecido: false })),
    ...contienen.map((raza) => ({ raza, parecido: false })),
    ...parecidas.map((x) => ({ raza: x.raza, parecido: true })),
  ].slice(0, maximo);
}

/** La raza del catálogo cuyo nombre u otro nombre es EXACTAMENTE ese texto (ya normalizado), o null. */
export function razaExacta(razas: RazaOpcion[], texto: string): RazaOpcion | null {
  const q = normalizarRaza(texto);
  if (!q) return null;
  const hay = razas.filter((r) => [r.nombre, ...r.alias].some((c) => normalizarRaza(c) === q));
  return hay.length === 1 ? hay[0] : null;
}
