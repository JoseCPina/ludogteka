import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioIdActual } from "@/lib/negocio/actual";
import { Alert } from "@/components/ui/alert";
import { PRUEBAS_AVISO, type ItemCatalogo } from "@/components/cfdi/textos";
import { estadoLlave } from "./actions";
import { ConfigFiscalForm } from "./config-form";
import { LlavePac } from "./llave-pac";
import { TablaIva, type ClaseGuardada } from "./tabla-iva";
import { Clasificacion } from "./clasificacion";

export const metadata = { title: "Facturación" };

// Facturación (CFDI 4.0): datos fiscales del negocio, la llave del PAC (el
// servicio que timbra), el IVA de cada tipo de concepto y la clasificación de
// productos y servicios. Se ve con «Editar datos fiscales» (o «Facturar», solo lectura).
export default async function FacturacionAdminPage() {
  const sb = await createSupabaseServerClient();
  const negocioId = await negocioIdActual();
  const [{ data: edita }, { data: factura }] = await Promise.all([
    sb.rpc("tiene_permiso", { p_permiso: "editar_datos_fiscales" }),
    sb.rpc("tiene_permiso", { p_permiso: "facturar" }),
  ]);
  if (!edita && !factura) {
    return (
      <Alert variante="advertencia" titulo="Sin acceso">
        Esta pantalla es de quien tiene el permiso «Editar datos fiscales».
      </Alert>
    );
  }
  const [{ data: cfg }, { data: cats }, { data: clases }, { data: insumos }, { data: fiscalInsumos }, { data: servicios }, { data: fiscalServicios }, { data: timbres }, llave] =
    await Promise.all([
      // Lista explícita: llave_secreto_id no se puede leer.
      sb
        .from("cfdi_config_negocio")
        .select("activa, modo, rfc, razon_social, regimen_fiscal, cp_expedicion, tipo_persona, serie, global_periodicidad, global_automatica, tope_timbres_mes, aviso_timbres_pct, llave_modo, llave_guardada_at")
        .eq("negocio_id", negocioId)
        .is("deleted_at", null)
        .maybeSingle(),
      sb.from("cfdi_catalogos").select("tipo, clave, descripcion, persona").eq("tipo", "regimen_fiscal").is("deleted_at", null).order("clave"),
      sb.from("cfdi_clases").select("clase, tratamiento, tasa, clave_prod_serv, clave_unidad, unidad").eq("negocio_id", negocioId).is("deleted_at", null),
      sb.from("insumos").select("id, nombre").eq("negocio_id", negocioId).eq("se_vende", true).is("deleted_at", null).order("nombre"),
      sb.from("cfdi_insumo_fiscal").select("insumo_id, de_patente, clase").eq("negocio_id", negocioId).is("deleted_at", null),
      sb.from("servicios").select("id, nombre, categoria").eq("negocio_id", negocioId).is("deleted_at", null).order("nombre"),
      sb.from("cfdi_servicio_fiscal").select("servicio_id, clase").eq("negocio_id", negocioId).is("deleted_at", null),
      sb.rpc("cfdi_timbres_mes"),
      edita ? estadoLlave() : Promise.resolve({ hay: false, modo: null, origen: null }),
    ]);
  const t = (Array.isArray(timbres) ? timbres[0] : timbres) as { usados: number; tope: number; cerca: boolean; agotado: boolean } | null;
  const puede = Boolean(edita);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin" className="text-sm font-semibold text-morado hover:underline">
          ← Administración
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Facturación</h1>
        <p className="text-n-600">Facturas (CFDI 4.0) de los cobros y la factura global al público en general.</p>
        {(cfg?.modo ?? "pruebas") !== "produccion" && <p className="mt-1 text-sm font-semibold text-ambar-oscuro">{PRUEBAS_AVISO}</p>}
      </div>

      {t && (
        <section className={`rounded-lg border p-4 ${t.cerca ? "border-ambar bg-ambar-suave" : "border-n-200 bg-white"}`}>
          <h2 className="text-lg font-bold text-n-900">Timbres de este mes</h2>
          <p className="text-n-800">
            Llevas <span className="font-bold">{t.usados}</span> de <span className="font-bold">{t.tope}</span>.
            {t.agotado
              ? " Ya no puedes emitir facturas este mes."
              : t.cerca
                ? " Te estás acercando al tope: al llegar no se podrá facturar hasta el mes que entra."
                : ""}
          </p>
          <p className="mt-1 text-sm text-n-600">El tope lo fija PeluDesk; si necesitas más, escríbenos.</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Datos fiscales del negocio</h2>
        <ConfigFiscalForm
          editable={puede}
          catalogos={(cats ?? []) as ItemCatalogo[]}
          inicial={
            cfg
              ? {
                  activa: Boolean(cfg.activa),
                  modo: cfg.modo === "produccion" ? "produccion" : "pruebas",
                  rfc: (cfg.rfc as string | null) ?? "",
                  razon_social: (cfg.razon_social as string | null) ?? "",
                  regimen_fiscal: (cfg.regimen_fiscal as string | null) ?? "",
                  cp_expedicion: (cfg.cp_expedicion as string | null) ?? "",
                  tipo_persona: (cfg.tipo_persona as "fisica" | "moral" | "sociedad_civil" | null) ?? "fisica",
                  serie: (cfg.serie as string) ?? "A",
                  global_periodicidad: cfg.global_periodicidad as "dia" | "semana" | "mes",
                  global_automatica: Boolean(cfg.global_automatica),
                }
              : null
          }
        />
      </section>

      {puede && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-n-900">Llave del servicio de timbrado</h2>
          <LlavePac hay={llave.hay} modo={llave.modo} origen={llave.origen} guardadaAt={(cfg?.llave_guardada_at as string | null) ?? null} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">IVA y claves del SAT por tipo de concepto</h2>
        <TablaIva editable={puede} tipoPersona={(cfg?.tipo_persona as string | null) ?? null} guardadas={(clases ?? []) as ClaseGuardada[]} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Productos y servicios</h2>
        <Clasificacion
          editable={puede}
          insumos={(insumos ?? []) as { id: string; nombre: string }[]}
          fiscalInsumos={(fiscalInsumos ?? []) as { insumo_id: string; de_patente: boolean; clase: "alimento_mascotas" | "otro_producto" }[]}
          servicios={(servicios ?? []) as { id: string; nombre: string; categoria: string }[]}
          fiscalServicios={(fiscalServicios ?? []) as { servicio_id: string; clase: string }[]}
        />
      </section>
    </div>
  );
}
