import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dinero as formatoDinero } from "@/lib/dinero";
import { negocioActual } from "@/lib/negocio/actual";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BotonNuevoCliente } from "@/components/boton-nuevo-cliente";
import { Antiguedad } from "@/components/ui/antiguedad";
import { desdeCuando, diasDesde, esMuyViejo, haceCuanto } from "@/lib/antiguedad";
import { cargarSaldosDeSalidas } from "@/lib/tablero/saldos-de-salidas";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { accesoDeSesion, puedeAbrir } from "@/lib/auth/acceso";
import { usaEstancias } from "@/lib/plan/modulos";
import { nombreMotivoBaja } from "@/lib/perros/baja";
import { SelectorEstilista } from "./estetica/selector-estilista";
import { textoDeCitaEnAusencia, type CitaEnAusencia } from "@/lib/estetica/ausencias";
import {
  fechaLocalDeInstante,
  formatearFecha,
  formatearFechaCalendario,
  horaLocalDeInstante,
  hoyNegocio,
  sumarDiasFecha,
} from "@/lib/formato";
import { leerTodo, leerTodoPorIds } from "@/lib/supabase/paginar";
import { Enlace } from "@/components/ui/enlace";
import { arrancarTodas } from "@/lib/supabase/arrancar";
import { Tarjeta, TarjetaCuerpo, TarjetaEncabezado, Cifra as CifraTablero } from "@/components/ui/tarjeta";
import { Chip, type TonoChip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import { CalendarPlus, CircleAlert, Dog, LogIn, LogOut, Moon, Scissors, Sun, CircleCheck, ChevronRight } from "lucide-react";
import { MovimientosDia } from "@/components/estancias/movimientos-dia";

/**
 * El tablero del día: lo que recepción necesita ver al abrir la app.
 *
 * No inventa ningún dato: junta lo que ya calculan la base y los módulos
 * (llegadas_hoy, salidas_hoy, quienes_estan_adentro, calendario_ocupacion,
 * las citas de estética, cuentas sin vincular, cuenta_totales_reserva,
 * minutos_retraso_cierre) en una sola pantalla, con un enlace a la
 * pantalla donde se resuelve cada cosa. Guardería y Hotel siguen teniendo
 * su propio tablero filtrado; este es el de toda la casa.
 *
 * `compacto` es la versión para /admin: solo los números y la lista de
 * atención, con el enlace al tablero completo.
 */

type FilaPerro = {
  estancia_id: string;
  reserva_id: string;
  perro_id: string;
  perro_nombre: string;
  categoria: string;
  servicio_nombre: string;
};

type FilaCalendario = {
  fecha: string;
  cupo_diurno: number | null;
  ocupado_diurno: number;
  disponible_diurno: number | null;
  cupo_nocturno: number | null;
  ocupado_nocturno: number;
  disponible_nocturno: number | null;
  cupo_estado: string;
};

type Cita = {
  id: string;
  hora: string;
  estado: string;
  perro_nombre: string;
  servicio_nombre: string;
  fecha_local: string;
  empleado_id: string | null;
  version: string | null;
};

// `dias` es cuánto lleva esperando (o vencido) lo que avisa; `antiguedad`,
// cómo se dice. Con más de una semana, el aviso se resalta.
type Atencion = { clave: string; texto: string; href: string; detalle?: string; dias?: number; antiguedad?: string; accion?: string };

// "2 contratos esperan la firma del dueño · el más viejo desde hace 3 días".
function masViejo(fechas: string[], hoy: string, zona: string, genero: "o" | "a" = "o") {
  const dias = Math.max(...fechas.map((f) => diasDesde(f, hoy, zona)));
  const antiguedad = fechas.length === 1 ? `Esperando ${desdeCuando(dias)}` : `${genero === "o" ? "El" : "La"} más viej${genero} ${desdeCuando(dias)}`;
  return { dias, antiguedad };
}

function duracion(minutos: number) {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const ETIQUETA_CATEGORIA: Record<string, string> = { guarderia: "Guardería", hotel: "Hotel" };
const ETIQUETA_ESTADO_CITA: Record<string, string> = {
  reservada: "Reservada",
  confirmada: "Confirmada",
  en_curso: "En curso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
  no_llego: "No llegó",
};
const DIAS_ADELANTE = 7;

// Cifra del tablero (bloque statistics-component de shadcn/studio; Mobbin: Jobber «Workflow», Luma «At a Glance»):
// ícono en su cuadro de color, etiqueta, número grande. Con `href`, la tarjeta entera lleva a su pantalla.
function Cifra({ etiqueta, valor, sub, href, icono, tono }: { etiqueta: string; valor: string; sub?: string; href?: string; icono?: React.ReactNode; tono?: "neutro" | "morado" | "menta" | "coral" | "ambar" }) {
  const contenido = <CifraTablero etiqueta={etiqueta} valor={valor} sub={href ? <span className="font-semibold text-primary">{sub ?? "Fotos, videos y reporte →"}</span> : sub} icono={icono} tono={tono} />;
  if (href) {
    return (
      <Enlace href={href} className="rounded-lg border border-border bg-card p-4 shadow-tarjeta transition-colors hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring" forma="bloque">
        {contenido}
      </Enlace>
    );
  }
  return <div className="rounded-lg border border-border bg-card p-4 shadow-tarjeta">{contenido}</div>;
}

const TONO_CITA: Record<string, TonoChip> = { reservada: "info", confirmada: "info", en_curso: "proceso", finalizada: "exito", cancelada: "neutro", no_llego: "pendiente" };

// Una parte de «Necesita atención» (tablero_atencion, migración 20261203002400). Si la base falla, la parte sale vacía
// (como cuando cada consulta fallaba sola) y el error va al log; una pieza que falló adentro viene en `fallos`.
type PartesAtencion = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Dato = { data: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const SIN_ATENCION: PartesAtencion = {};
async function grupoAtencion(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, grupo: "general" | "dinero" | "clinica"): Promise<PartesAtencion> {
  const { data, error } = await Promise.resolve(supabase.rpc("tablero_atencion", { p_grupo: grupo })).catch((e: unknown) => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } }));
  if (error) console.error(`tablero_atencion(${grupo}):`, error.message);
  const partes = (data ?? {}) as PartesAtencion;
  if (Array.isArray(partes.fallos) && partes.fallos.length) console.error(`tablero_atencion(${grupo}) sin: ${partes.fallos.join(", ")}`);
  return partes;
}
const pieza = (grupo: Promise<PartesAtencion>, clave: string) => grupo.then((d): Dato => ({ data: d[clave] ?? null }));

export async function TableroDia({ compacto = false }: { compacto?: boolean }) {
  const negocio = await negocioActual();
  const zona = negocio.zona_horaria;
  const supabase = await createSupabaseServerClient();

  // El día del negocio se calcula aquí con su zona (lo mismo que fecha_negocio() en la base), sin un viaje más.
  const hoy = hoyNegocio(zona);
  const columnas = "estancia_id, reserva_id, perro_id, perro_nombre, categoria, servicio_nombre";

  // Tiempo del panel, cuarta vuelta (2 de noviembre de 2026): lo que no depende del rol ni de los módulos arranca ANTES
  // de esperar la sesión (antes esperaba a la sesión y luego salía todo junto: una tanda más en el camino del tablero).
  const sinSesion = arrancarTodas({
    // Tiempo del panel, quinta vuelta (3 de noviembre de 2026): «Necesita atención» sale de tablero_atencion() (la base
    // aplica las mismas reglas de rol, permiso y módulo con la RLS de quien llama) en vez de ~20 consultas sueltas.
    general: grupoAtencion(supabase, "general"),
    saldos: cargarSaldosDeSalidas(supabase, hoy, zona),
    principal: Promise.all([
      supabase.from("llegadas_hoy").select(columnas).order("perro_nombre"),
      supabase.from("salidas_hoy").select(columnas).order("perro_nombre"),
      supabase.from("quienes_estan_adentro").select(columnas).order("perro_nombre"),
      supabase.rpc("calendario_ocupacion", { p_desde: hoy, p_hasta: hoy }),
      leerTodo<Record<string, unknown>>(() =>
        supabase
          .from("citas_estetica")
          .select("id, inicio, estado, empleado_id, updated_at, perros(nombre), servicio_nombre, servicios!citas_estetica_servicio_id_fkey(nombre)")
          .is("deleted_at", null)
          .gte("inicio", sumarDiasFecha(hoy, -1))
          .lt("inicio", sumarDiasFecha(hoy, 2))
          .order("inicio")
          .order("id")
      ),
      leerTodo<Record<string, unknown>>(() => supabase.rpc("listar_cuentas_sin_vincular").order("id")),
      supabase.rpc("minutos_retraso_cierre", { p_fecha: hoy }),
      // Lo que llega en la próxima semana: es donde un requisito vencido o
      // una evaluación faltante se vuelve un problema con fecha.
      // La semana que viene puede traer más de 1,000 llegadas en un negocio grande: página por página.
      leerTodo<Record<string, unknown>>(() =>
        supabase
          .from("estancias")
          .select("id, perro_id, fecha_entrada, reserva_id, created_at, perros(nombre, evaluacion_comportamiento_fecha)")
          .in("estado", ["reservada", "confirmada"])
          .is("deleted_at", null)
          .gte("fecha_entrada", hoy)
          .lte("fecha_entrada", sumarDiasFecha(hoy, DIAS_ADELANTE))
          .order("fecha_entrada")
          .order("id")
      ),
      supabase.from("turnos_caja").select("id").eq("estado", "abierto").is("deleted_at", null).limit(1),
      // Comprobantes que los dueños mandaron desde el portal y nadie ha
      // revisado: no cuentan hasta que recepción los confirme.
      leerTodo<{ id: string; created_at: string }>(() =>
        supabase.from("requisitos_sanitarios_propuestos").select("id, created_at").eq("estado", "pendiente").is("deleted_at", null).order("created_at").order("id")
      ),
      // El último turno cerrado: si no hay abierto, cuánto lleva la caja sin turno.
      supabase
        .from("turnos_caja")
        .select("cerrado_at")
        .eq("estado", "cerrado")
        .is("deleted_at", null)
        .order("cerrado_at", { ascending: false })
        .limit(1),
      // Contratos que el dueño debe firmar en su portal (el de guardería se
      // genera al vender un paquete) o que hay que volver a generar.
      leerTodo<{ situacion: string; espera_desde: string | null; contrato_id: string }>(() =>
        supabase.from("contratos_por_atender").select("contrato_id, situacion, espera_desde").order("contrato_id")
      ),
    ]),
  });

  // Solo lo que el negocio tiene prendido (su plan y lo que el admin apagó).
  const sesion = await obtenerSesionConRol();
  const mods = sesion?.modulos ?? [];
  const conEstancias = usaEstancias(mods);
  const conHotel = mods.includes("hotel");
  const conEstetica = mods.includes("estetica");
  const puedeReasignar = sesion?.rol === "admin" || sesion?.rol === "recepcion";
  const puedeCorregirEstilista = tienePermiso(sesion, "corregir_estilista");

  // Tiempo del panel (31 de octubre de 2026): lo que depende del rol o de los módulos se pide A LA VEZ, aquí; cada
  // bloque de abajo solo espera lo suyo (antes eran 14 viajes a la base uno tras otro).
  // Las tres partes de «Necesita atención» salen A LA VEZ (en serie sumarían sus tiempos): la general ya salió arriba,
  // la de dinero solo para admin y la clínica solo con Veterinaria. Cada bloque de abajo espera solo la suya.
  const general: Promise<PartesAtencion> = sinSesion.general;
  // Recepción también: las cuentas con saldo a favor (QA S62, N162) son de quien atiende la caja.
  const dinero = sesion?.rol === "admin" || sesion?.rol === "recepcion" ? grupoAtencion(supabase, "dinero") : Promise.resolve(SIN_ATENCION);
  const clinica = mods.includes("veterinaria") ? grupoAtencion(supabase, "clinica") : Promise.resolve(SIN_ATENCION);
  // Ya son promesas en marcha (grupoAtencion nunca rechaza: un error de red deja la parte vacía).
  const previas = {
    bajas: pieza(general, "bajas"),
    evaluacionExigida: pieza(general, "evaluacion_exigida"),
    saldos: sinSesion.saldos,
    razas: general.then((d): [Dato, Dato] => [{ data: d.razas_sin_grupo ?? null }, { data: d.razas_propuestas ?? null }]),
    gastos: pieza(general, "gastos"),
    vet: clinica.then((d): [Dato, Dato, Dato] => [{ data: d.vet_inventario ?? null }, { data: d.vet_permisos ?? null }, { data: d.vet_atencion ?? null }]),
    fallosWa: pieza(clinica, "fallos_wa"),
    recordatorios: general.then((d): [Dato, { count: number | null }] => [{ data: d.recordatorios_mensajes ?? null }, { count: (d.recordatorios_pausados ?? null) as number | null }]),
    reembolsos: pieza(general, "reembolsos"),
    conciliacion: general.then((d): [Dato, Dato] => [{ data: d.conciliacion ?? null }, { data: d.mp_por_confirmar ?? null }]),
    tarjetas: dinero.then((d): [Dato, Dato] => [{ data: d.tarjetas ?? null }, { data: d.tarjetas_atencion ?? null }]),
    ajustes: pieza(general, "ajustes"),
    cobro: pieza(dinero, "cobro"),
    saldosAFavor: pieza(dinero, "saldos_a_favor"),
    cfdi: pieza(general, "cfdi"),
  };

  const [
    [
      { data: llegadas, error: e1 },
      { data: salidas, error: e2 },
      { data: adentro, error: e3 },
      { data: calendario, error: e4 },
      { data: citasCrudo, error: e5 },
      { data: sinVincular },
      { data: minutosData },
      { data: proximas },
      { data: turnoAbierto },
      { data: comprobantes },
      { data: ultimoTurno },
      { data: contratosPorAtender },
    ],
    { data: asignables },
    { data: personalEstetica },
    { data: citasEnAusenciaCrudo },
  ] = await Promise.all([
    sinSesion.principal,
    // Quién atiende cada cita de estética y a quién se le puede pasar (solo
    // admin y recepción cambian la estilista).
    conEstetica && puedeReasignar
      ? supabase.rpc("estilistas_asignables")
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    conEstetica ? supabase.rpc("listar_personal_estetica") : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    // Citas de estética que siguen con alguien que tiene una ausencia aprobada.
    conEstetica ? supabase.rpc("citas_en_ausencia") : Promise.resolve({ data: [] as CitaEnAusencia[] }),
  ]);

  const error = e1 ?? e2 ?? e3 ?? e4 ?? e5;
  if (error) {
    return (
      <Alert variante="error" titulo="No pudimos cargar el tablero del día">
        Recarga la página. Si el problema sigue, avísale al equipo técnico.
      </Alert>
    );
  }

  const llegan = (llegadas as FilaPerro[]) ?? [];
  const seVan = (salidas as FilaPerro[]) ?? [];
  // Cobros parciales: lo que debe cada cuenta de quien se va hoy, en UNA consulta (saldos_de_reservas → cuenta_totales_reserva).
  const idsSalida = [...new Set(seVan.map((f) => (f as { reserva_id?: string }).reserva_id).filter(Boolean))] as string[];
  const saldosSalida = (idsSalida.length ? ((await supabase.rpc("saldos_de_reservas", { p_reservas: idsSalida })).data ?? {}) : {}) as Record<string, number>;
  const dentro = (adentro as FilaPerro[]) ?? [];
  const hoyCal = ((calendario as FilaCalendario[]) ?? [])[0] ?? null;

  const citas: Cita[] = (citasCrudo ?? [])
    .map((c) => {
      const perro = Array.isArray(c.perros) ? c.perros[0] : c.perros;
      const servicio = Array.isArray(c.servicios) ? c.servicios[0] : c.servicios;
      return {
        id: c.id as string,
        hora: horaLocalDeInstante(c.inicio as string, zona),
        estado: c.estado as string,
        perro_nombre: perro?.nombre ?? "—",
        servicio_nombre: servicio?.nombre ?? (c.servicio_nombre as string | null) ?? "—",
        fecha_local: fechaLocalDeInstante(c.inicio as string, zona),
        empleado_id: (c.empleado_id as string | null) ?? null,
        version: (c.updated_at as string | null) ?? null,
      };
    })
    .filter((c) => c.fecha_local === hoy && c.estado !== "cancelada");
  const estilistas = ((asignables ?? []) as { id: string; nombre: string }[]).map((e) => ({ id: e.id, nombre: e.nombre }));
  const nombreDe = new Map(((personalEstetica ?? []) as { id: string; nombre: string }[]).map((e) => [e.id, e.nombre]));

  // ── Lo que necesita atención ─────────────────────────────────────
  const atencion: Atencion[] = [];

  // Solicitudes de baja de mascota que el dueño pidió desde su portal: el negocio confirma o rechaza en su expediente.
  const { data: bajasPendientes } = await previas.bajas;
  for (const b of (bajasPendientes ?? []) as { id: string; perro_id: string | null; perro_nombre: string; motivo: string | null; created_at: string }[]) {
    if (!b.perro_id) continue;
    atencion.push({
      clave: `baja-${b.id}`,
      texto: `El dueño pide dar de baja a ${b.perro_nombre}`,
      detalle: `Motivo: ${nombreMotivoBaja(b.motivo).toLowerCase()}. Confírmalo o recházalo en su expediente`,
      href: `/perros/${b.perro_id}`,
      ...masViejo([b.created_at], hoy, zona, "a"),
    });
  }

  // Citas de estética (de hoy en adelante) con una estilista que tiene una ausencia aprobada.
  const citasEnAusencia = (citasEnAusenciaCrudo ?? []) as CitaEnAusencia[];
  const enAusencia = new Map(citasEnAusencia.map((c) => [c.cita_id, textoDeCitaEnAusencia(c)]));
  if (citasEnAusencia.length > 0) {
    const masCercana = citasEnAusencia[0];
    atencion.push({
      clave: "citas-en-ausencia",
      texto: `${citasEnAusencia.length} ${citasEnAusencia.length === 1 ? "cita de estética sigue" : "citas de estética siguen"} con una estilista ausente`,
      detalle: `${masCercana.empleado_nombre}: ${textoDeCitaEnAusencia(masCercana)}. Reasígnalas para que alguien las atienda`,
      href: puedeReasignar ? "/empleados/ausencias" : "/estetica",
    });
  }

  // Perros que llegan esta semana con algo que los va a detener en la
  // puerta. Se resuelve de una vez, no cuando el dueño ya está enfrente.
  const idsProximos = Array.from(new Set((proximas ?? []).map((p) => p.perro_id as string)));
  if (idsProximos.length > 0) {
    const [{ data: sanitario }, { data: contratos }] = await Promise.all([
      // Por bloques de perros: con cientos de llegadas el `.in()` se pasa del largo de la URL y de las 1,000 filas.
      leerTodoPorIds<Record<string, unknown>, string>(idsProximos, (bloque) =>
        supabase
          .from("perro_requisitos_sanitarios_estado")
          .select("perro_id, tipo_requisito_id, etiqueta, estado, fecha_vencimiento")
          .in("perro_id", bloque)
          .in("estado", ["vencida", "sin_registro"])
          .order("perro_id")
          .order("tipo_requisito_id"),
        100
      ),
      leerTodoPorIds<Record<string, unknown>, string>(idsProximos, (bloque) =>
        supabase
          .from("perros_contrato_resumen")
          .select("perro_id, estado, faltantes")
          .in("perro_id", bloque)
          .in("estado", ["sin_contrato", "requiere_actualizacion"])
          .order("perro_id"),
        100
      ),
    ]);
    const bloqueosSanitarios = new Map<string, string[]>();
    // La vencida más vieja de cada perro: "vencida hace 12 días".
    const vencidaDesde = new Map<string, string>();
    for (const s of sanitario ?? []) {
      const lista = bloqueosSanitarios.get(s.perro_id as string) ?? [];
      const venc = s.fecha_vencimiento as string | null;
      lista.push(
        s.estado === "vencida"
          ? `${s.etiqueta} vencida${venc ? ` el ${formatearFechaCalendario(venc)}` : ""}`
          : `${s.etiqueta} sin registro`
      );
      bloqueosSanitarios.set(s.perro_id as string, lista);
      if (s.estado === "vencida" && venc) {
        const previa = vencidaDesde.get(s.perro_id as string);
        if (!previa || venc < previa) vencidaDesde.set(s.perro_id as string, venc);
      }
    }
    const contratoPorPerro = new Map((contratos ?? []).map((c) => [c.perro_id as string, c]));
    // El negocio puede no pedir la evaluación de comportamiento (Requisitos para hospedar, QA S16).
    const { data: evaluacionExigida } = await previas.evaluacionExigida;
    const vistos = new Set<string>();
    for (const p of proximas ?? []) {
      const perroId = p.perro_id as string;
      if (vistos.has(perroId)) continue;
      vistos.add(perroId);
      const perro = (Array.isArray(p.perros) ? p.perros[0] : p.perros) as unknown as {
        nombre: string;
        evaluacion_comportamiento_fecha: string | null;
      } | null;
      const nombre = perro?.nombre ?? "Perro";
      const cuando = formatearFechaCalendario(p.fecha_entrada as string);
      // Lo que falta para la estancia espera desde que se reservó.
      const diasReservado = diasDesde(p.created_at as string, hoy, zona);
      const esperaReserva = { dias: diasReservado, antiguedad: `Pendiente desde que se reservó, ${haceCuanto(diasReservado)}` };
      const sanit = bloqueosSanitarios.get(perroId);
      if (sanit) {
        const venc = vencidaDesde.get(perroId);
        const diasVencida = venc ? diasDesde(venc, hoy, zona) : null;
        atencion.push({
          clave: `san-${perroId}`,
          texto: `${nombre} llega el ${cuando} con requisito sanitario pendiente`,
          detalle: sanit.join(", "),
          href: `/perros/${perroId}`,
          ...(diasVencida !== null
            ? { dias: diasVencida, antiguedad: diasVencida === 0 ? "Vencida hoy" : `Vencida ${haceCuanto(diasVencida)}` }
            : esperaReserva),
        });
      }
      if (perro && !perro.evaluacion_comportamiento_fecha && evaluacionExigida !== false) {
        atencion.push({
          clave: `eval-${perroId}`,
          texto: `${nombre} llega el ${cuando} sin evaluación de comportamiento`,
          href: `/perros/${perroId}`,
          ...esperaReserva,
        });
      }
      const contrato = contratoPorPerro.get(perroId);
      if (contrato && mods.includes("contratos")) {
        const faltantes = (contrato.faltantes as string[]) ?? [];
        atencion.push({
          clave: `con-${perroId}`,
          texto: `${nombre} llega el ${cuando} ${contrato.estado === "sin_contrato" ? "sin firmar" : "con contrato desactualizado"}`,
          detalle: faltantes.length > 0 ? faltantes.join(", ") : undefined,
          href: `/perros/${perroId}`,
          ...esperaReserva,
        });
      }
    }
  }

  // Guardería que sigue adentro después del cierre: se queda a dormir y
  // se cobra como noche de hotel — pero lo decide recepción.
  const minutos = (minutosData as number | null) ?? 0;
  if (minutos > 0) {
    for (const f of dentro.filter((d) => d.categoria === "guarderia")) {
      atencion.push({
        clave: `hotel-${f.estancia_id}`,
        texto: `${f.perro_nombre} sigue en guardería después del cierre`,
        detalle: "Convertir en noche de hotel o hacer su check-out",
        href: `/reservas/estancias/${f.estancia_id}/checkout`,
        dias: 0,
        antiguedad: `Lleva ${duracion(minutos)} después del cierre`,
      });
    }
  }

  // Cuentas con saldo de perros que ya se fueron (estancia o cita
  // terminada), sin tope de dos días: la que lleva semanas es la que más
  // importa que no se pierda.
  const saldos = await previas.saldos;
  if (saldos.length > 0) {
    const total = saldos.reduce((suma, c) => suma + c.saldo, 0);
    atencion.push({
      clave: "saldos",
      texto:
        saldos.length === 1
          ? `${saldos[0].perros || "Una cuenta"} ya se fue y su cuenta tiene saldo pendiente`
          : `${saldos.length} cuentas de perros que ya se fueron tienen saldo pendiente`,
      detalle: `${formatoDinero(total)} por cobrar`,
      href: saldos.length === 1 ? `/caja/cobrar/${saldos[0].reservaId}` : "/recepcion/saldos",
      ...masViejo(saldos.map((c) => c.salioEl), hoy, zona, "a"),
    });
  }

  // QA S62 (N162): cuentas con saldo a favor del cliente (se cobró más de lo que quedó en la cuenta). Cada una con su
  // botón a la cuenta, donde se registra la devolución; desaparece al devolver.
  {
    const { data: aFavor } = await previas.saldosAFavor;
    const lista = ((aFavor ?? []) as { reserva_id: string; cliente_nombre: string; descripcion: string; saldo: number; fecha_actividad: string }[]);
    for (const c of lista.slice(0, 5)) {
      atencion.push({
        clave: `saldo-a-favor-${c.reserva_id}`,
        texto: `Saldo a favor: devolver ${formatoDinero(-Number(c.saldo))} a ${c.cliente_nombre}`,
        detalle: `${c.descripcion} · se cobró de más; registra la devolución en la cuenta`,
        href: `/caja/cobrar/${c.reserva_id}`,
        accion: "Devolver",
      });
    }
    if (lista.length > 5) atencion.push({ clave: "saldos-a-favor-mas", texto: `${lista.length - 5} cuentas más con saldo a favor`, href: "/caja", detalle: "Ábrelas desde Caja" });
  }

  // Razas nuevas del catálogo con perros de este negocio y sin grupo de
  // precio: la app no les adivina precio. La lista a la que manda va de la
  // más vieja a la más nueva.
  if (tienePermiso(sesion, "tarifas")) {
    const [{ data: sinGrupo }, { data: propuestasSinGrupo }] = await previas.razas;
    // Las razas del catálogo sin grupo y las razas propuestas que esperan
    // aprobación (con perros, sin grupo que el negocio les haya dado).
    const razasSinGrupo = [
      ...((sinGrupo ?? []) as { nombre: string; desde: string }[]),
      ...((propuestasSinGrupo ?? []) as { nombre: string; desde: string; perros: number }[]).filter((p) => p.perros > 0),
    ];
    if (razasSinGrupo.length > 0) {
      atencion.push({
        clave: "razas-sin-grupo",
        texto: razasSinGrupo.length === 1 ? `La raza ${razasSinGrupo[0].nombre} no tiene grupo de precio` : `${razasSinGrupo.length} razas no tienen grupo de precio`,
        detalle: razasSinGrupo.length > 1 ? razasSinGrupo.map((r) => r.nombre).slice(0, 4).join(", ") : "Sin grupo no se puede agendar su estética",
        href: "/perros/razas/grupos",
        ...masViejo(razasSinGrupo.map((r) => r.desde), hoy, zona, "a"),
      });
    }
  }

  // Gastos del local vencidos o por vencer (con montos: solo para quien
  // tiene «Gastos»). La lista a la que manda va del vencimiento más viejo
  // al más nuevo.
  if (tienePermiso(sesion, "gastos") && mods.includes("gastos")) {
    const { data: porPagar } = await previas.gastos;
    const lista = (porPagar ?? []) as { concepto: string; vencimiento: string; dias: number; vencido: boolean }[];
    const vencidos = lista.filter((g) => g.vencido);
    const proximos = lista.filter((g) => !g.vencido);
    if (vencidos.length > 0) {
      const dias = Math.max(...vencidos.map((g) => g.dias));
      atencion.push({
        clave: "gastos-vencidos",
        texto: vencidos.length === 1 ? `${vencidos[0].concepto} venció sin pagar` : `${vencidos.length} gastos del local vencieron sin pagar`,
        detalle: vencidos.length > 1 ? vencidos.map((g) => g.concepto).slice(0, 4).join(", ") : undefined,
        href: "/gastos",
        dias,
        antiguedad: vencidos.length === 1 ? `Vencido ${haceCuanto(dias)}` : `El más viejo venció ${haceCuanto(dias)}`,
      });
    }
    if (proximos.length > 0) {
      const primero = Math.min(...proximos.map((g) => g.dias));
      const cuando = primero === 0 ? "hoy" : primero === 1 ? "mañana" : `en ${primero} días`;
      atencion.push({
        clave: "gastos-proximos",
        texto: proximos.length === 1 ? `${proximos[0].concepto} vence ${cuando}` : `${proximos.length} gastos del local vencen esta semana`,
        detalle: proximos.length > 1 ? proximos.map((g) => g.concepto).slice(0, 4).join(", ") : undefined,
        href: "/gastos",
        dias: 0,
        antiguedad: proximos.length === 1 ? `Vence ${cuando}` : `El primero vence ${cuando}`,
      });
    }
  }

  // Veterinaria (solo con el módulo prendido; sin él no se pide nada a la
  // base). Inventario clínico: lotes caducados o por caducar y productos
  // bajo su mínimo, para quien tiene «Administrar lotes e inventario
  // clínico». Permisos del establecimiento vencidos o por vencer, para quien
  // tiene «Configuración del negocio».
  if (mods.includes("veterinaria")) {
    const cuando = (n: number) => (n <= 0 ? "hoy" : n === 1 ? "mañana" : `en ${n} días`);
    const [{ data: alertasCrudo }, { data: permisosCrudo }, { data: vetCrudo }] = await previas.vet;
    // Carnet, hospitalización y consentimientos (Fase 1): la base solo responde lo que a esta persona le toca.
    const vet = (vetCrudo ?? {}) as {
      recordatorios_pendientes?: number;
      recordatorio_mas_viejo?: string | null;
      dosis_atrasadas?: number;
      dosis_mas_vieja?: string | null;
      consentimientos_pendientes?: number;
      consentimiento_mas_viejo?: string | null;
      consultas_sin_firmar?: number;
      consulta_mas_vieja?: string | null;
      estimados_sin_respuesta?: number;
      estimado_mas_viejo?: string | null;
      sitpv_reportes_pendientes?: number;
      sitpv_reporte_desde?: string | null;
      sitpv_reporte_aviso?: boolean;
      sitpv_reporte_bloqueo?: number;
      sitpv_folios_bajos?: number;
    };
    // Fase 4: reporte mensual del SITPV por marcar (recordatorio el día 1, aviso desde el día 3: editable por la plataforma)
    // y folios por agotarse.
    if (Number(vet.sitpv_reportes_pendientes ?? 0) > 0) {
      const n = Number(vet.sitpv_reportes_pendientes);
      const dias = vet.sitpv_reporte_desde ? Math.max(0, diasDesde(vet.sitpv_reporte_desde, hoy, zona)) : 0;
      const bloqueo = Number(vet.sitpv_reporte_bloqueo ?? 0) > 0;
      atencion.push({
        clave: "sitpv-reporte-mensual",
        texto: n === 1 ? "1 reporte mensual del SITPV está por marcar como reportado" : `${n} reportes mensuales del SITPV están por marcar como reportados`,
        detalle: bloqueo ? "Con varios meses sin reporte, el SITPV no entrega folios nuevos" : vet.sitpv_reporte_aviso ? "Ya pasaron los primeros días del mes" : undefined,
        href: "/veterinaria/recetas/sitpv",
        dias,
        antiguedad: dias === 0 ? "Toca reportarlo hoy" : `Tocaba reportarlo ${haceCuanto(dias)}`,
      });
    }
    if (Number(vet.sitpv_folios_bajos ?? 0) > 0) {
      const n = Number(vet.sitpv_folios_bajos);
      atencion.push({
        clave: "sitpv-folios-bajos",
        texto: n === 1 ? "A 1 médico le quedan pocos folios del SITPV" : `A ${n} médicos les quedan pocos folios del SITPV`,
        detalle: "Pide otro bloque en el SITPV y captúralo en Veterinaria → Médicos",
        href: "/veterinaria/recetas/sitpv",
        dias: 0,
        antiguedad: "Se agotan pronto",
      });
    }
    if (Number(vet.dosis_atrasadas ?? 0) > 0) {
      const n = Number(vet.dosis_atrasadas);
      const dias = vet.dosis_mas_vieja ? diasDesde(vet.dosis_mas_vieja, hoy, zona) : 0;
      atencion.push({
        clave: "hospitalizacion-dosis-atrasadas",
        texto: n === 1 ? "1 dosis de una mascota hospitalizada está atrasada" : `${n} dosis de mascotas hospitalizadas están atrasadas`,
        href: "/veterinaria/hospitalizacion",
        dias,
        antiguedad: dias === 0 ? "La más vieja es de hoy" : `La más vieja es ${desdeCuando(dias)}`,
      });
    }
    if (Number(vet.consentimientos_pendientes ?? 0) > 0) {
      const n = Number(vet.consentimientos_pendientes);
      const dias = vet.consentimiento_mas_viejo ? diasDesde(vet.consentimiento_mas_viejo, hoy, zona) : 0;
      atencion.push({
        clave: "consentimientos-pendientes",
        texto: n === 1 ? "1 consentimiento informado espera la firma del propietario" : `${n} consentimientos informados esperan la firma del propietario`,
        href: "/veterinaria/consentimientos",
        dias,
        antiguedad: n === 1 ? `Esperando ${desdeCuando(dias)}` : `El más viejo, ${desdeCuando(dias)}`,
      });
    }
    // Fase 3: consultas en borrador de más de un día y estimados enviados sin respuesta.
    if (Number(vet.consultas_sin_firmar ?? 0) > 0) {
      const n = Number(vet.consultas_sin_firmar);
      const dias = vet.consulta_mas_vieja ? diasDesde(vet.consulta_mas_vieja, hoy, zona) : 0;
      atencion.push({
        clave: "consultas-sin-firmar",
        texto: n === 1 ? "1 consulta lleva más de un día en borrador sin firmar" : `${n} consultas llevan más de un día en borrador sin firmar`,
        href: "/veterinaria/expediente",
        dias,
        antiguedad: n === 1 ? `En borrador ${desdeCuando(dias)}` : `La más vieja, ${desdeCuando(dias)}`,
      });
    }
    if (Number(vet.estimados_sin_respuesta ?? 0) > 0) {
      const n = Number(vet.estimados_sin_respuesta);
      const dias = vet.estimado_mas_viejo ? diasDesde(vet.estimado_mas_viejo, hoy, zona) : 0;
      atencion.push({
        clave: "estimados-sin-respuesta",
        texto: n === 1 ? "1 estimado enviado no ha tenido respuesta del dueño" : `${n} estimados enviados no han tenido respuesta del dueño`,
        href: "/veterinaria/estimados?estado=enviado",
        dias,
        antiguedad: n === 1 ? `Enviado ${desdeCuando(dias)}` : `El más viejo, ${desdeCuando(dias)}`,
      });
    }
    // Mensajes de WhatsApp que Meta aceptó y no entregó (estado «failed» del webhook): con el motivo en palabras claras.
    const { data: fallosWa } = await previas.fallosWa;
    const fallos = (fallosWa ?? []) as { id: string; etiqueta: string | null; href: string | null; motivo: string | null; fallido_at: string }[];
    if (fallos.length > 0) {
      const masViejo = fallos[0];
      const dias = Math.max(0, diasDesde(fechaLocalDeInstante(masViejo.fallido_at, zona), hoy, zona));
      atencion.push({
        clave: "whatsapp-no-llego",
        texto: fallos.length === 1 ? `Un mensaje de WhatsApp no llegó: ${masViejo.etiqueta ?? "mensaje"}. ${masViejo.motivo ?? ""}` : `${fallos.length} mensajes de WhatsApp no llegaron. ${masViejo.motivo ?? ""}`,
        href: fallos.length === 1 && masViejo.href ? masViejo.href : "/veterinaria/recordatorios",
        dias,
        antiguedad: fallos.length === 1 ? `Falló ${desdeCuando(dias)}` : `El más viejo falló ${desdeCuando(dias)}`,
      });
    }
    if (Number(vet.recordatorios_pendientes ?? 0) > 0) {
      const n = Number(vet.recordatorios_pendientes);
      const dias = vet.recordatorio_mas_viejo ? Math.max(0, diasDesde(vet.recordatorio_mas_viejo, hoy, zona)) : 0;
      atencion.push({
        clave: "carnet-recordatorios",
        texto: n === 1 ? "1 mascota tiene una vacuna o desparasitación por recordar" : `${n} dosis de vacunas o desparasitaciones por recordar`,
        href: "/veterinaria/recordatorios",
        dias,
        antiguedad: vet.recordatorio_mas_viejo && vet.recordatorio_mas_viejo < hoy ? `La más vieja venció ${haceCuanto(dias)}` : "Les toca esta semana o la próxima",
      });
    }
    const clinico = (alertasCrudo ?? {}) as {
      caducados?: number;
      por_caducar?: number;
      caducado_desde?: string | null;
      por_caducar_primero?: string | null;
      bajo_minimo?: number;
      bajo_minimo_desde?: string | null;
    };
    const caducados = Number(clinico.caducados ?? 0);
    const porCaducar = Number(clinico.por_caducar ?? 0);
    const bajoMinimo = Number(clinico.bajo_minimo ?? 0);
    if (caducados > 0) {
      const dias = clinico.caducado_desde ? diasDesde(clinico.caducado_desde, hoy, zona) : 0;
      atencion.push({
        clave: "clinico-caducados",
        texto: caducados === 1 ? "1 lote del inventario clínico está caducado y todavía tiene existencia" : `${caducados} lotes del inventario clínico están caducados y todavía tienen existencia`,
        detalle: "Sácalos del inventario como «Caducado»",
        href: "/veterinaria/inventario?filtro=caducidad",
        dias,
        antiguedad: caducados === 1 ? `Caducado ${haceCuanto(dias)}` : `El más viejo caducó ${haceCuanto(dias)}`,
      });
    }
    if (porCaducar > 0) {
      const faltan = clinico.por_caducar_primero ? diasDesde(hoy, clinico.por_caducar_primero, zona) : 0;
      atencion.push({
        clave: "clinico-por-caducar",
        texto: porCaducar === 1 ? "1 lote del inventario clínico está por caducar" : `${porCaducar} lotes del inventario clínico están por caducar`,
        href: "/veterinaria/inventario?filtro=caducidad",
        dias: 0,
        antiguedad: porCaducar === 1 ? `Caduca ${cuando(faltan)}` : `El primero caduca ${cuando(faltan)}`,
      });
    }
    if (bajoMinimo > 0) {
      // Desde el último movimiento del producto que quedó bajo (el más viejo de todos).
      const dias = clinico.bajo_minimo_desde ? diasDesde(clinico.bajo_minimo_desde, hoy, zona) : 0;
      atencion.push({
        clave: "clinico-bajo-minimo",
        texto: bajoMinimo === 1 ? "1 producto clínico está bajo su mínimo" : `${bajoMinimo} productos clínicos están bajo su mínimo`,
        href: "/veterinaria/inventario?filtro=bajo_minimo",
        dias,
        antiguedad: bajoMinimo === 1 ? `Bajo ${desdeCuando(dias)}` : `El más viejo, ${desdeCuando(dias)}`,
      });
    }

    const permisos = (permisosCrudo ?? []) as { tipo: string; vencimiento: string; dias: number; estado: string }[];
    const vencidos = permisos.filter((p) => p.estado === "vencido").sort((a, b) => a.dias - b.dias);
    const porVencer = permisos.filter((p) => p.estado !== "vencido").sort((a, b) => a.dias - b.dias);
    if (vencidos.length > 0) {
      const dias = Math.max(...vencidos.map((p) => -p.dias));
      atencion.push({
        clave: "establecimiento-vencidos",
        texto: vencidos.length === 1 ? `${vencidos[0].tipo} del establecimiento está vencido` : `${vencidos.length} permisos del establecimiento están vencidos`,
        detalle: vencidos.length > 1 ? vencidos.map((p) => p.tipo).slice(0, 4).join(", ") : undefined,
        href: "/admin/perfil",
        dias,
        antiguedad: vencidos.length === 1 ? `Vencido ${haceCuanto(dias)}` : `El más viejo venció ${haceCuanto(dias)}`,
      });
    }
    if (porVencer.length > 0) {
      const primero = Math.max(0, porVencer[0].dias);
      atencion.push({
        clave: "establecimiento-por-vencer",
        texto: porVencer.length === 1 ? `${porVencer[0].tipo} del establecimiento vence ${cuando(primero)}` : `${porVencer.length} permisos del establecimiento están por vencer`,
        detalle: porVencer.length > 1 ? porVencer.map((p) => p.tipo).slice(0, 4).join(", ") : undefined,
        href: "/admin/perfil",
        dias: 0,
        antiguedad: porVencer.length === 1 ? `Vence ${cuando(primero)}` : `El primero vence ${cuando(primero)}`,
      });
    }
  }

  // Recordatorios por WhatsApp: lo que contestaron los clientes (cambiar la cita, agendar, un mensaje) y los que
  // quedaron en pausa por los gratis del mes o el tope.
  if (sesion && ["admin", "recepcion"].includes(sesion.rol)) {
    const [{ data: porAtender }, { count: pausadosRec }] = await previas.recordatorios;
    const msgs = (porAtender ?? []) as { tipo: string; created_at: string }[];
    if (msgs.length > 0) {
      const cambios = msgs.filter((m) => m.tipo === "pide_cambio").length;
      atencion.push({
        clave: "recordatorios-respuestas",
        texto:
          msgs.length === 1
            ? cambios === 1
              ? "Un cliente pidió cambiar su cita por WhatsApp"
              : msgs[0].tipo === "solicitud_cita"
                ? "Un cliente quiere agendar desde su recordatorio"
                : "Un cliente contestó a su recordatorio por WhatsApp"
            : `${msgs.length} respuestas de clientes a sus recordatorios por atender${cambios ? ` (${cambios} piden cambiar su cita)` : ""}`,
        href: "/recordatorios",
        ...masViejo(msgs.map((m) => fechaLocalDeInstante(m.created_at, zona)), hoy, zona, "a"),
      });
    }
    if (Number(pausadosRec ?? 0) > 0) {
      atencion.push({
        clave: "recordatorios-pausados",
        texto: pausadosRec === 1 ? "Un recordatorio por WhatsApp está en pausa" : `${pausadosRec} recordatorios por WhatsApp están en pausa`,
        detalle: "Ya se usaron los gratis del mes o se llegó al tope: revísalo en Módulos y plan",
        href: "/recordatorios",
        dias: 0,
      });
    }
  }

  // Reembolsos de Mercado Pago que alguien tiene que ver: hechos desde el
  // panel del proveedor (ya en caja, pero nadie en el mostrador los pidió),
  // hechos sin turno abierto, o pedidos cuya respuesta no ha llegado.
  if (sesion && ["admin", "recepcion"].includes(sesion.rol)) {
    const { data: reembolsos } = await previas.reembolsos;
    const lista = (reembolsos ?? []) as { origen: string; estado: string; registrado: boolean; monto: number; desde: string }[];
    if (lista.length > 0) {
      const panel = lista.filter((r) => r.origen === "proveedor");
      const total = lista.reduce((s2, r) => s2 + Number(r.monto), 0);
      atencion.push({
        clave: "reembolsos",
        texto:
          lista.length === 1
            ? panel.length
              ? "Se hizo un reembolso desde el panel de Mercado Pago"
              : lista[0].estado === "solicitado"
                ? "Un reembolso espera la respuesta de Mercado Pago"
                : "Un reembolso de Mercado Pago falta de registrarse en caja"
            : `${lista.length} reembolsos de Mercado Pago por revisar`,
        detalle: `${formatoDinero(total)}${panel.length ? " · hecho fuera de la app; ya se registró en caja" : ""}`,
        href: "/caja/reembolsos",
        ...masViejo(lista.map((r) => r.desde), hoy, zona),
      });
    }
  }

  // Cobros con terminal que no cuadran con Mercado Pago (conciliación por
  // hora, solo marca) y órdenes que no se pudieron confirmar: dinero que
  // alguien tiene que revisar. Con su antigüedad.
  if (sesion && ["admin", "recepcion"].includes(sesion.rol)) {
    const [{ data: conciliacion }, { data: porConfirmar }] = await previas.conciliacion;
    const filas = (conciliacion ?? []) as { tipo: string; monto: number; detectada_at: string }[];
    if (filas.length > 0) {
      const sinPago = filas.filter((f) => f.tipo === "cobro_sin_pago").length;
      atencion.push({
        clave: "conciliacion",
        texto:
          filas.length === 1
            ? sinPago ? "Un cobro con terminal no aparece como pagado en Mercado Pago" : "Mercado Pago tiene un pago que la caja no registró"
            : `${filas.length} diferencias entre la caja y Mercado Pago`,
        detalle: `${formatoDinero(filas.reduce((a, f) => a + Number(f.monto), 0))} · revisa cada una`,
        href: "/caja/conciliacion",
        ...masViejo(filas.map((f) => f.detectada_at), hoy, zona),
      });
    }
    const pc = (porConfirmar ?? []) as { monto: number; created_at: string }[];
    if (pc.length > 0) {
      atencion.push({
        clave: "por-confirmar",
        texto: pc.length === 1 ? "Un cobro con terminal está por confirmar con Mercado Pago" : `${pc.length} cobros con terminal están por confirmar con Mercado Pago`,
        detalle: "No cuentan como cobrados hasta que Mercado Pago lo confirme: en la cuenta, «Revisar con Mercado Pago»",
        href: "/caja/conciliacion",
        ...masViejo(pc.map((f) => f.created_at), hoy, zona),
      });
    }
  }

  // Tarjetas registradas a mano («Tarjeta (registro manual)»): cuentan como
  // pagadas pero nadie las ha verificado. Solo el admin las revisa (trae
  // montos y folios); sube también la que pasó el tope y el patrón de uso.
  if (sesion?.rol === "admin") {
    const [{ data: tarjetas }, { data: aviso }] = await previas.tarjetas;
    // QA S62 (N163): lo que espera revisión es el NETO de cada tarjeta (lo cobrado menos lo devuelto con esa tarjeta).
    const lista = ((tarjetas ?? []) as { monto: number; devuelto: number | null; sobre_tope: boolean; registrada_at: string }[]).filter((t) => Number(t.monto) - Number(t.devuelto ?? 0) > 0.005);
    if (lista.length > 0) {
      const total = lista.reduce((s2, t) => s2 + Number(t.monto) - Number(t.devuelto ?? 0), 0);
      atencion.push({
        clave: "tarjetas-manuales",
        texto: lista.length === 1 ? "Una tarjeta registrada a mano espera revisión" : `${lista.length} tarjetas registradas a mano esperan revisión`,
        detalle: `${formatoDinero(total)} sin verificar · contrástalas con el voucher en Conciliación`,
        href: "/caja/conciliacion",
        ...masViejo(lista.map((t) => t.registrada_at), hoy, zona, "a"),
      });
      const sobre = lista.filter((t) => t.sobre_tope);
      if (sobre.length > 0) {
        atencion.push({
          clave: "tarjetas-manuales-tope",
          texto: sobre.length === 1 ? "Una tarjeta manual pasó el tope de alerta" : `${sobre.length} tarjetas manuales pasaron el tope de alerta`,
          detalle: `${formatoDinero(sobre.reduce((s2, t) => s2 + Number(t.monto), 0))} · se registraron igual; revisa el voucher primero`,
          href: "/caja/conciliacion",
          ...masViejo(sobre.map((t) => t.registrada_at), hoy, zona, "a"),
        });
      }
    }
    const av = aviso as { patron_por_dia?: boolean; patron_por_turno?: boolean; manuales_hoy?: number; pct_turno?: number; pct_manuales?: number; pct_total?: number } | null;
    if (av?.patron_por_dia || av?.patron_por_turno) {
      atencion.push({
        clave: "tarjetas-manuales-patron",
        texto: "Se están registrando muchas tarjetas a mano con la terminal conectada",
        detalle: [
          av.patron_por_dia ? `${av.manuales_hoy} hoy (más de 3)` : null,
          av.patron_por_turno ? `${av.pct_manuales} de ${av.pct_total} cobros con tarjeta del turno (${av.pct_turno} %)` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        href: "/caja/conciliacion",
        dias: 0,
        antiguedad: "Pasa hoy",
      });
    }
  }

  // Servicios corregidos después de cobrarse: la cuenta quedó con un cobro
  // adicional o un saldo a favor que nadie ha resuelto. Con su antigüedad.
  if (conEstetica && sesion && ["admin", "recepcion"].includes(sesion.rol)) {
    const { data: ajustes } = await previas.ajustes;
    const lista = (ajustes ?? []) as { tipo_ajuste: string; saldo: number; desde: string }[];
    if (lista.length > 0) {
      const aFavor = lista.filter((x) => x.tipo_ajuste === "saldo_a_favor");
      const porCobrar = lista.length - aFavor.length;
      atencion.push({
        clave: "ajustes-servicio",
        texto:
          lista.length === 1
            ? aFavor.length ? "Un servicio corregido dejó saldo a favor del cliente por devolver" : "Un servicio corregido dejó un cobro adicional por cobrar"
            : `${lista.length} servicios corregidos con ajuste de cuenta pendiente`,
        detalle:
          lista.length === 1
            ? `${formatoDinero(Math.abs(Number(lista[0].saldo)))}`
            : `${aFavor.length} por devolver · ${porCobrar} por cobrar`,
        href: "/caja/ajustes-servicio",
        ...masViejo(lista.map((x) => x.desde), hoy, zona),
      });
    }
  }

  const fechasComprobantes = (comprobantes ?? []).map((c) => c.created_at as string);
  const comprobantesPorRevisar = fechasComprobantes.length;
  if (comprobantesPorRevisar > 0 && mods.includes("portal")) {
    atencion.push({
      clave: "comprobantes",
      texto: `${comprobantesPorRevisar} ${comprobantesPorRevisar === 1 ? "comprobante sanitario espera" : "comprobantes sanitarios esperan"} revisión`,
      detalle: "Lo mandó el dueño desde su portal; no cuenta hasta que lo confirmes contra el documento",
      href: "/recepcion/comprobantes",
      ...masViejo(fechasComprobantes, hoy, zona),
    });
  }

  const filasContratos = (contratosPorAtender ?? []) as { situacion: string; espera_desde: string }[];
  const fechasRegenerar = filasContratos.filter((c) => c.situacion === "por_regenerar").map((c) => c.espera_desde);
  const fechasFirmar = filasContratos.filter((c) => c.situacion === "por_firmar").map((c) => c.espera_desde);
  const contratosRegenerar = fechasRegenerar.length;
  const contratosFirmar = fechasFirmar.length;
  if (contratosRegenerar > 0 && mods.includes("contratos")) {
    atencion.push({
      clave: "contratos-regenerar",
      texto: `${contratosRegenerar} ${contratosRegenerar === 1 ? "contrato firmado hay" : "contratos firmados hay"} que volver a generar`,
      detalle: "Se firmaron con campos sin llenar en el PDF; el firmado se conserva",
      href: "/recepcion/contratos",
      ...masViejo(fechasRegenerar, hoy, zona),
    });
  }
  if (contratosFirmar > 0 && mods.includes("contratos")) {
    atencion.push({
      clave: "contratos-firmar",
      texto: `${contratosFirmar} ${contratosFirmar === 1 ? "contrato espera" : "contratos esperan"} la firma del dueño`,
      detalle: "Se firman desde el portal; recuérdaselo por WhatsApp",
      href: "/recepcion/contratos",
      ...masViejo(fechasFirmar, hoy, zona),
    });
  }

  const cuentasSinVincular = (Array.isArray(sinVincular) ? sinVincular : []) as { creado_en: string }[];
  const pendientesVincular = cuentasSinVincular.length;
  if (pendientesVincular > 0 && mods.includes("portal")) {
    atencion.push({
      clave: "vincular",
      texto: `${pendientesVincular} ${pendientesVincular === 1 ? "cuenta nueva espera" : "cuentas nuevas esperan"} vincularse a su expediente`,
      href: "/vinculacion",
      ...masViejo(cuentasSinVincular.map((c) => c.creado_en), hoy, zona, "a"),
    });
  }
  if (!turnoAbierto || turnoAbierto.length === 0) {
    atencion.push({
      clave: "turno",
      texto: "No hay turno de caja abierto",
      detalle: "Sin turno no se puede cobrar ni vender bonos",
      href: "/caja",
      ...(ultimoTurno?.[0]?.cerrado_at
        ? { dias: diasDesde(ultimoTurno[0].cerrado_at as string, hoy, zona), antiguedad: `El último se cerró ${haceCuanto(diasDesde(ultimoTurno[0].cerrado_at as string, hoy, zona))}` }
        : {}),
    });
  }

  // La suscripción a PeluDesk: un cobro fallido espera al admin aquí, con
  // cuánto lleva (la gracia es de 7 días; al 8 el negocio queda en solo lectura).
  if (sesion?.rol === "admin") {
    const { data: cobroData } = await previas.cobro;
    const cobro = cobroData as { estado: string; primer_fallo_at: string | null; solo_lectura_desde: string | null } | null;
    if (cobro && (cobro.estado === "gracia" || cobro.estado === "solo_lectura") && cobro.primer_fallo_at) {
      atencion.unshift({
        clave: "cobro",
        texto: cobro.estado === "gracia" ? "No se pudo cobrar tu suscripción de PeluDesk" : "El negocio está en solo lectura: no se pudo cobrar la suscripción",
        detalle:
          cobro.estado === "gracia" && cobro.solo_lectura_desde
            ? `Todo funciona hasta el ${formatearFecha(cobro.solo_lectura_desde, zona)}; paga o cambia la tarjeta para no quedar en solo lectura`
            : "Paga la factura pendiente y todo vuelve a funcionar solo",
        href: "/admin/modulos",
        ...masViejo([cobro.primer_fallo_at], hoy, zona),
      });
    }
  }

  // Facturación (CFDI): global por emitir (24 h después del cierre del periodo),
  // timbres por agotarse, cancelaciones esperando al cliente y timbrados por
  // revisar. La base solo las entrega a quien factura o cancela.
  {
    const { data: cfdi } = await previas.cfdi;
    for (const [i, a] of ((cfdi ?? []) as { clave: string; texto: string; desde: string; urgente: boolean; ruta: string }[]).entries()) {
      const dias = diasDesde(a.desde, hoy, zona);
      atencion.push({
        clave: `${a.clave}-${i}`,
        texto: a.texto,
        href: a.ruta,
        dias,
        antiguedad: a.urgente ? `Urgente · ${haceCuanto(dias)}` : `Desde ${haceCuanto(dias)}`,
      });
    }
  }

  const ocupacionDiurna = hoyCal ? `${hoyCal.ocupado_diurno}${hoyCal.cupo_diurno != null ? ` / ${hoyCal.cupo_diurno}` : ""}` : "—";
  const ocupacionNocturna = hoyCal ? `${hoyCal.ocupado_nocturno}${hoyCal.cupo_nocturno != null ? ` / ${hoyCal.cupo_nocturno}` : ""}` : "—";

  const citasEnCurso = citas.filter((c) => c.estado === "en_curso").length;
  const citasTerminadas = citas.filter((c) => c.estado === "finalizada").length;
  const cifras = !conEstancias ? (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Cifra etiqueta="Citas hoy" valor={String(citas.length)} icono={<Scissors />} tono="morado" />
      <Cifra etiqueta="En curso" valor={String(citasEnCurso)} icono={<Scissors />} tono="ambar" />
      <Cifra etiqueta="Terminadas" valor={String(citasTerminadas)} icono={<CircleCheck />} tono="menta" />
    </div>
  ) : (
    <div className={`grid grid-cols-2 gap-3 ${conHotel ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
      <Cifra etiqueta="Llegan hoy" valor={String(llegan.length)} icono={<LogIn />} tono="morado" />
      <Cifra etiqueta="Se van hoy" valor={String(seVan.length)} icono={<LogOut />} tono="ambar" />
      <Cifra etiqueta="Adentro ahora" valor={String(dentro.length)} href="/adentro" icono={<Dog />} tono="menta" />
      <Cifra
        etiqueta="Ocupación de día"
        valor={ocupacionDiurna}
        sub={hoyCal?.cupo_estado === "sin_configurar" ? "Cupo sin configurar" : "toda la casa"}
        icono={<Sun />}
      />
      {conHotel && <Cifra etiqueta="Ocupación de noche" valor={ocupacionNocturna} sub="perros de hotel" icono={<Moon />} />}
    </div>
  );

  // QA N127: lo que lleva a una pantalla que esta persona no abre no se lista (no podría resolverlo desde ahí).
  const acceso = accesoDeSesion(sesion);
  const atencionVisible = atencion.filter((a) => puedeAbrir(acceso, a.href));
  // Mobbin: Remote «Things to do (4)»: un renglón por pendiente con su ícono en cuadro de color, qué es en negritas,
  // qué falta abajo y desde cuándo. Lo más viejo, en coral.
  const listaAtencion = (
    <Tarjeta data-necesita-atencion="">
      <TarjetaEncabezado titulo="Necesita atención" conteo={atencionVisible.length} icono={<CircleAlert />} />
      <TarjetaCuerpo className="gap-1">
        {atencionVisible.length === 0 ? (
          <p className="flex items-center gap-2 py-1 text-sm font-medium text-menta-oscuro">
            <CircleCheck aria-hidden="true" className="size-4" />
            Nada pendiente por ahora.
          </p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {atencionVisible.map((a) => {
              const viejo = a.dias !== undefined && esMuyViejo(a.dias);
              return (
                <li key={a.clave}>
                  <Enlace
                    href={a.href}
                    className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                    forma="bloque"
                  >
                    <span aria-hidden="true" className={cn("mt-0.5 grid size-8 flex-none place-items-center rounded-md [&_svg]:size-4", viejo ? "bg-coral-suave text-coral-oscuro" : "bg-ambar-suave text-ambar-oscuro")}>
                      <CircleAlert />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-semibold text-foreground">{a.texto}</span>
                      {a.detalle && <span className="text-xs text-n-600">{a.detalle}</span>}
                      {a.dias !== undefined && a.antiguedad && <Antiguedad dias={a.dias} texto={a.antiguedad} />}
                    </span>
                    {a.accion ? <span className="mt-1 flex-none rounded-full bg-morado px-3 py-1 text-xs font-semibold text-white" data-accion-atencion>{a.accion}</span> : null}
                    <ChevronRight aria-hidden="true" className="mt-1.5 size-4 flex-none text-n-400" />
                  </Enlace>
                </li>
              );
            })}
          </ul>
        )}
      </TarjetaCuerpo>
    </Tarjeta>
  );

  if (compacto) {
    return (
      <div className="flex flex-col gap-4">
        {cifras}
        {listaAtencion}
        <Enlace href="/recepcion" className="text-sm">
          Ver el tablero del día completo →
        </Enlace>
      </div>
    );
  }

  // Mobbin: Fresha «Appointments activity»: la hora en bloque a la izquierda, el perro y el servicio en negritas,
  // quién lo atiende abajo y el estado en su chip a la derecha.
  const tarjetaCitas = conEstetica && (
    <Tarjeta>
      <TarjetaEncabezado
        titulo="Citas de estética hoy"
        conteo={citas.length}
        icono={<Scissors />}
        accion={
          <Enlace href="/estetica" className="text-sm">
            Ver agenda →
          </Enlace>
        }
      />
      <TarjetaCuerpo className="gap-1">
        {citas.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No hay citas hoy.</p>
        ) : (
          <ul className="-mx-2 flex flex-col divide-y divide-border">
            {citas.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 py-1.5">
                <Enlace href={`/estetica/${c.id}`} className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring" forma="bloque">
                  <span className="w-14 flex-none rounded-md bg-muted py-1 text-center text-sm font-bold tabular-nums text-foreground">{c.hora}</span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate">
                      <span className="font-semibold text-foreground">{c.perro_nombre}</span>
                      <span className="text-sm text-muted-foreground"> · {c.servicio_nombre}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Estilista: {c.empleado_id ? (nombreDe.get(c.empleado_id) ?? "—") : "Sin asignar"}
                    </span>
                    {enAusencia.has(c.id) && (
                      <span data-cita-en-ausencia className="block text-xs font-semibold text-coral-oscuro">
                        Estilista ausente ({enAusencia.get(c.id)}): reasigna esta cita
                      </span>
                    )}
                  </span>
                  <Chip tono={TONO_CITA[c.estado] ?? "neutro"}>{ETIQUETA_ESTADO_CITA[c.estado] ?? c.estado}</Chip>
                </Enlace>
                {puedeReasignar && (c.estado === "reservada" || c.estado === "confirmada") && (
                  <div className="pl-[4.25rem]">
                    <SelectorEstilista
                      citaId={c.id}
                      estado={c.estado}
                      perroNombre={c.perro_nombre}
                      empleadoId={c.empleado_id}
                      nombreActual={c.empleado_id ? (nombreDe.get(c.empleado_id) ?? null) : null}
                      estilistas={estilistas}
                      puedeCorregir={puedeCorregirEstilista}
                      version={c.version}
                      compacto
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </TarjetaCuerpo>
    </Tarjeta>
  );

  const movimientos = conEstancias && (
    <MovimientosDia llegan={llegan} seVan={seVan} dentro={dentro} detalle={(f) => `${ETIQUETA_CATEGORIA[f.categoria ?? ""] ?? f.categoria} · ${f.servicio_nombre}`} saldoDe={(f) => (f.reserva_id ? Number(saldosSalida[f.reserva_id] ?? 0) : null)} />
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Mobbin: Jobber «Home»: la fecha arriba y el saludo del día; las acciones de todos los días a la derecha. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground first-letter:uppercase">{formatearFechaCalendario(hoy)}</p>
          <h1 className="mt-0.5 text-2xl font-bold text-foreground">Hoy en {negocio.nombre}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Toda la casa en una pantalla.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <BotonNuevoCliente tipo={conEstancias ? "guarderia_hotel" : "estetica"} />
          {conEstancias && (
            <>
              <Enlace href={mods.includes("guarderia") ? "/guarderia/checkin" : "/hotel/checkin"}>
                <LogIn aria-hidden="true" className="size-4" />
                Check-in
              </Enlace>
              <Enlace href={mods.includes("guarderia") ? "/guarderia/checkout" : "/hotel/checkout"}>
                <LogOut aria-hidden="true" className="size-4" />
                Check-out
              </Enlace>
            </>
          )}
          {conEstetica && (
            <Enlace href="/estetica/nueva">
              <Scissors aria-hidden="true" className="size-4" />
              Nueva cita de estética
            </Enlace>
          )}
          {conEstancias && (
            <Enlace href={mods.includes("guarderia") ? "/guarderia/nueva" : "/hotel/nueva"}>
              <CalendarPlus aria-hidden="true" className="size-4" />
              Nueva reserva
            </Enlace>
          )}
        </div>
      </div>

      {cifras}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          {movimientos}
          {tarjetaCitas}
        </div>
        <div className="flex min-w-0 flex-col gap-4">{listaAtencion}</div>
      </div>
    </div>
  );
}
