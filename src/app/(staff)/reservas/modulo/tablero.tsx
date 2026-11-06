import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearFechaCalendario, hoyNegocio, sumarDiasFecha } from "@/lib/formato";
import type { ModuloEstancia } from "@/lib/modulos";
import { BotonNuevoCliente } from "@/components/boton-nuevo-cliente";
import { tipoLinkDeModulo } from "@/lib/alta/tipos-link";
import { TablaOcupacion, type FilaCalendario } from "./tabla-ocupacion";
import { PasesTablero } from "./pases-tablero";
import { LlegadasAtrasadas, type LlegadaAtrasada } from "./llegadas-atrasadas";
import { zonaActual } from "@/lib/negocio/actual";
import { Enlace } from "@/components/ui/enlace";
import { MovimientosDia } from "@/components/estancias/movimientos-dia";
import { SolicitudesEnAgenda } from "@/components/solicitudes/en-agenda";
import { Camera, LogIn, LogOut, CalendarPlus, Repeat } from "lucide-react";

const DIAS_CALENDARIO = 14;
const TOPE_ATRASADAS = 30;
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

type FilaPerro = {
  estancia_id: string;
  reserva_id: string;
  perro_id: string;
  perro_nombre: string;
  categoria: string;
  servicio_nombre: string;
};

// El tablero del día de un módulo. Las tres listas van filtradas por su
// categoría (el staff que atiende guardería no quiere ver a los de hotel
// en su lista de llegadas), pero la ocupación de abajo es de toda la casa
// — ver el comentario de TablaOcupacion.
export async function TableroModulo({ modulo }: { modulo: ModuloEstancia }) {
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();

  // El día del negocio se calcula aquí con su zona (lo mismo que fecha_negocio() en la base), sin un viaje más.
  const hoy = hoyNegocio(zona);
  const hasta = sumarDiasFecha(hoy, DIAS_CALENDARIO - 1);

  const columnas = "estancia_id, reserva_id, perro_id, perro_nombre, categoria, servicio_nombre";
  const [
    { data: llegadas, error: errorLlegadas },
    { data: salidas, error: errorSalidas },
    { data: adentro, error: errorAdentro },
    { data: calendario, error: errorCalendario },
    // Llegadas atrasadas (antes era otro viaje después de la tanda).
    { data: atrasadasCrudas, error: errorAtrasadas },
  ] = await Promise.all([
    supabase.from("llegadas_hoy").select(columnas).eq("categoria", modulo.categoria).order("perro_nombre"),
    supabase.from("salidas_hoy").select(columnas).eq("categoria", modulo.categoria).order("perro_nombre"),
    supabase
      .from("quienes_estan_adentro")
      .select(columnas)
      .eq("categoria", modulo.categoria)
      .order("perro_nombre"),
    supabase.rpc("calendario_ocupacion", { p_desde: hoy, p_hasta: hasta }),
    supabase
      .from("estancias")
      .select("id, reserva_id, fecha_entrada, updated_at, perros(nombre), servicios!inner(nombre, categoria)")
      .is("deleted_at", null)
      .is("hora_entrada_real", null)
      .in("estado", ["reservada", "confirmada"])
      .lt("fecha_entrada", hoy)
      .eq("servicios.categoria", modulo.categoria)
      .order("fecha_entrada")
      .order("id")
      .limit(TOPE_ATRASADAS + 1)
  ]);
  // Llegadas atrasadas: la entrada ya pasó y no hicieron check-in. Siguen vivas pero ya no cuentan en la ocupación.
  const atrasadas: LlegadaAtrasada[] = (atrasadasCrudas ?? []).slice(0, TOPE_ATRASADAS).map((e) => ({
    id: e.id,
    reservaId: e.reserva_id,
    perro: uno(e.perros)?.nombre ?? "",
    servicio: uno(e.servicios)?.nombre ?? "",
    fechaEntrada: e.fecha_entrada,
    version: e.updated_at,
  }));

  const error = errorLlegadas ?? errorSalidas ?? errorAdentro ?? errorCalendario ?? errorAtrasadas;

  return (
    <div className="flex flex-col gap-6">
      {/* Rediseño (docs/diseno/DESIGN.md; Mobbin panel-hotel-guarderia): la fecha arriba, el título del módulo y las
          acciones de todos los días a la derecha, igual que el tablero de recepción. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground first-letter:uppercase">{formatearFechaCalendario(hoy)}</p>
          <h1 className="mt-0.5 text-2xl font-bold text-foreground">{modulo.etiqueta}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Quién llega, quién se va y quién sigue aquí.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <BotonNuevoCliente tipo={tipoLinkDeModulo(modulo.categoria)} />
          <Enlace href={`${modulo.base}/checkin`}>
            <LogIn aria-hidden="true" className="size-4" />
            Check-in
          </Enlace>
          <Enlace href={`${modulo.base}/checkout`}>
            <LogOut aria-hidden="true" className="size-4" />
            Check-out
          </Enlace>
          <Enlace href="/adentro">
            <Camera aria-hidden="true" className="size-4" />
            Fotos, videos y reporte
          </Enlace>
          <Enlace href={`${modulo.base}/series`}>
            <Repeat aria-hidden="true" className="size-4" />
            Series recurrentes
          </Enlace>
          <Enlace href={`${modulo.base}/nueva`}>
            <CalendarPlus aria-hidden="true" className="size-4" />
            Nueva reserva
          </Enlace>
        </div>
      </div>
      <SolicitudesEnAgenda tipo="estancia" />

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la información">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <>
          <LlegadasAtrasadas filas={atrasadas} hayMas={(atrasadasCrudas ?? []).length > TOPE_ATRASADAS} />

          <MovimientosDia
            llegan={(llegadas as FilaPerro[]) ?? []}
            seVan={(salidas as FilaPerro[]) ?? []}
            dentro={(adentro as FilaPerro[]) ?? []}
          />

          {modulo.categoria === "guarderia" && (sesion?.modulos ?? []).includes("bonos") && <PasesTablero hoy={hoy} />}

          <TablaOcupacion filas={(calendario as FilaCalendario[]) ?? []} modulo={modulo} />
        </>
      )}
    </div>
  );
}
