import { createSupabaseServerClient } from "@/lib/supabase/server";
import { zonaActual } from "@/lib/negocio/actual";
import { hoyNegocio } from "@/lib/formato";
import { cargarCatalogoExtras } from "@/lib/extras/servidor";
import { CatalogoExtras, type PaqueteExtra } from "./catalogo-extras";
import { Enlace } from "@/components/ui/enlace";

// El catálogo de servicios extra del negocio. Solo admin, o quien tenga el permiso
// «Editar catálogo de servicios extra» (el middleware lo deja entrar; la base lo vuelve
// a exigir en cada función extra_*).
export default async function CatalogoExtrasPage() {
  const supabase = await createSupabaseServerClient();
  const hoy = hoyNegocio(await zonaActual());
  const catalogo = await cargarCatalogoExtras(supabase, false);

  const idsPaquete = catalogo.map((e) => e.paquete_servicio_id).filter((x): x is string => Boolean(x));
  const paquetes: Record<string, PaqueteExtra> = {};
  if (idsPaquete.length) {
    const [{ data: servicios }, { data: tarifas }] = await Promise.all([
      supabase.from("servicios").select("id, cantidad_incluida, vigencia_dias").in("id", idsPaquete),
      supabase
        .from("tarifas")
        .select("servicio_id, precio, vigencia_desde")
        .in("servicio_id", idsPaquete)
        .is("deleted_at", null)
        .lte("vigencia_desde", hoy)
        .order("vigencia_desde", { ascending: false }),
    ]);
    for (const e of catalogo) {
      if (!e.paquete_servicio_id) continue;
      const s = (servicios ?? []).find((x) => x.id === e.paquete_servicio_id);
      const t = (tarifas ?? []).find((x) => x.servicio_id === e.paquete_servicio_id);
      if (s) paquetes[e.id] = { sesiones: Number(s.cantidad_incluida), vigenciaDias: s.vigencia_dias === null ? null : Number(s.vigencia_dias), precio: t ? Number(t.precio) : 0 };
    }
  }

  const { data: clases } = await supabase.from("cfdi_clases").select("clase, tratamiento, tasa").is("deleted_at", null);
  const iva: Record<string, string> = {};
  for (const clase of ["estetica", "hospedaje", "guarderia", "otro_servicio"]) {
    const c = (clases ?? []).find((x) => x.clase === clase);
    iva[clase] = c ? (c.tratamiento === "exento" ? "exento de IVA" : `IVA ${Math.round(Number(c.tasa) * 100)} %`) : "IVA 16 %";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Enlace href="/extras" className="text-sm">
          ← Servicios extra
        </Enlace>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Catálogo de servicios extra</h1>
        <p className="mt-1 max-w-3xl text-n-600">
          Lo que el negocio cobra aparte de la estancia: paseo, entrenamiento, traslado a domicilio, baño de salida,
          medicamento, cuidado especial nocturno y lo que tú crees. Cambiar un precio aquí no mueve lo que ya se agregó a
          una estancia.
        </p>
      </div>
      <CatalogoExtras catalogo={catalogo} paquetes={paquetes} iva={iva} />
    </div>
  );
}
