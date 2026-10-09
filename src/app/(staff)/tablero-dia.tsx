import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual } from "@/lib/negocio/actual";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BotonNuevoCliente } from "@/components/boton-nuevo-cliente";
import { Antiguedad } from "@/components/ui/antiguedad";
import { desdeCuando, diasDesde, esMuyViejo, haceCuanto } from "@/lib/antiguedad";
import { cargarSaldosDeSalidas } from "@/lib/tablero/saldos-de-salidas";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { usaEstancias } from "@/lib/plan/modulos";
import { SelectorEstilista } from "./estetica/selector-estilista";
import {
  fechaLocalDeInstante,
  formatearFecha,
  formatearFechaCalendario,
  horaLocalDeInstante,
  hoyNegocio,
  sumarDiasFecha,
} from "@/lib/formato";

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
};

// `dias` es cuánto lleva esperando (o vencido) lo que avisa; `antiguedad`,
// cómo se dice. Con más de una semana, el aviso se resalta.
type Atencion = { clave: string; texto: string; href: string; detalle?: string; dias?: number; antiguedad?: string };

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

function ListaPerros({
  filas,
  vacio,
  destino,
}: {
  filas: FilaPerro[];
  vacio: string;
  destino: (fila: FilaPerro) => string;
}) {
  if (filas.length === 0) return <p className="text-sm text-n-500">{vacio}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {filas.map((f) => (
        <li key={f.estancia_id}>
          <Link
            href={destino(f)}
            className="flex items-center justify-between gap-3 rounded-md border border-n-200 bg-white px-3 py-2 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
          >
            <span className="font-semibold text-n-900">{f.perro_nombre}</span>
            <span className="text-xs text-n-500">
              {ETIQUETA_CATEGORIA[f.categoria] ?? f.categoria} · {f.servicio_nombre}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Cifra({ etiqueta, valor, sub, href }: { etiqueta: string; valor: string; sub?: string; href?: string }) {
  if (href) {
    return (
      <Link
        href={href}
        className="rounded-lg border border-n-200 bg-white p-4 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
      >
        <p className="text-xs font-bold uppercase tracking-wide text-n-500">{etiqueta}</p>
        <p className="mt-1 text-2xl font-bold text-n-900">{valor}</p>
        <p className="text-xs font-semibold text-morado">{sub ?? "Fotos, videos y reporte →"}</p>
      </Link>
    );
  }
  return (
    <div className="rounded-lg border border-n-200 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-n-500">{etiqueta}</p>
      <p className="mt-1 text-2xl font-bold text-n-900">{valor}</p>
      {sub && <p className="text-xs text-n-500">{sub}</p>}
    </div>
  );
}

export async function TableroDia({ compacto = false }: { compacto?: boolean }) {
  const negocio = await negocioActual();
  const zona = negocio.zona_horaria;
  const supabase = await createSupabaseServerClient();
  // Solo lo que el negocio tiene prendido (su plan y lo que el admin apagó).
  const sesion = await obtenerSesionConRol();
  const mods = sesion?.modulos ?? [];
  const conEstancias = usaEstancias(mods);
  const conHotel = mods.includes("hotel");
  const conEstetica = mods.includes("estetica");
  const puedeReasignar = sesion?.rol === "admin" || sesion?.rol === "recepcion";
  const puedeCorregirEstilista = tienePermiso(sesion, "corregir_estilista");

  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio(zona);
  const columnas = "estancia_id, reserva_id, perro_id, perro_nombre, categoria, servicio_nombre";

  const [
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
    { data: asignables },
    { data: personalEstetica },
  ] = await Promise.all([
    supabase.from("llegadas_hoy").select(columnas).order("perro_nombre"),
    supabase.from("salidas_hoy").select(columnas).order("perro_nombre"),
    supabase.from("quienes_estan_adentro").select(columnas).order("perro_nombre"),
    supabase.rpc("calendario_ocupacion", { p_desde: hoy, p_hasta: hoy }),
    supabase
      .from("citas_estetica")
      .select("id, inicio, estado, empleado_id, perros(nombre), servicio_nombre, servicios!citas_estetica_servicio_id_fkey(nombre)")
      .is("deleted_at", null)
      .gte("inicio", sumarDiasFecha(hoy, -1))
      .lt("inicio", sumarDiasFecha(hoy, 2))
      .order("inicio"),
    supabase.rpc("listar_cuentas_sin_vincular"),
    supabase.rpc("minutos_retraso_cierre", { p_fecha: hoy }),
    // Lo que llega en la próxima semana: es donde un requisito vencido o
    // una evaluación faltante se vuelve un problema con fecha.
    supabase
      .from("estancias")
      .select("id, perro_id, fecha_entrada, reserva_id, created_at, perros(nombre, evaluacion_comportamiento_fecha)")
      .in("estado", ["reservada", "confirmada"])
      .is("deleted_at", null)
      .gte("fecha_entrada", hoy)
      .lte("fecha_entrada", sumarDiasFecha(hoy, DIAS_ADELANTE))
      .order("fecha_entrada"),
    supabase.from("turnos_caja").select("id").eq("estado", "abierto").is("deleted_at", null).limit(1),
    // Comprobantes que los dueños mandaron desde el portal y nadie ha
    // revisado: no cuentan hasta que recepción los confirme.
    supabase
      .from("requisitos_sanitarios_propuestos")
      .select("created_at")
      .eq("estado", "pendiente")
      .is("deleted_at", null),
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
    supabase.from("contratos_por_atender").select("situacion, espera_desde"),
    // Quién atiende cada cita de estética y a quién se le puede pasar (solo
    // admin y recepción cambian la estilista).
    conEstetica && puedeReasignar
      ? supabase.rpc("estilistas_asignables")
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    conEstetica ? supabase.rpc("listar_personal_estetica") : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
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
      };
    })
    .filter((c) => c.fecha_local === hoy && c.estado !== "cancelada");
  const estilistas = ((asignables ?? []) as { id: string; nombre: string }[]).map((e) => ({ id: e.id, nombre: e.nombre }));
  const nombreDe = new Map(((personalEstetica ?? []) as { id: string; nombre: string }[]).map((e) => [e.id, e.nombre]));

  // ── Lo que necesita atención ─────────────────────────────────────
  const atencion: Atencion[] = [];

  // Perros que llegan esta semana con algo que los va a detener en la
  // puerta. Se resuelve de una vez, no cuando el dueño ya está enfrente.
  const idsProximos = Array.from(new Set((proximas ?? []).map((p) => p.perro_id as string)));
  if (idsProximos.length > 0) {
    const [{ data: sanitario }, { data: contratos }] = await Promise.all([
      supabase
        .from("perro_requisitos_sanitarios_estado")
        .select("perro_id, etiqueta, estado, fecha_vencimiento")
        .in("perro_id", idsProximos)
        .in("estado", ["vencida", "sin_registro"]),
      supabase
        .from("perros_contrato_resumen")
        .select("perro_id, estado, faltantes")
        .in("perro_id", idsProximos)
        .in("estado", ["sin_contrato", "requiere_actualizacion"]),
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
      if (perro && !perro.evaluacion_comportamiento_fecha) {
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
  const saldos = await cargarSaldosDeSalidas(supabase, hoy, zona);
  if (saldos.length > 0) {
    const total = saldos.reduce((suma, c) => suma + c.saldo, 0);
    atencion.push({
      clave: "saldos",
      texto:
        saldos.length === 1
          ? `${saldos[0].perros || "Una cuenta"} ya se fue y su cuenta tiene saldo pendiente`
          : `${saldos.length} cuentas de perros que ya se fueron tienen saldo pendiente`,
      detalle: `$${total.toFixed(2)} por cobrar`,
      href: saldos.length === 1 ? `/caja/cobrar/${saldos[0].reservaId}` : "/recepcion/saldos",
      ...masViejo(saldos.map((c) => c.salioEl), hoy, zona, "a"),
    });
  }

  // Razas nuevas del catálogo con perros de este negocio y sin grupo de
  // precio: la app no les adivina precio. La lista a la que manda va de la
  // más vieja a la más nueva.
  if (tienePermiso(sesion, "tarifas")) {
    const [{ data: sinGrupo }, { data: propuestasSinGrupo }] = await Promise.all([
      supabase.rpc("razas_sin_grupo"),
      supabase.rpc("razas_propuestas_sin_grupo"),
    ]);
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
    const { data: porPagar } = await supabase.rpc("gastos_por_atender");
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

  // Reembolsos de Mercado Pago que alguien tiene que ver: hechos desde el
  // panel del proveedor (ya en caja, pero nadie en el mostrador los pidió),
  // hechos sin turno abierto, o pedidos cuya respuesta no ha llegado.
  if (sesion && ["admin", "recepcion"].includes(sesion.rol)) {
    const { data: reembolsos } = await supabase.rpc("reembolsos_por_atender");
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
        detalle: `$${total.toFixed(2)}${panel.length ? " · hecho fuera de la app; ya se registró en caja" : ""}`,
        href: "/caja/reembolsos",
        ...masViejo(lista.map((r) => r.desde), hoy, zona),
      });
    }
  }

  // Cobros con terminal que no cuadran con Mercado Pago (conciliación por
  // hora, solo marca) y órdenes que no se pudieron confirmar: dinero que
  // alguien tiene que revisar. Con su antigüedad.
  if (sesion && ["admin", "recepcion"].includes(sesion.rol)) {
    const [{ data: conciliacion }, { data: porConfirmar }] = await Promise.all([
      // Los pagos ajenos (informativos) nunca cuentan en «Necesita atención».
      supabase.from("conciliacion_terminal").select("tipo, monto, detectada_at").is("resuelta_at", null).neq("tipo", "pago_ajeno"),
      supabase.from("mp_ordenes").select("monto, created_at").eq("estado", "por_confirmar").is("deleted_at", null),
    ]);
    const filas = (conciliacion ?? []) as { tipo: string; monto: number; detectada_at: string }[];
    if (filas.length > 0) {
      const sinPago = filas.filter((f) => f.tipo === "cobro_sin_pago").length;
      atencion.push({
        clave: "conciliacion",
        texto:
          filas.length === 1
            ? sinPago ? "Un cobro con terminal no aparece como pagado en Mercado Pago" : "Mercado Pago tiene un pago que la caja no registró"
            : `${filas.length} diferencias entre la caja y Mercado Pago`,
        detalle: `$${filas.reduce((a, f) => a + Number(f.monto), 0).toFixed(2)} · revisa cada una`,
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
    const [{ data: tarjetas }, { data: aviso }] = await Promise.all([
      supabase.rpc("tarjetas_manuales_por_revisar", { p_historial: false }),
      supabase.rpc("tarjetas_manuales_atencion"),
    ]);
    const lista = (tarjetas ?? []) as { monto: number; sobre_tope: boolean; registrada_at: string }[];
    if (lista.length > 0) {
      const total = lista.reduce((s2, t) => s2 + Number(t.monto), 0);
      atencion.push({
        clave: "tarjetas-manuales",
        texto: lista.length === 1 ? "Una tarjeta registrada a mano espera revisión" : `${lista.length} tarjetas registradas a mano esperan revisión`,
        detalle: `$${total.toFixed(2)} sin verificar · contrástalas con el voucher en Conciliación`,
        href: "/caja/conciliacion",
        ...masViejo(lista.map((t) => t.registrada_at), hoy, zona, "a"),
      });
      const sobre = lista.filter((t) => t.sobre_tope);
      if (sobre.length > 0) {
        atencion.push({
          clave: "tarjetas-manuales-tope",
          texto: sobre.length === 1 ? "Una tarjeta manual pasó el tope de alerta" : `${sobre.length} tarjetas manuales pasaron el tope de alerta`,
          detalle: `$${sobre.reduce((s2, t) => s2 + Number(t.monto), 0).toFixed(2)} · se registraron igual; revisa el voucher primero`,
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
    const { data: ajustes } = await supabase.rpc("ajustes_servicio_por_atender");
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
            ? `$${Math.abs(Number(lista[0].saldo)).toFixed(2)}`
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
    const { data: cobroData } = await supabase.rpc("estado_cobro");
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

  const ocupacionDiurna = hoyCal ? `${hoyCal.ocupado_diurno}${hoyCal.cupo_diurno != null ? ` / ${hoyCal.cupo_diurno}` : ""}` : "—";
  const ocupacionNocturna = hoyCal ? `${hoyCal.ocupado_nocturno}${hoyCal.cupo_nocturno != null ? ` / ${hoyCal.cupo_nocturno}` : ""}` : "—";

  const citasEnCurso = citas.filter((c) => c.estado === "en_curso").length;
  const citasTerminadas = citas.filter((c) => c.estado === "finalizada").length;
  const cifras = !conEstancias ? (
    <div className="grid grid-cols-3 gap-3">
      <Cifra etiqueta="Citas hoy" valor={String(citas.length)} />
      <Cifra etiqueta="En curso" valor={String(citasEnCurso)} />
      <Cifra etiqueta="Terminadas" valor={String(citasTerminadas)} />
    </div>
  ) : (
    <div className={`grid grid-cols-2 gap-3 ${conHotel ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
      <Cifra etiqueta="Llegan hoy" valor={String(llegan.length)} />
      <Cifra etiqueta="Se van hoy" valor={String(seVan.length)} />
      <Cifra etiqueta="Adentro ahora" valor={String(dentro.length)} href="/adentro" />
      <Cifra
        etiqueta="Ocupación de día"
        valor={ocupacionDiurna}
        sub={hoyCal?.cupo_estado === "sin_configurar" ? "Cupo sin configurar" : "toda la casa"}
      />
      {conHotel && <Cifra etiqueta="Ocupación de noche" valor={ocupacionNocturna} sub="perros de hotel" />}
    </div>
  );

  const listaAtencion = (
    <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Necesita atención</h2>
      {atencion.length === 0 ? (
        <p className="text-sm text-menta-oscuro">Nada pendiente por ahora.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {atencion.map((a) => {
            const viejo = a.dias !== undefined && esMuyViejo(a.dias);
            return (
              <li key={a.clave}>
                <Link
                  href={a.href}
                  className={`flex flex-col gap-1 rounded-md border-l-4 px-3 py-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave ${
                    viejo ? "border-coral bg-coral-suave/40 hover:bg-coral-suave/60" : "border-ambar bg-white hover:bg-n-50"
                  }`}
                >
                  <span className="font-semibold text-n-900">{a.texto}</span>
                  {a.detalle && <span className="text-xs text-n-600">{a.detalle}</span>}
                  {a.dias !== undefined && a.antiguedad && <Antiguedad dias={a.dias} texto={a.antiguedad} />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  if (compacto) {
    return (
      <div className="flex flex-col gap-4">
        {cifras}
        {listaAtencion}
        <Link href="/recepcion" className="text-sm font-semibold text-morado hover:underline">
          Ver el tablero del día completo →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Hoy en {negocio.nombre}</h1>
          <p className="mt-1 text-n-600">{formatearFechaCalendario(hoy)} — toda la casa en una pantalla.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <BotonNuevoCliente tipo={conEstancias ? "guarderia_hotel" : "estetica"} />
          {conEstancias && (
            <>
              <Link href={mods.includes("guarderia") ? "/guarderia/checkin" : "/hotel/checkin"}>
                <Button type="button" variante="secundario">
                  Check-in
                </Button>
              </Link>
              <Link href={mods.includes("guarderia") ? "/guarderia/checkout" : "/hotel/checkout"}>
                <Button type="button" variante="secundario">
                  Check-out
                </Button>
              </Link>
            </>
          )}
          {conEstetica && (
            <Link href="/estetica/nueva">
              <Button type="button" variante={conEstancias ? "secundario" : "primario"}>
                Nueva cita de estética
              </Button>
            </Link>
          )}
          {conEstancias && (
            <Link href={mods.includes("guarderia") ? "/guarderia/nueva" : "/hotel/nueva"}>
              <Button type="button">Nueva reserva</Button>
            </Link>
          )}
        </div>
      </div>

      {cifras}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {listaAtencion}

        {conEstetica && (
        <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Citas de estética hoy</h2>
            <Link href="/estetica" className="text-xs font-semibold text-morado hover:underline">
              Ver agenda →
            </Link>
          </div>
          {citas.length === 0 ? (
            <p className="text-sm text-n-500">No hay citas hoy.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {citas.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 rounded-md border border-n-200 bg-white p-2">
                  <Link
                    href={`/estetica/${c.id}`}
                    className="flex items-center justify-between gap-3 rounded-md px-1 py-1 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
                  >
                    <span>
                      <span className="tabular-nums font-semibold text-n-900">{c.hora}</span>{" "}
                      <span className="font-semibold text-n-900">{c.perro_nombre}</span>
                      <span className="text-xs text-n-500"> · {c.servicio_nombre}</span>
                      <span className="block text-xs text-n-500">
                        Estilista: {c.empleado_id ? (nombreDe.get(c.empleado_id) ?? "—") : "Sin asignar"}
                      </span>
                    </span>
                    <span className="text-xs text-n-500">{ETIQUETA_ESTADO_CITA[c.estado] ?? c.estado}</span>
                  </Link>
                  {puedeReasignar && (c.estado === "reservada" || c.estado === "confirmada") && (
                    <SelectorEstilista
                      citaId={c.id}
                      estado={c.estado}
                      perroNombre={c.perro_nombre}
                      empleadoId={c.empleado_id}
                      nombreActual={c.empleado_id ? (nombreDe.get(c.empleado_id) ?? null) : null}
                      estilistas={estilistas}
                      puedeCorregir={puedeCorregirEstilista}
                      compacto
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        )}
      </div>

      {conEstancias && (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Llegan hoy</h2>
          <ListaPerros
            filas={llegan}
            vacio="Nadie más por llegar."
            destino={(f) => `/reservas/estancias/${f.estancia_id}/checkin`}
          />
        </section>
        <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Se van hoy</h2>
          <ListaPerros
            filas={seVan}
            vacio="Nadie más por salir."
            destino={(f) => `/reservas/estancias/${f.estancia_id}/checkout`}
          />
        </section>
        <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Siguen aquí ahora</h2>
          <ListaPerros
            filas={dentro}
            vacio="No hay nadie dentro."
            destino={(f) => `/reservas/estancias/${f.estancia_id}/checkout`}
          />
        </section>
      </div>
      )}
    </div>
  );
}
