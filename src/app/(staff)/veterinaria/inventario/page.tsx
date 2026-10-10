import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormularioAccion } from "@/components/formulario-accion";
import { abreviar, etiquetaGrupo, etiquetaLgs } from "../comun";
import { activarLotesDeInsumo } from "../actions";

type Insumo = {
  id: string;
  nombre: string;
  grupo_senasica: string | null;
  clasificacion_lgs: string | null;
  es_antimicrobiano: boolean;
  clasificacion_por_confirmar: boolean;
  exige_folio_receta: boolean;
  unidad: { clave: string; equivalencia_en_base: number } | null;
};

const Etiqueta = ({ children, estilo }: { children: React.ReactNode; estilo: string }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estilo}`}>{children}</span>
);

function Filtro({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${activo ? "border-morado bg-morado-suave text-morado" : "border-n-200 bg-white text-n-700 hover:bg-n-50"}`}
    >
      {children}
    </Link>
  );
}

export default async function InventarioClinicoPage({ searchParams }: { searchParams: Promise<{ filtro?: string; grupo?: string }> }) {
  const { filtro, grupo } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const puedeEscribir = tienePermiso(sesion, "lotes_clinicos");

  const [{ data: crudo, error }, { data: existencias }, { data: lotes }, { data: candidatos }] = await Promise.all([
    supabase
      .from("insumos")
      .select(
        "id, nombre, grupo_senasica, clasificacion_lgs, es_antimicrobiano, clasificacion_por_confirmar, exige_folio_receta, unidad:unidades_medida!unidad_consumo_id(clave, equivalencia_en_base)"
      )
      .eq("controla_lotes", true)
      .is("deleted_at", null)
      .order("nombre"),
    supabase.from("insumos_existencia_actual").select("insumo_id, existencia_actual, stock_minimo, bajo_minimo"),
    supabase.from("insumo_lotes_saldo").select("insumo_id, saldo, estado_caducidad").gt("saldo", 0),
    puedeEscribir ? supabase.from("insumos").select("id, nombre").eq("controla_lotes", false).is("deleted_at", null).order("nombre") : Promise.resolve({ data: null }),
  ]);

  const insumos = (crudo ?? []) as unknown as Insumo[];
  const existenciaDe = new Map((existencias ?? []).map((e) => [e.insumo_id as string, e]));
  const lotesDe = new Map<string, { caducados: number; porCaducar: number }>();
  for (const l of lotes ?? []) {
    const k = l.insumo_id as string;
    const cur = lotesDe.get(k) ?? { caducados: 0, porCaducar: 0 };
    if (l.estado_caducidad === "caducado") cur.caducados++;
    if (l.estado_caducidad === "por_caducar") cur.porCaducar++;
    lotesDe.set(k, cur);
  }
  const alertaDe = (i: Insumo) => {
    const l = lotesDe.get(i.id);
    return Boolean(existenciaDe.get(i.id)?.bajo_minimo) || Boolean(l && (l.caducados > 0 || l.porCaducar > 0));
  };

  // Cada número de «Necesita atención» lleva a la lista que lo produce: los productos bajo su mínimo
  // y los lotes por caducar o caducados (con existencia).
  const bajoMinimoDe = (i: Insumo) => Boolean(existenciaDe.get(i.id)?.bajo_minimo);
  const caducidadDe = (i: Insumo) => {
    const l = lotesDe.get(i.id);
    return Boolean(l && (l.caducados > 0 || l.porCaducar > 0));
  };
  const visibles = insumos.filter((i) => {
    if (filtro === "alerta" && !alertaDe(i)) return false;
    if (filtro === "bajo_minimo" && !bajoMinimoDe(i)) return false;
    if (filtro === "caducidad" && !caducidadDe(i)) return false;
    if (grupo === "ninguno") return !i.grupo_senasica;
    if (grupo && ["I", "II", "III"].includes(grupo)) return i.grupo_senasica === grupo;
    return true;
  });
  const conAlerta = insumos.filter(alertaDe).length;
  const nBajoMinimo = insumos.filter(bajoMinimoDe).length;
  const nLotesCaducidad = [...lotesDe.values()].reduce((suma, l) => suma + l.caducados + l.porCaducar, 0);
  const href = (f?: string, g?: string) => {
    const q = new URLSearchParams();
    if (f) q.set("filtro", f);
    if (g) q.set("grupo", g);
    const s = q.toString();
    return `/veterinaria/inventario${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">
            ← Veterinaria
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-n-900">Inventario clínico</h1>
          <p className="mt-1 max-w-3xl text-n-600">Medicamentos y material clínico, por lote y con su caducidad. Se surten primero los lotes que caducan antes.</p>
        </div>
        {puedeEscribir && (
          <Link href="/veterinaria/inventario/nuevo">
            <Button type="button">Nuevo producto clínico</Button>
          </Link>
        )}
      </div>

      {!puedeEscribir && (
        <Alert variante="info" titulo="Solo lectura">
          Puedes consultar el inventario clínico. Registrar productos, entradas y salidas necesita el permiso «Administrar lotes e inventario clínico».
        </Alert>
      )}

      <div className="flex flex-wrap gap-2" aria-label="Filtros">
        <Filtro href={href(undefined, grupo)} activo={!filtro || !["alerta", "bajo_minimo", "caducidad"].includes(filtro)}>
          Todos ({insumos.length})
        </Filtro>
        <Filtro href={href("alerta", grupo)} activo={filtro === "alerta"}>
          Con alerta ({conAlerta})
        </Filtro>
        <Filtro href={href("bajo_minimo", grupo)} activo={filtro === "bajo_minimo"}>
          Bajo mínimo ({nBajoMinimo})
        </Filtro>
        <Filtro href={href("caducidad", grupo)} activo={filtro === "caducidad"}>
          Caducidad ({nLotesCaducidad} {nLotesCaducidad === 1 ? "lote" : "lotes"})
        </Filtro>
        <span className="mx-1 self-center text-n-300">|</span>
        <Filtro href={href(filtro, undefined)} activo={!grupo}>
          Cualquier grupo
        </Filtro>
        {["I", "II", "III"].map((g) => (
          <Filtro key={g} href={href(filtro, g)} activo={grupo === g}>
            Grupo {g}
          </Filtro>
        ))}
        <Filtro href={href(filtro, "ninguno")} activo={grupo === "ninguno"}>
          Sin grupo
        </Filtro>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar el inventario clínico">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : visibles.length === 0 ? (
        <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">
          {insumos.length === 0 ? "Todavía no hay productos clínicos." : "Ningún producto cumple el filtro."}
        </p>
      ) : (
        <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
          {visibles.map((i) => {
            const eq = i.unidad ? Number(i.unidad.equivalencia_en_base) : 1;
            const ex = existenciaDe.get(i.id);
            const actual = ex ? Number(ex.existencia_actual) / eq : 0;
            const minimo = ex ? Number(ex.stock_minimo) / eq : 0;
            const l = lotesDe.get(i.id);
            const grupoTxt = etiquetaGrupo(i.grupo_senasica);
            const lgsTxt = etiquetaLgs(i.clasificacion_lgs);
            return (
              <li key={i.id}>
                <Link href={`/veterinaria/inventario/${i.id}`} className="flex flex-col gap-2 px-4 py-3 hover:bg-n-50">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-n-900">{i.nombre}</span>
                    <span className="text-sm tabular-nums text-n-700">
                      {actual.toLocaleString("es-MX")} {i.unidad ? abreviar(i.unidad.clave) : ""}
                      {minimo > 0 && <span className="text-n-500"> · mínimo {minimo.toLocaleString("es-MX")}</span>}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {grupoTxt && <Etiqueta estilo="bg-morado-suave text-morado">{grupoTxt}</Etiqueta>}
                    {lgsTxt && <Etiqueta estilo="bg-morado-suave text-morado">{lgsTxt}</Etiqueta>}
                    {i.es_antimicrobiano && <Etiqueta estilo="bg-n-100 text-n-800">Antimicrobiano</Etiqueta>}
                    {i.clasificacion_por_confirmar && <Etiqueta estilo="bg-ambar-suave text-ambar-oscuro">Clasificación por confirmar</Etiqueta>}
                    {ex?.bajo_minimo && <Etiqueta estilo="bg-ambar-suave text-ambar-oscuro">Bajo mínimo</Etiqueta>}
                    {l && l.caducados > 0 && <Etiqueta estilo="bg-coral-suave text-coral-oscuro">{l.caducados === 1 ? "1 lote caducado" : `${l.caducados} lotes caducados`}</Etiqueta>}
                    {l && l.porCaducar > 0 && <Etiqueta estilo="bg-ambar-suave text-ambar-oscuro">{l.porCaducar === 1 ? "1 lote por caducar" : `${l.porCaducar} lotes por caducar`}</Etiqueta>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {puedeEscribir && (candidatos ?? []).length > 0 && (
        <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Pasar un producto existente a lotes</h2>
          <p className="text-sm text-n-600">
            Si ya lo tienes en el inventario de siempre, pásalo aquí. Su existencia de hoy queda en un lote «INICIAL» sin caducidad, y después completas sus clasificaciones en su ficha.
          </p>
          <FormularioAccion accion={activarLotesDeInsumo} textoBoton="Pasar a lotes">
            <Select label="Producto" name="insumo_id" defaultValue="" required>
              <option value="">Elige un producto</option>
              {(candidatos ?? []).map((c) => (
                <option key={c.id as string} value={c.id as string}>
                  {c.nombre as string}
                </option>
              ))}
            </Select>
          </FormularioAccion>
        </section>
      )}
    </div>
  );
}
