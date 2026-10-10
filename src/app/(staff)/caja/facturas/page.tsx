import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioIdActual } from "@/lib/negocio/actual";
import { Alert } from "@/components/ui/alert";
import { contextoFacturar } from "@/components/cfdi/contexto";
import { PRUEBAS_AVISO } from "@/components/cfdi/textos";
import { BloqueGlobal, type PeriodoGlobal } from "./bloque-global";
import { ListaFacturas, type FilaFactura } from "./lista-facturas";

export const metadata = { title: "Facturas" };

// Las facturas (CFDI) del negocio: emitirlas se hace desde el cobro; aquí se
// ven, se descargan, se mandan, se corrigen o se cancelan, y se emite la global.
export default async function FacturasPage() {
  const sb = await createSupabaseServerClient();
  const negocioId = await negocioIdActual();
  const [ctx, { data: cancela }] = await Promise.all([contextoFacturar(sb, negocioId), sb.rpc("tiene_permiso", { p_permiso: "cancelar_facturas" })]);
  const puedeCancelar = Boolean(cancela);
  if (!ctx.puede && !puedeCancelar) {
    return (
      <Alert variante="advertencia" titulo="No tienes acceso a las facturas">
        Pídele a un admin el permiso «Facturar» o «Cancelar facturas» en Permisos.
      </Alert>
    );
  }
  const [{ data: cfg }, { data: timbres }, { data: filas }, { data: globales }] = await Promise.all([
    sb.from("cfdi_config_negocio").select("activa, modo, global_periodicidad").eq("negocio_id", negocioId).is("deleted_at", null).maybeSingle(),
    sb.rpc("cfdi_timbres_mes"),
    sb
      .from("cfdi_facturas")
      .select(
        "id, tipo, estado, serie, folio, uuid_fiscal, receptor, total, fecha_timbrado, created_at, error, cancelacion_limite, periodo_desde, periodo_hasta, enviado_whatsapp_at, enviado_correo_at, pdf_path"
      )
      .eq("negocio_id", negocioId)
      .neq("estado", "descartada")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    ctx.puede && ctx.activa ? sb.rpc("cfdi_global_periodos") : Promise.resolve({ data: [] }),
  ]);
  const t = (Array.isArray(timbres) ? timbres[0] : timbres) as { usados: number; tope: number; cerca: boolean; agotado: boolean } | null;
  const facturas: FilaFactura[] = (filas ?? []).map((f) => ({
    id: f.id as string,
    tipo: f.tipo as "ingreso" | "global",
    estado: f.estado as string,
    serie: f.serie as string | null,
    folio: f.folio as string | null,
    uuid_fiscal: f.uuid_fiscal as string | null,
    receptor: f.receptor as FilaFactura["receptor"],
    total: Number(f.total),
    fecha_timbrado: f.fecha_timbrado as string | null,
    created_at: f.created_at as string,
    error: f.error as string | null,
    cancelacion_limite: f.cancelacion_limite as string | null,
    periodo_desde: f.periodo_desde as string | null,
    periodo_hasta: f.periodo_hasta as string | null,
    enviado_whatsapp_at: f.enviado_whatsapp_at as string | null,
    enviado_correo_at: f.enviado_correo_at as string | null,
    tiene_archivos: Boolean(f.pdf_path) || ["vigente", "cancelacion_pendiente", "cancelada"].includes(f.estado as string),
  }));
  const periodos = ((globales ?? []) as PeriodoGlobal[]).map((p) => ({ ...p, total: Number(p.total) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Facturas</h1>
          {cfg?.modo !== "produccion" && <p className="mt-1 text-sm font-semibold text-ambar-oscuro">{PRUEBAS_AVISO}</p>}
        </div>
        {t && (
          <p className={`text-sm ${t.cerca ? "font-semibold text-ambar-oscuro" : "text-n-600"}`}>
            Timbres del mes: {t.usados} de {t.tope}
            {t.agotado ? " · ya no puedes facturar este mes" : t.cerca ? " · te estás acercando al tope" : ""}
          </p>
        )}
      </div>

      {!cfg?.activa && (
        <Alert variante="info" titulo="Facturación sin activar">
          Un admin captura los datos fiscales del negocio y guarda la llave del timbrado en{" "}
          <Link href="/admin/facturacion" className="font-semibold underline">
            Administración → Facturación
          </Link>
          .
        </Alert>
      )}
      {t?.cerca && !t.agotado && (
        <Alert variante="advertencia" titulo="Te estás acercando al tope de timbres">
          Al llegar al tope no se podrán emitir más facturas hasta el mes que entra. PeluDesk puede ampliarlo: escríbenos.
        </Alert>
      )}

      {ctx.puede && cfg?.activa && <BloqueGlobal periodos={periodos} periodicidad={cfg.global_periodicidad as string} />}

      <ListaFacturas facturas={facturas} catalogos={ctx.catalogos} puedeFacturar={ctx.puede} puedeCancelar={puedeCancelar} />
    </div>
  );
}
