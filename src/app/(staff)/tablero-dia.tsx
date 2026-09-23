import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BotonNuevoCliente } from "@/components/boton-nuevo-cliente";
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

type Atencion = { clave: string; texto: string; href: string; detalle?: string };

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
            className="flex items-center justify-between gap-3 rounded-md border border-n-200 bg-white px-3 py-2 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave"
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
  const supabase = await createSupabaseServerClient();

  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio();
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
    comprobantes,
    { data: finalizadasRecientes },
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
      .select("id, perro_id, fecha_entrada, reserva_id, perros(nombre, evaluacion_comportamiento_fecha)")
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
      .select("id", { count: "exact", head: true })
      .eq("estado", "pendiente")
      .is("deleted_at", null),
    supabase
      .from("estancias")
      .select("reserva_id, perros(nombre)")
      .eq("estado", "finalizada")
      .is("deleted_at", null)
      .gte("hora_salida_real", sumarDiasFecha(hoy, -2))
      .order("hora_salida_real", { ascending: false })
      .limit(30),
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
        hora: horaLocalDeInstante(c.inicio as string),
        estado: c.estado as string,
        perro_nombre: perro?.nombre ?? "—",
        servicio_nombre: servicio?.nombre ?? "—",
        fecha_local: fechaLocalDeInstante(c.inicio as string),
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
        .select("perro_id, etiqueta, estado")
        .in("perro_id", idsProximos)
        .in("estado", ["vencida", "sin_registro"]),
      supabase
        .from("perros_contrato_resumen")
        .select("perro_id, estado, faltantes")
        .in("perro_id", idsProximos)
        .in("estado", ["sin_contrato", "requiere_actualizacion"]),
    ]);
    const bloqueosSanitarios = new Map<string, string[]>();
    for (const s of sanitario ?? []) {
      const lista = bloqueosSanitarios.get(s.perro_id as string) ?? [];
      lista.push(`${s.etiqueta} ${s.estado === "vencida" ? "vencida" : "sin registro"}`);
      bloqueosSanitarios.set(s.perro_id as string, lista);
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
      const sanit = bloqueosSanitarios.get(perroId);
      if (sanit) {
        atencion.push({
          clave: `san-${perroId}`,
          texto: `${nombre} llega el ${cuando} con requisito sanitario pendiente`,
          detalle: sanit.join(", "),
          href: `/perros/${perroId}`,
        });
      }
      if (perro && !perro.evaluacion_comportamiento_fecha) {
        atencion.push({
          clave: `eval-${perroId}`,
          texto: `${nombre} llega el ${cuando} sin evaluación de comportamiento`,
          href: `/perros/${perroId}`,
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
      });
    }
  }

  // Cuentas con saldo de estancias que ya salieron.
  const reservasRecientes = Array.from(
    new Map((finalizadasRecientes ?? []).map((e) => [e.reserva_id as string, e])).values()
  ).slice(0, 15);
  if (reservasRecientes.length > 0) {
    const totales = await Promise.all(
      reservasRecientes.map((e) => supabase.rpc("cuenta_totales_reserva", { p_reserva_id: e.reserva_id as string }))
    );
    reservasRecientes.forEach((e, i) => {
      const fila = Array.isArray(totales[i].data) ? totales[i].data[0] : totales[i].data;
      const saldo = Number(fila?.saldo ?? 0);
      if (saldo > 0) {
        const perro = (Array.isArray(e.perros) ? e.perros[0] : e.perros) as unknown as { nombre: string } | null;
        atencion.push({
          clave: `saldo-${e.reserva_id}`,
          texto: `${perro?.nombre ?? "Reserva"} ya salió y su cuenta tiene saldo pendiente`,
          detalle: `$${saldo.toFixed(2)} por cobrar`,
          href: `/reservas/${e.reserva_id}/cobrar`,
        });
      }
    });
  }

  const comprobantesPorRevisar = comprobantes.count ?? 0;
  if (comprobantesPorRevisar > 0) {
    atencion.push({
      clave: "comprobantes",
      texto: `${comprobantesPorRevisar} ${comprobantesPorRevisar === 1 ? "comprobante sanitario espera" : "comprobantes sanitarios esperan"} revisión`,
      detalle: "Lo mandó el dueño desde su portal; no cuenta hasta que lo confirmes contra el documento",
      href: "/recepcion/comprobantes",
    });
  }

  const pendientesVincular = Array.isArray(sinVincular) ? sinVincular.length : 0;
  if (pendientesVincular > 0) {
    atencion.push({
      clave: "vincular",
      texto: `${pendientesVincular} ${pendientesVincular === 1 ? "cuenta nueva espera" : "cuentas nuevas esperan"} vincularse a su expediente`,
      href: "/vinculacion",
    });
  }
  if (!turnoAbierto || turnoAbierto.length === 0) {
    atencion.push({
      clave: "turno",
      texto: "No hay turno de caja abierto",
      detalle: "Sin turno no se puede cobrar ni vender bonos",
      href: "/caja",
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
        <p className="text-sm text-verde-oscuro">Nada pendiente por ahora.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {atencion.map((a) => (
            <li key={a.clave}>
              <Link
                href={a.href}
                className="flex flex-col rounded-md border-l-4 border-amarillo bg-white px-3 py-2 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave"
              >
                <span className="font-semibold text-n-900">{a.texto}</span>
                {a.detalle && <span className="text-xs text-n-600">{a.detalle}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  if (compacto) {
    return (
      <div className="flex flex-col gap-4">
        {cifras}
        {listaAtencion}
        <Link href="/recepcion" className="text-sm font-semibold text-azul hover:underline">
          Ver el tablero del día completo →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Hoy en Ludogteka</h1>
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
            <Link href="/estetica" className="text-xs font-semibold text-azul hover:underline">
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
                    className="flex items-center justify-between gap-3 rounded-md border border-n-200 bg-white px-3 py-2 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave"
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
