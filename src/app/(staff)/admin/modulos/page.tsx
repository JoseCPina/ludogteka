import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { formatearFecha } from "@/lib/formato";
import { Alert } from "@/components/ui/alert";
import { ListaModulos, type FilaModulo } from "./lista-modulos";
import { Suscripcion } from "./suscripcion";
import type { MiCobro, PlanOferta } from "@/lib/cobro/tipos";
import { negocioActual, urlDelNegocio } from "@/lib/negocio/actual";
import { AVISO_FACTURA, datosFacturacionDeNegocio } from "@/lib/cobro/facturacion";
import { DatosFacturacion } from "./datos-facturacion";
import { Sucursales, type GrupoSucursales } from "./sucursales";

// Los módulos del negocio: los de su plan se prenden y se apagan aquí; los
// de otros planes se ven bloqueados con el plan que los incluye. Apagar
// nunca borra: lo capturado se queda y reaparece al prender.
export default async function ModulosPage({ searchParams }: { searchParams: Promise<{ apagado?: string; pago?: string }> }) {
  const sesion = await obtenerSesionConRol();
  // Admin, o recepción con «Administrar módulos» (que no ve el cobro del plan).
  if (!tienePermiso(sesion, "administrar_modulos")) redirect("/admin");
  const esAdmin = sesion?.rol === "admin";
  const { apagado, pago } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const actual = await negocioActual();
  const zona = actual.zona_horaria;
  const [{ data: filas }, { data: negocio }, { data: cobro }, { data: ofertas }, { data: grupo }, { data: catalogos }] = await Promise.all([
    supabase.rpc("mis_modulos"),
    supabase.from("negocios").select("plan, plan_id, prueba_termina_at, planes(nombre)").maybeSingle(),
    esAdmin ? supabase.rpc("mi_cobro") : Promise.resolve({ data: null }),
    supabase
      .from("planes")
      .select("id, clave, nombre, descripcion, tipo, precio_mensual, modulos")
      .eq("activo", true)
      .is("deleted_at", null)
      .order("orden"),
    esAdmin ? supabase.rpc("mis_sucursales") : Promise.resolve({ data: null }),
    esAdmin
      ? supabase.from("cfdi_catalogos").select("tipo, clave, descripcion").in("tipo", ["regimen_fiscal", "uso_cfdi"]).is("deleted_at", null).order("clave")
      : Promise.resolve({ data: null }),
  ]);
  const miCobro = cobro as MiCobro | null;
  const planes = ((ofertas ?? []) as PlanOferta[]).map((p) => ({ ...p, precio_mensual: Number(p.precio_mensual) }));
  const planSucursal = planes.find((p) => p.tipo === "sucursal") ?? null;
  const grupoSucursales = grupo as GrupoSucursales | null;
  const sucursalesAdicionales = grupoSucursales?.negocios.filter((n) => !n.es_principal && n.activo).length ?? 0;
  // La que paga captura los datos de facturación (una sucursal no tiene suscripción propia).
  const conFacturacion = Boolean(miCobro && !miCobro.exento && !miCobro.sucursal_de);
  const datosFactura = conFacturacion ? await datosFacturacionDeNegocio(actual.id) : null;
  const cat = (catalogos ?? []) as { tipo: string; clave: string; descripcion: string }[];
  const dominio = new URL(urlDelNegocio({ slug: "x", dominio: null, url_publica: null })).host.replace(/^x\./, "");
  const modulos = (filas ?? []) as FilaModulo[];
  const plan = (Array.isArray(negocio?.planes) ? negocio?.planes[0] : negocio?.planes) as { nombre: string } | null | undefined;
  const enPrueba = negocio?.plan === "prueba";
  const nombreApagado = modulos.find((m) => m.clave === apagado)?.nombre;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">Módulos y plan</h1>
        <p className="mt-1 text-n-700">
          {enPrueba ? (
            <>
              Estás en la prueba gratis
              {negocio?.prueba_termina_at ? ` (hasta el ${formatearFecha(negocio.prueba_termina_at as string, zona)})` : ""}: tienes todos
              los módulos para que los conozcas. Después es un solo plan,{" "}
              <strong>{plan?.nombre ?? "PeluDesk"}</strong>: $649 al mes + IVA, sin costo inicial.
            </>
          ) : (
            <>
              Tu plan: <strong>{plan?.nombre ?? "sin plan"}</strong>. Prende solo lo que usas: lo apagado se esconde del menú, del
              tablero y del portal, pero nada se borra.
            </>
          )}{" "}
          Caja y clientes siempre están.
        </p>
      </header>
      {pago === "ok" && (
        <Alert variante="exito" titulo="¡Gracias! Tu suscripción quedó registrada">
          Stripe te manda el recibo por correo. Aquí abajo ves tu plan y la fecha del próximo cobro.
        </Alert>
      )}
      {pago === "cancelado" && (
        <Alert variante="info" titulo="No se hizo ningún cobro">
          Saliste de la página de pago antes de terminar. Puedes contratar cuando quieras.
        </Alert>
      )}
      {miCobro && !miCobro.sucursal_de && (
        <Suscripcion
          cobro={miCobro}
          planes={planes}
          sucursales={planSucursal && sucursalesAdicionales > 0 ? { cantidad: sucursalesAdicionales, precioMensual: planSucursal.precio_mensual } : null}
          nombresModulos={Object.fromEntries(modulos.map((m) => [m.clave, m.nombre]))}
          planSugerido={(negocio?.plan_id as string | null) ?? null}
        />
      )}
      {conFacturacion && (
        <DatosFacturacion
          inicial={datosFactura}
          aviso={AVISO_FACTURA}
          regimenes={cat.filter((c) => c.tipo === "regimen_fiscal")}
          usos={cat.filter((c) => c.tipo === "uso_cfdi")}
        />
      )}
      {grupoSucursales && miCobro && !miCobro.exento && (
        <Sucursales grupo={grupoSucursales} precioMensual={planSucursal?.precio_mensual ?? null} dominio={dominio} />
      )}
      {nombreApagado && (
        <Alert variante="info" titulo={`${nombreApagado} no está activo`}>
          Por eso no se abrió esa sección. Si tu plan lo incluye, préndelo aquí.
        </Alert>
      )}
      <ListaModulos modulos={modulos} />
    </div>
  );
}
