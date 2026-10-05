import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { formatearFecha } from "@/lib/formato";
import { PLANTILLAS } from "@/lib/seguimiento/plantillas";
import { pausarSeguimiento, revisarPlantillas } from "./acciones";

type Resumen = {
  pausa: boolean;
  plantillas: { nombre: string; etapa: string; categoria: string | null; estado: string; motivo_rechazo: string | null; consultada_at: string | null }[];
  etapas: Record<string, { enviados: number; fallidos: number; enviando: number }>;
  respuestas: { total: number; ayuda: number; plan: number; ahora_no: number; baja: number; otras: number };
  bajas: number;
  negocios_detenidos: number;
  recientes: { nombre: string; slug: string; etapa: string; plantilla: string; estado: string; intentos: number; error: string | null; cuando: string }[];
};

const ZONA = "America/Mexico_City";
const ETAPA: Record<string, string> = { dia5: "Día 5", dia10: "Día 10", dia15: "Día 15" };
const ESTADO_META: Record<string, { texto: string; clase: string }> = {
  APPROVED: { texto: "Aprobada", clase: "bg-menta-suave text-menta-oscuro" },
  PENDING: { texto: "En revisión de Meta", clase: "bg-ambar-suave text-ambar-oscuro" },
  IN_APPEAL: { texto: "En apelación", clase: "bg-ambar-suave text-ambar-oscuro" },
  REJECTED: { texto: "Rechazada", clase: "bg-coral-suave text-coral-oscuro" },
  PAUSED: { texto: "Pausada por Meta", clase: "bg-coral-suave text-coral-oscuro" },
  DISABLED: { texto: "Desactivada por Meta", clase: "bg-coral-suave text-coral-oscuro" },
  SIN_ENVIAR: { texto: "Sin enviar a Meta", clase: "bg-n-100 text-n-700" },
  ERROR_AL_ENVIAR: { texto: "Meta no la recibió", clase: "bg-coral-suave text-coral-oscuro" },
};

// El seguimiento por WhatsApp a negocios en prueba (src/lib/seguimiento): qué
// plantillas están aprobadas, cuántos mensajes salieron por etapa, respuestas,
// bajas y errores, y el interruptor que pausa todo. Solo la plataforma lo ve.
export default async function SeguimientoPlataforma() {
  const { supabase } = await exigirPlataforma();
  const { data, error } = await supabase.rpc("plataforma_seguimiento_resumen");
  const r = (data ?? null) as Resumen | null;
  const estadoDe = (nombre: string) => r?.plantillas.find((p) => p.nombre === nombre);
  const fecha = (iso: string | null) => (iso ? formatearFecha(iso, ZONA) : "—");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Seguimiento de pruebas</h1>
        <p className="mt-1 text-n-600">
          Mensajes de WhatsApp a quien se registró en peludesk.mx/registro: día 5, día 10 y día 15 desde el registro, lunes a sábado de 10:00 a
          19:00 en la hora de su negocio. Solo negocios reales en prueba (ni el demo, ni suspendidos, ni quien ya contrató). Nada sale con una
          plantilla que Meta no haya aprobado. Se detiene para un negocio si contesta lo que sea, pulsa «Ahora no», pide baja o contrata.
        </p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar el seguimiento">{error.message}</Alert>}
      {r?.pausa && <Alert variante="advertencia" titulo="Seguimiento en pausa">No sale ningún mensaje hasta que lo reanudes.</Alert>}

      <section className="flex flex-wrap gap-3">
        {["dia5", "dia10", "dia15"].map((e) => (
          <div key={e} className="rounded-lg border border-n-200 bg-white px-4 py-3">
            <p className="text-sm text-n-600">{ETAPA[e]}: mensajes enviados</p>
            <p className="text-2xl font-bold tabular-nums text-n-900">{r?.etapas?.[e]?.enviados ?? 0}</p>
            <p className="text-xs text-n-600">{r?.etapas?.[e]?.fallidos ?? 0} con error{(r?.etapas?.[e]?.enviando ?? 0) > 0 ? ` · ${r?.etapas?.[e]?.enviando} sin confirmar` : ""}</p>
          </div>
        ))}
        <div className="rounded-lg border border-n-200 bg-white px-4 py-3">
          <p className="text-sm text-n-600">Respuestas</p>
          <p className="text-2xl font-bold tabular-nums text-n-900">{r?.respuestas.total ?? 0}</p>
          <p className="text-xs text-n-600">
            {r?.respuestas.ayuda ?? 0} «Necesito ayuda» · {r?.respuestas.plan ?? 0} «Elegir un plan» · {r?.respuestas.ahora_no ?? 0} «Ahora no» · {r?.respuestas.otras ?? 0} otras
          </p>
        </div>
        <div className="rounded-lg border border-n-200 bg-white px-4 py-3">
          <p className="text-sm text-n-600">Bajas (para siempre)</p>
          <p className="text-2xl font-bold tabular-nums text-n-900">{r?.bajas ?? 0}</p>
          <p className="text-xs text-n-600">{r?.negocios_detenidos ?? 0} negocios con el seguimiento detenido</p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Envío</h2>
          <FormularioPlataforma
            accion={pausarSeguimiento.bind(null, !r?.pausa)}
            textoBoton={r?.pausa ? "Reanudar el seguimiento" : "Pausar todo el seguimiento"}
            variante={r?.pausa ? "exito" : "peligro"}
          />
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Plantillas en Meta</h2>
          <FormularioPlataforma accion={revisarPlantillas.bind(null, false)} textoBoton="Revisar el estado en Meta" variante="secundario" />
          <FormularioPlataforma accion={revisarPlantillas.bind(null, true)} textoBoton="Enviar a revisión las que falten" variante="secundario" />
        </div>
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Las 4 plantillas</h2>
        <ul className="mt-3 flex flex-col divide-y divide-n-200">
          {PLANTILLAS.map((p) => {
            const g = estadoDe(p.nombre);
            const e = ESTADO_META[g?.estado ?? "SIN_ENVIAR"] ?? { texto: g?.estado ?? "", clase: "bg-n-100 text-n-700" };
            return (
              <li key={p.nombre} className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-n-900">
                    {p.nombre} <span className="text-sm font-normal text-n-600">· {ETAPA[p.etapa]}{p.variante === "perfil" ? " (perfil completo)" : p.variante === "sin_perfil" ? " (perfil sin completar)" : ""}</span>
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${e.clase}`}>{e.texto}</span>
                </div>
                <p className="text-sm text-n-600">
                  Categoría {g?.categoria ?? p.categoria} · consultada {fecha(g?.consultada_at ?? null)}
                  {g?.estado !== "APPROVED" ? " · mientras no esté aprobada, esta etapa espera sin errores" : ""}
                </p>
                {g?.motivo_rechazo && <p className="text-sm text-coral-oscuro">Motivo: {g.motivo_rechazo}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Últimos envíos</h2>
        {(r?.recientes ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-n-600">Todavía no ha salido ninguno.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-n-200">
            {r!.recientes.map((x) => (
              <li key={`${x.slug}-${x.etapa}`} className="flex flex-col gap-1 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-n-900">{x.nombre} <span className="font-normal text-n-600">· {ETAPA[x.etapa]} · {x.plantilla}</span></span>
                  <span className={x.estado === "fallido" ? "font-semibold text-coral-oscuro" : x.estado === "enviado" ? "text-menta-oscuro" : "text-ambar-oscuro"}>
                    {x.estado === "enviado" ? "Enviado" : x.estado === "fallido" ? `Falló${x.intentos > 1 ? " (2 intentos)" : ""}` : "Enviando"} · {fecha(x.cuando)}
                  </span>
                </div>
                {x.error && <p className="text-coral-oscuro">{x.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
