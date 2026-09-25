import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fechaLocalDeInstante,
  formatearDiaSemana,
  formatearFechaCalendario,
  horaLocalDeInstante,
} from "@/lib/formato";
import { whatsAppDelNegocio } from "@/lib/landing/negocio";
import { zonaActual } from "@/lib/negocio/actual";

// Las citas de estética y las estancias de guardería y hotel, tal como las
// da mis_visitas() en la base: sin precios (el dueño nunca ve información
// financiera) y solo lectura. Agendar, cambiar o cancelar sigue siendo por
// WhatsApp con recepción.
type Visita = {
  tipo: "estetica" | "estancia";
  id: string;
  perro_id: string;
  perro_nombre: string;
  servicio_nombre: string;
  categoria: string;
  unidad: string;
  inicio: string | null;
  fecha_entrada: string | null;
  fecha_salida: string | null;
  horas: number | null;
  estado: string;
};

const ACTIVAS = new Set(["reservada", "confirmada", "en_curso"]);
const MAX_HISTORIAL = 15;
// Una serie de guardería genera ocho semanas de fechas: la lista completa
// tapa todo lo demás.
const MAX_PROXIMAS = 12;

const ETIQUETA_ESTADO: Record<string, string> = {
  reservada: "Agendada",
  confirmada: "Confirmada",
  en_curso: "Está con nosotros",
  finalizada: "Terminó",
  cancelada: "Cancelada",
  no_llego: "No llegó",
};

function dia(fechaISO: string) {
  return `${formatearDiaSemana(fechaISO)} ${formatearFechaCalendario(fechaISO)}`;
}

// La fecha con la que se ordena y se decide si ya pasó.
function fechaDe(v: Visita, zona: string): string {
  return v.tipo === "estetica" ? fechaLocalDeInstante(v.inicio as string, zona) : (v.fecha_entrada as string);
}

// Por fecha, también para "en_curso": una estancia que quedó abierta
// porque nadie le hizo check-out no puede seguir diciendo "Está con
// nosotros" semanas después.
function esProxima(v: Visita, hoy: string, zona: string): boolean {
  if (!ACTIVAS.has(v.estado)) return false;
  if (v.tipo === "estetica") return fechaDe(v, zona) >= hoy;
  // El hotel sigue "próximo" hasta el día que sale; guardería es de un día.
  return v.unidad === "noche" ? (v.fecha_salida as string) >= hoy : (v.fecha_entrada as string) >= hoy;
}

function cuando(v: Visita, zona: string): string {
  if (v.tipo === "estetica") return `${dia(fechaDe(v, zona))} · ${horaLocalDeInstante(v.inicio as string, zona)}`;
  if (v.unidad === "noche") {
    const noches = Math.round(
      (Date.parse(v.fecha_salida as string) - Date.parse(v.fecha_entrada as string)) / 86_400_000
    );
    return `${dia(v.fecha_entrada as string)} al ${dia(v.fecha_salida as string)} · ${noches} ${noches === 1 ? "noche" : "noches"}`;
  }
  if (v.unidad === "hora" && v.horas) return `${dia(v.fecha_entrada as string)} · ${v.horas} ${v.horas === 1 ? "hora" : "horas"}`;
  return dia(v.fecha_entrada as string);
}

function Fila({ v, zona, enHistorial = false }: { v: Visita; zona: string; enHistorial?: boolean }) {
  const apagada = v.estado === "cancelada" || v.estado === "no_llego";
  // Ya pasó pero nadie la cerró en el mostrador: no se le dice al dueño
  // "Agendada" ni "Está con nosotros" de algo de hace semanas.
  const sinCerrar = enHistorial && ACTIVAS.has(v.estado);
  const etiqueta = sinCerrar ? "Ya pasó" : (ETIQUETA_ESTADO[v.estado] ?? v.estado);
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3">
      <span className="flex min-w-0 flex-col">
        <span className={`font-semibold ${apagada ? "text-n-500 line-through" : "text-n-900"}`}>{cuando(v, zona)}</span>
        <span className="text-sm text-n-600">
          {v.servicio_nombre} · {v.perro_nombre}
        </span>
      </span>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          sinCerrar
            ? "bg-n-100 text-n-600"
            : v.estado === "en_curso"
            ? "bg-menta-suave text-menta-oscuro"
            : apagada
              ? "bg-n-100 text-n-600"
              : ACTIVAS.has(v.estado)
                ? "bg-morado-suave text-morado"
                : "bg-menta-suave text-menta-oscuro"
        }`}
      >
        {etiqueta}
      </span>
    </li>
  );
}

export async function MisVisitas({ supabase, hoy }: { supabase: SupabaseClient; hoy: string }) {
  const zona = await zonaActual();
  const { data, error } = await supabase.rpc("mis_visitas");
  const whatsapp = await whatsAppDelNegocio("portal_citas", (n) => `Hola, ${n}. Quiero agendar o cambiar una cita de mi perro.`);
  const visitas = (data ?? []) as Visita[];

  const proximas = visitas.filter((v) => esProxima(v, hoy, zona)).sort((a, b) => fechaDe(a, zona).localeCompare(fechaDe(b, zona)) || (a.inicio ?? "").localeCompare(b.inicio ?? ""));
  const historial = visitas
    .filter((v) => !esProxima(v, hoy, zona))
    .sort((a, b) => fechaDe(b, zona).localeCompare(fechaDe(a, zona)) || (b.inicio ?? "").localeCompare(a.inicio ?? ""));

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold text-n-900">Citas y reservas</h2>
        <p className="mt-1 text-sm text-n-600">
          Para agendar, cambiar o cancelar,{" "}
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="font-semibold text-morado underline">
              escríbenos por WhatsApp
            </a>
          ) : (
            "escríbenos por WhatsApp"
          )}
          .
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-coral-suave px-4 py-3 text-sm text-coral-oscuro">
          No pudimos cargar tus citas. Recarga la página; si sigue igual, avísanos por WhatsApp.
        </p>
      ) : (
        <>
          <div>
            <h3 className="mb-2 font-bold text-n-800">Próximas</h3>
            {proximas.length === 0 ? (
              <p className="rounded-md border-[1.5px] border-dashed border-n-300 bg-white px-4 py-4 text-sm text-n-600">
                No tienes citas ni reservas próximas.
              </p>
            ) : (
              <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
                {proximas.slice(0, MAX_PROXIMAS).map((v) => (
                  <Fila key={v.id} v={v} zona={zona} />
                ))}
              </ul>
            )}
            {proximas.length > MAX_PROXIMAS && (
              <p className="mt-2 text-xs text-n-500">
                Y {proximas.length - MAX_PROXIMAS} más después de estas.
              </p>
            )}
          </div>

          {historial.length > 0 && (
            <div>
              <h3 className="mb-2 font-bold text-n-800">Historial</h3>
              <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
                {historial.slice(0, MAX_HISTORIAL).map((v) => (
                  <Fila key={v.id} v={v} zona={zona} enHistorial />
                ))}
              </ul>
              {historial.length > MAX_HISTORIAL && (
                <p className="mt-2 text-xs text-n-500">
                  Se muestran las {MAX_HISTORIAL} más recientes de {historial.length}.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
