import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { hoyNegocio } from "@/lib/formato";
import { cargarCatalogoExtras, cargarExtras } from "@/lib/extras/servidor";
import { ServiciosExtraEstancia } from "./servicios-extra-estancia";
import { motivoSinCargosNuevos } from "@/lib/caja/cargos-nuevos-servidor";
import { TEXTO_CUENTA_PAGADA_SIN_CARGOS } from "@/lib/caja/cuenta-por-cobrar";

/** Los servicios extra de una estancia, para el check-in y el check-out. */
export async function SeccionServiciosExtra({ estanciaId }: { estanciaId: string }) {
  const supabase = await createSupabaseServerClient();
  const [sesion, negocio, zona] = await Promise.all([obtenerSesionConRol(), negocioActual(), zonaActual()]);
  const puedeAgregar = tienePermiso(sesion, "agregar_servicios_extra");

  const { data: est } = await supabase
    .from("estancias")
    .select("fecha_entrada, fecha_salida, perros(cliente_id, clientes(direccion))")
    .eq("id", estanciaId)
    .maybeSingle();
  if (!est) return null;
  const perro = Array.isArray(est.perros) ? est.perros[0] : est.perros;
  const cli = perro ? (Array.isArray(perro.clientes) ? perro.clientes[0] : perro.clientes) : null;

  const [catalogo, filas, cuentaCerrada] = await Promise.all([
    puedeAgregar ? cargarCatalogoExtras(supabase, true) : Promise.resolve([]),
    cargarExtras(supabase, { estanciaId }),
    // Estancia finalizada con la cuenta pagada: ya no se le agregan servicios extra (misma regla que «Aplicar cargo»).
    motivoSinCargosNuevos(supabase, estanciaId),
  ]);

  return (
    <ServiciosExtraEstancia
      estanciaId={estanciaId}
      clienteId={(perro?.cliente_id as string) ?? ""}
      fechaEntrada={est.fecha_entrada as string}
      fechaSalida={est.fecha_salida as string}
      hoy={hoyNegocio(zona)}
      catalogo={catalogo}
      filas={filas}
      negocio={negocio.nombre}
      puedeAgregar={puedeAgregar}
      direccionCliente={(cli?.direccion as string | null) ?? null}
      sinCargosNuevos={cuentaCerrada ? TEXTO_CUENTA_PAGADA_SIN_CARGOS : null}
    />
  );
}
