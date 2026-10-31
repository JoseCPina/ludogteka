import Link from "next/link";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { estadoDePlantillas, metaPlantillasConfigurada, ultimaSincronizacion, type EstadoEnMeta, type FilaPlantilla } from "@/lib/whatsapp/plantillas";
import { mandarPlantilla, revisarPlantillas } from "./acciones";

const ZONA = "America/Mexico_City";
const TEXTO_ESTADO: Record<string, string> = {
  APPROVED: "Aprobada",
  PENDING: "En revisión",
  IN_APPEAL: "En apelación",
  REJECTED: "Rechazada",
  PAUSED: "Pausada por Meta",
  DISABLED: "Deshabilitada",
  NO_EXISTE: "No existe en Meta",
};
const CLASE_ESTADO: Record<string, string> = {
  APPROVED: "bg-verde-suave text-verde-oscuro",
  PENDING: "bg-ambar-suave text-ambar-oscuro",
  IN_APPEAL: "bg-ambar-suave text-ambar-oscuro",
  NO_EXISTE: "bg-n-100 text-n-700",
};
const fecha = (iso: string) => new Date(iso).toLocaleString("es-MX", { timeZone: ZONA, dateStyle: "medium", timeStyle: "short" });

// Las plantillas de WhatsApp de PeluDesk: el catálogo del código con su estado en Meta y «Mandar a aprobar» para las
// que faltan. Todo corre en Vercel, donde viven WHATSAPP_TOKEN y PELUDESK_WABA_ID (son «Sensitive»: no se bajan).
export default async function PlantillasWhatsAppPlataforma() {
  await exigirPlataforma();
  const configurada = metaPlantillasConfigurada();
  let filas: FilaPlantilla[] = [];
  let otras: EstadoEnMeta[] = [];
  let errorMeta: string | null = null;
  if (configurada) {
    try {
      ({ filas, otras } = await estadoDePlantillas());
    } catch (e) {
      errorMeta = e instanceof Error ? e.message : "Meta no contestó.";
    }
  }
  const ultima = await ultimaSincronizacion();
  const faltan = filas.filter((f) => f.estado === "NO_EXISTE");
  const aprobadas = filas.filter((f) => f.estado === "APPROVED").length;
  const conProblema = filas.filter((f) => ["REJECTED", "PAUSED", "DISABLED"].includes(f.estado) || (f.estado === "APPROVED" && f.categoriaMeta && f.categoriaMeta !== f.categoria));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Plantillas de WhatsApp</h1>
        <p className="mt-1 text-n-600">
          Las plantillas con las que PeluDesk escribe desde su número fuera de la ventana de 24 horas: su texto vive en el código (una fuente por plantilla) y Meta las tiene que
          aprobar antes de que el sistema las mande. Una tarea diaria manda sola las que falten; aquí se ve el estado y se mandan a mano.
        </p>
      </div>

      {!configurada && <Alert variante="error" titulo="Faltan variables">Sin WHATSAPP_TOKEN y PELUDESK_WABA_ID en Vercel no se puede consultar a Meta.</Alert>}
      {errorMeta && <Alert variante="error" titulo="Meta no contestó">{errorMeta}</Alert>}
      {configurada && !errorMeta && (
        <Alert variante={faltan.length || conProblema.length ? "info" : "exito"} titulo={`${aprobadas} de ${filas.length} aprobadas`}>
          {faltan.length ? `${faltan.length} todavía no existen en Meta. ` : ""}
          {conProblema.length ? `Con problema: ${conProblema.map((f) => f.nombre).join(", ")}. ` : ""}
          {ultima ? `Última revisión guardada: ${fecha(ultima.revisado_at)}.` : "La tarea diaria todavía no ha corrido."}
        </Alert>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-start">
        <FormularioPlataforma accion={revisarPlantillas.bind(null, false)} textoBoton="Revisar el estado en Meta" variante="secundario" />
        <FormularioPlataforma accion={revisarPlantillas.bind(null, true)} textoBoton={`Mandar a aprobar las que faltan${faltan.length ? ` (${faltan.length})` : ""}`} variante="primario" />
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-4">
        <h2 className="text-lg font-bold text-n-900">Las plantillas del código ({filas.length})</h2>
        <ul className="mt-3 divide-y divide-n-200">
          {filas.map((f) => (
            <li key={f.nombre} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between" data-plantilla={f.nombre} data-estado={f.estado}>
              <div className="min-w-0">
                <p className="font-semibold text-n-900">
                  {f.nombre} <span className="font-normal text-n-500">[{f.idioma}] · pedida como {f.categoria}</span>
                </p>
                <p className="text-sm text-n-700">{f.uso}</p>
                <p className="text-xs text-n-500">Texto en {f.fuente}</p>
                <p className="mt-1 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CLASE_ESTADO[f.estado] ?? "bg-coral-suave text-coral-oscuro"}`}>{TEXTO_ESTADO[f.estado] ?? f.estado}</span>
                  {f.categoriaMeta && f.categoriaMeta !== f.categoria && <span className="ml-2 font-semibold text-coral-oscuro">Meta la clasificó como {f.categoriaMeta}: el sistema no la manda.</span>}
                  {f.motivo && <span className="ml-2 text-n-700">Motivo: {f.motivo}</span>}
                  {f.calidad && <span className="ml-2 text-n-600">Calidad: {f.calidad}</span>}
                </p>
              </div>
              {f.estado === "NO_EXISTE" && <FormularioPlataforma accion={mandarPlantilla.bind(null, f.nombre)} textoBoton="Mandar a aprobar" variante="secundario" className="sm:w-56" />}
              {f.estado === "REJECTED" && <p className="text-sm text-n-600 sm:w-56">Rechazada: para volver a intentarlo se crea una _v2 con otro texto en su fuente.</p>}
            </li>
          ))}
          {filas.length === 0 && <li className="py-3 text-n-500">Sin datos de Meta.</li>}
        </ul>
      </section>

      {otras.length > 0 && (
        <section className="rounded-lg border border-n-200 bg-white p-4">
          <h2 className="text-lg font-bold text-n-900">Otras plantillas en la cuenta ({otras.length})</h2>
          <p className="mt-1 text-sm text-n-600">Meta las tiene y el código ya no las usa (versiones anteriores, pruebas). Se retiran en Meta cuando la vigente esté aprobada.</p>
          <ul className="mt-2 text-sm text-n-700">
            {otras.map((o) => (
              <li key={`${o.nombre}-${o.idioma}`} className="py-0.5">
                {o.nombre} [{o.idioma}] · {o.categoria ?? "?"} · {TEXTO_ESTADO[o.estado] ?? o.estado}
                {o.motivo ? ` · ${o.motivo}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-n-600">
        Las cuatro del seguimiento de pruebas también se ven, con sus envíos, en <Link href="/plataforma/seguimiento" className="text-morado underline">Seguimiento de pruebas</Link>; los recordatorios automáticos, en{" "}
        <Link href="/plataforma/recordatorios" className="text-morado underline">Recordatorios de WhatsApp</Link>.
      </p>
    </div>
  );
}
