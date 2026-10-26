import { MaquetaRecordatorio, type DatosMaqueta } from "@/components/peludesk/maqueta-recordatorio";
import { BENEFICIOS_RECORDATORIOS, TITULO_RECORDATORIOS, type TextosRecordatorios } from "@/lib/peludesk/recordatorios";

/** El ejemplo de la landing: una estética, la cita de mañana. */
export const EJEMPLO_RECORDATORIO: DatosMaqueta = {
  negocio: "Estética Patitas",
  cliente: "Ana",
  mascota: "Rocky",
  servicio: "Baño y corte",
  dia: "jueves 29 de octubre",
  hora: "11:00",
  tipo: "estetica",
};

/**
 * La sección de los recordatorios automáticos por WhatsApp: título, maqueta animada, tres beneficios y la línea de
 * precio (de la base). La usan la landing, /veterinaria y las páginas por giro. `ejemplo` cambia los datos de la
 * maqueta (otro giro, otro negocio); `grande` es el tamaño de la landing.
 */
export function SeccionRecordatorios({
  textos,
  ejemplo = EJEMPLO_RECORDATORIO,
  id = "recordatorios",
  grande = false,
  titulo = TITULO_RECORDATORIOS,
  className = "",
}: {
  textos: TextosRecordatorios;
  ejemplo?: DatosMaqueta;
  id?: string;
  grande?: boolean;
  titulo?: string;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`t-${id}`} className={`scroll-mt-16 ${className}`}>
      <div className={`mx-auto max-w-6xl px-4 sm:px-6 ${grande ? "py-16 lg:py-24" : "py-12"}`}>
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.1em] text-menta-oscuro">Recordatorios automáticos</p>
          <h2 id={`t-${id}`} className={`mt-3 font-bold leading-tight tracking-[-0.02em] text-n-900 ${grande ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"}`}>
            {titulo}
          </h2>
          <p className="mt-3 max-w-[52ch] leading-relaxed text-n-700">
            Un día antes de cada cita o llegada, PeluDesk le escribe a tu cliente. Él contesta con un botón y tu agenda se entera sola.
          </p>
        </div>

        <MaquetaRecordatorio {...ejemplo} className="mt-10" />

        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {BENEFICIOS_RECORDATORIOS.map((b) => (
            <li key={b.titulo} className="rounded-[18px] border border-n-200 bg-white p-5">
              <p className="flex items-center gap-2 text-lg font-bold text-n-900">
                <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" className="shrink-0 text-menta-oscuro" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                </svg>
                {b.titulo}
              </p>
              <p className="mt-2 leading-snug text-n-700">{b.texto}</p>
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-[18px] bg-menta-suave px-5 py-4">
          <p className="font-semibold text-n-900">{textos.lineaPrecio}</p>
          {textos.adicional && <p className="mt-1 text-sm tabular-nums text-n-700">{textos.adicional}</p>}
          <p className="mt-1 text-sm text-n-700">Cada tipo de recordatorio se prende o se apaga en Configuración. Si tu cliente escribe BAJA, deja de recibirlos.</p>
        </div>
      </div>
    </section>
  );
}
