import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Alert } from "@/components/ui/alert";
import { cargarAreas } from "../../../inventario/comun";
import { ProductoForm } from "../producto-form";
import { LotesProducto, type LoteFila } from "./lotes-producto";
import { AVISO_FOLIO_RECETA, etiquetaGrupo, etiquetaLgs, type PrincipioActivo } from "../../comun";

type Unidad = { etiqueta: string; equivalencia_en_base: number } | null;

export default async function ProductoClinicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const puedeEscribir = tienePermiso(sesion, "lotes_clinicos");

  const [{ data: insumo }, areas, { data: principios }, { data: existencia }, { data: lotesCrudo }, { data: movs }] = await Promise.all([
    supabase
      .from("insumos")
      .select(
        "id, nombre, area_id, stock_minimo, dias_aviso_caducidad, controla_lotes, principio_activo_id, grupo_senasica, clasificacion_lgs, es_antimicrobiano, clasificacion_por_confirmar, exige_folio_receta, unidad_compra:unidades_medida!unidad_compra_id(etiqueta), unidad_consumo:unidades_medida!unidad_consumo_id(etiqueta, equivalencia_en_base)"
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    cargarAreas(supabase),
    supabase.from("principios_activos").select("id, nombre, grupo_senasica, clasificacion_lgs, es_antimicrobiano, por_confirmar, nota").is("deleted_at", null).order("nombre"),
    supabase.from("insumos_existencia_actual").select("existencia_actual, stock_minimo, bajo_minimo").eq("insumo_id", id).maybeSingle(),
    supabase.from("insumo_lotes_saldo").select("lote_id, codigo, fecha_caducidad, proveedor, saldo, estado_caducidad, created_at").eq("insumo_id", id),
    supabase.from("lotes_movimientos").select("id, lote_id, tipo, cantidad_base, motivo, folio_receta, created_at").eq("insumo_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
  ]);

  if (!insumo || !insumo.controla_lotes) notFound();

  const unidadCompra = insumo.unidad_compra as unknown as Unidad;
  const unidadConsumo = insumo.unidad_consumo as unknown as Unidad;
  const eq = unidadConsumo ? Number(unidadConsumo.equivalencia_en_base) : 1;
  const etiquetaConsumo = unidadConsumo?.etiqueta ?? "";

  // PEPS: primero el que caduca antes; los que no caducan, al final.
  const lotes: LoteFila[] = (lotesCrudo ?? [])
    .map((l) => ({
      id: l.lote_id as string,
      codigo: l.codigo as string,
      fecha_caducidad: (l.fecha_caducidad as string | null) ?? null,
      proveedor: (l.proveedor as string | null) ?? null,
      saldo: Number(l.saldo) / eq,
      estado: l.estado_caducidad as string,
      creado: l.created_at as string,
      movimientos: (movs ?? [])
        .filter((m) => m.lote_id === l.lote_id)
        .map((m) => ({
          id: m.id as string,
          tipo: m.tipo as string,
          cantidad: Number(m.cantidad_base) / eq,
          motivo: (m.motivo as string | null) ?? null,
          folio_receta: (m.folio_receta as string | null) ?? null,
          created_at: m.created_at as string,
        })),
    }))
    .sort((a, b) => {
      // Con saldo primero; luego por caducidad (sin fecha al final) y por llegada.
      if ((a.saldo > 0) !== (b.saldo > 0)) return a.saldo > 0 ? -1 : 1;
      if (a.fecha_caducidad !== b.fecha_caducidad) {
        if (!a.fecha_caducidad) return 1;
        if (!b.fecha_caducidad) return -1;
        return a.fecha_caducidad.localeCompare(b.fecha_caducidad);
      }
      return a.creado.localeCompare(b.creado);
    })
    .map((l): LoteFila => ({ id: l.id, codigo: l.codigo, fecha_caducidad: l.fecha_caducidad, proveedor: l.proveedor, saldo: l.saldo, estado: l.estado, movimientos: l.movimientos }));

  const grupoTxt = etiquetaGrupo(insumo.grupo_senasica as string | null);
  const lgsTxt = etiquetaLgs(insumo.clasificacion_lgs as string | null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/veterinaria/inventario" className="text-sm font-semibold text-morado hover:underline">
          ← Inventario clínico
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">{insumo.nombre as string}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold tabular-nums text-n-900">
            Hay {(Number(existencia?.existencia_actual ?? 0) / eq).toLocaleString("es-MX")} {etiquetaConsumo}
          </span>
          {Number(existencia?.stock_minimo ?? 0) > 0 && <span className="text-n-600">· mínimo {(Number(existencia?.stock_minimo) / eq).toLocaleString("es-MX")}</span>}
          {existencia?.bajo_minimo && <span className="rounded-full bg-ambar-suave px-2 py-0.5 text-xs font-semibold text-ambar-oscuro">Bajo mínimo</span>}
          {grupoTxt && <span className="rounded-full bg-morado-suave px-2 py-0.5 text-xs font-semibold text-morado">{grupoTxt}</span>}
          {lgsTxt && <span className="rounded-full bg-morado-suave px-2 py-0.5 text-xs font-semibold text-morado">{lgsTxt}</span>}
          {insumo.es_antimicrobiano && <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-800">Antimicrobiano</span>}
          {insumo.clasificacion_por_confirmar && <span className="rounded-full bg-ambar-suave px-2 py-0.5 text-xs font-semibold text-ambar-oscuro">Clasificación por confirmar</span>}
        </div>
      </div>

      {insumo.exige_folio_receta && (
        <Alert variante="advertencia" titulo="Producto controlado">
          {AVISO_FOLIO_RECETA}
        </Alert>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Lotes</h2>
        <LotesProducto
          insumoId={id}
          puedeEscribir={puedeEscribir}
          exigeFolio={Boolean(insumo.exige_folio_receta)}
          unidadCompra={unidadCompra?.etiqueta ?? ""}
          unidadConsumo={etiquetaConsumo}
          lotes={lotes}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Datos y clasificación</h2>
        <ProductoForm
          producto={{
            id,
            nombre: insumo.nombre as string,
            area_id: (insumo.area_id as string | null) ?? null,
            stock_minimo: Number(insumo.stock_minimo) / eq,
            dias_aviso_caducidad: (insumo.dias_aviso_caducidad as number | null) ?? null,
            principio_activo_id: (insumo.principio_activo_id as string | null) ?? null,
            grupo_senasica: (insumo.grupo_senasica as string | null) ?? null,
            clasificacion_lgs: (insumo.clasificacion_lgs as string | null) ?? null,
            es_antimicrobiano: Boolean(insumo.es_antimicrobiano),
            clasificacion_por_confirmar: Boolean(insumo.clasificacion_por_confirmar),
            unidad_compra_etiqueta: unidadCompra?.etiqueta,
            unidad_consumo_etiqueta: etiquetaConsumo,
          }}
          areas={areas.map((a) => ({ id: a.id, etiqueta: a.nombre }))}
          unidades={[]}
          principios={(principios ?? []) as PrincipioActivo[]}
          puedeEditar={puedeEscribir}
        />
      </section>
    </div>
  );
}
