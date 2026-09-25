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
import {
  fechaLocalDeInstante,
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

function Cifra({ etiqueta, valor, sub }: { etiqueta: string; valor: string; sub?: string }) {
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
  ] = await Promise.all([
    supabase.from("llegadas_hoy").select(columnas).order("perro_nombre"),
    supabase.from("salidas_hoy").select(columnas).order("perro_nombre"),
    supabase.from("quienes_estan_adentro").select(columnas).order("perro_nombre"),
    supabase.rpc("calendario_ocupacion", { p_desde: hoy, p_hasta: hoy }),
    supabase
      .from("citas_estetica")
      .select("id, inicio, estado, perros(nombre), servicios(nombre)")
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
        servicio_nombre: servicio?.nombre ?? "—",
        fecha_local: fechaLocalDeInstante(c.inicio as string, zona),
      };
    })
    .filter((c) => c.fecha_local === hoy && c.estado !== "cancelada");

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
      if (contrato) {
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

  // Gastos del local vencidos o por vencer (con montos: solo para quien
  // tiene «Gastos»). La lista a la que manda va del vencimiento más viejo
  // al más nuevo.
  const sesion = await obtenerSesionConRol();
  if (tienePermiso(sesion, "gastos")) {
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

  const fechasComprobantes = (comprobantes ?? []).map((c) => c.created_at as string);
  const comprobantesPorRevisar = fechasComprobantes.length;
  if (comprobantesPorRevisar > 0) {
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
  if (contratosRegenerar > 0) {
    atencion.push({
      clave: "contratos-regenerar",
      texto: `${contratosRegenerar} ${contratosRegenerar === 1 ? "contrato firmado hay" : "contratos firmados hay"} que volver a generar`,
      detalle: "Se firmaron con campos sin llenar en el PDF; el firmado se conserva",
      href: "/recepcion/contratos",
      ...masViejo(fechasRegenerar, hoy, zona),
    });
  }
  if (contratosFirmar > 0) {
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
  if (pendientesVincular > 0) {
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

  const ocupacionDiurna = hoyCal ? `${hoyCal.ocupado_diurno}${hoyCal.cupo_diurno != null ? ` / ${hoyCal.cupo_diurno}` : ""}` : "—";
  const ocupacionNocturna = hoyCal ? `${hoyCal.ocupado_nocturno}${hoyCal.cupo_nocturno != null ? ` / ${hoyCal.cupo_nocturno}` : ""}` : "—";

  const cifras = (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Cifra etiqueta="Llegan hoy" valor={String(llegan.length)} />
      <Cifra etiqueta="Se van hoy" valor={String(seVan.length)} />
      <Cifra etiqueta="Adentro ahora" valor={String(dentro.length)} />
      <Cifra
        etiqueta="Ocupación de día"
        valor={ocupacionDiurna}
        sub={hoyCal?.cupo_estado === "sin_configurar" ? "Cupo sin configurar" : "toda la casa"}
      />
      <Cifra etiqueta="Ocupación de noche" valor={ocupacionNocturna} sub="perros de hotel" />
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
          <BotonNuevoCliente tipo="guarderia_hotel" />
          <Link href="/guarderia/checkin">
            <Button type="button" variante="secundario">
              Check-in
            </Button>
          </Link>
          <Link href="/guarderia/checkout">
            <Button type="button" variante="secundario">
              Check-out
            </Button>
          </Link>
          <Link href="/estetica/nueva">
            <Button type="button" variante="secundario">
              Nueva cita de estética
            </Button>
          </Link>
          <Link href="/guarderia/nueva">
            <Button type="button">Nueva reserva</Button>
          </Link>
        </div>
      </div>

      {cifras}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {listaAtencion}

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
                <li key={c.id}>
                  <Link
                    href={`/estetica/${c.id}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-n-200 bg-white px-3 py-2 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
                  >
                    <span>
                      <span className="tabular-nums font-semibold text-n-900">{c.hora}</span>{" "}
                      <span className="font-semibold text-n-900">{c.perro_nombre}</span>
                      <span className="text-xs text-n-500"> · {c.servicio_nombre}</span>
                    </span>
                    <span className="text-xs text-n-500">{ETIQUETA_ESTADO_CITA[c.estado] ?? c.estado}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

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
    </div>
  );
}
