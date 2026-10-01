import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { horaLocalDeInstante, formatearFecha } from "@/lib/formato";
import { interpretarAjustes } from "@/lib/resumen/ajustes";
import { SECCIONES } from "@/lib/resumen/config";
import { enviarAhora, guardarAjustes, pausarResumen } from "./acciones";

type Fila = { id: string; fecha: string; estado: string; origen: string; texto: string | null; partes: number; fuentes_fallidas: string[]; snapshot: { faltan?: string[] } | null; error: string | null; veces: number; enviado_at: string | null };

const ZONA = "America/Mexico_City";

// El resumen diario de PeluDesk por Telegram (src/lib/resumen): sale cada día
// a la hora configurada con lo de ayer; esta pantalla lo ajusta y lo manda a
// pedido. Nadie sin sesión de plataforma ve ni dispara nada.
export default async function ResumenPlataforma() {
  const { supabase } = await exigirPlataforma();
  const [{ data: aj }, { data, error }] = await Promise.all([
    supabase.from("resumen_ajustes").select("clave, valor").is("deleted_at", null),
    supabase.from("resumenes_diarios").select("id, fecha, estado, origen, texto, partes, fuentes_fallidas, snapshot, error, veces, enviado_at").is("deleted_at", null).order("fecha", { ascending: false }).limit(10),
  ]);
  const ajustes = interpretarAjustes((aj ?? []) as { clave: string; valor: string }[]);
  const filas = (data ?? []) as Fila[];
  const faltan = filas.find((f) => f.snapshot?.faltan?.length)?.snapshot?.faltan ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Resumen diario</h1>
        <p className="mt-1 text-n-600">
          Cada día, a la hora que elijas (Ciudad de México), llega a la bandeja de Telegram el resumen del día anterior: atención, publicaciones,
          comentarios, chats, negocios, seguidores y campaña. No sale dos veces el mismo día.
        </p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar los resúmenes">{error.message}</Alert>}
      {ajustes.pausa && <Alert variante="advertencia" titulo="Resumen en pausa">El automático no sale hasta que lo reanudes. «Enviar ahora» sigue funcionando.</Alert>}
      {faltan.length > 0 && (
        <Alert variante="advertencia" titulo="Fuera del resumen por falta de permisos">
          <ul className="list-disc pl-5">{faltan.map((f) => <li key={f}>{f}</li>)}</ul>
        </Alert>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Enviar</h2>
          <FormularioPlataforma accion={enviarAhora} textoBoton="Enviar ahora" />
          <FormularioPlataforma accion={pausarResumen.bind(null, !ajustes.pausa)} textoBoton={ajustes.pausa ? "Reanudar el resumen" : "Pausar el resumen"} variante={ajustes.pausa ? "exito" : "peligro"} />
        </div>
        <div className="rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Ajustes</h2>
          <FormularioPlataforma accion={guardarAjustes} textoBoton="Guardar" variante="secundario" className="mt-3">
            <Field label="Hora de envío (0 a 23, Ciudad de México)" name="hora" type="number" min={0} max={23} step={1} defaultValue={ajustes.hora} required />
            <Field label="Alerta: gasto del día sin registros (pesos o más)" name="umbral_gasto" type="number" min={0} step={1} defaultValue={ajustes.umbralGasto} required />
            <Field label="Alerta: chat escalado sin contestar (horas)" name="umbral_horas" type="number" min={0.25} step={0.25} defaultValue={ajustes.umbralHoras} required />
            <fieldset className="flex flex-col gap-1 text-sm text-n-800">
              <legend className="mb-1 font-semibold">Secciones que van (Atención siempre va)</legend>
              {SECCIONES.map((s) => (
                <label key={s.clave} className="flex items-center gap-2">
                  <input type="checkbox" name="seccion" value={s.clave} defaultChecked={ajustes.secciones.includes(s.clave)} /> {s.texto}
                </label>
              ))}
            </fieldset>
          </FormularioPlataforma>
        </div>
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Últimos resúmenes</h2>
        {filas.length === 0 && <p className="mt-2 text-sm text-n-600">Todavía no se ha enviado ninguno.</p>}
        <ul className="mt-2 flex flex-col divide-y divide-n-200">
          {filas.map((f) => (
            <li key={f.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-n-900">{formatearFecha(`${f.fecha}T12:00:00-06:00`, ZONA)}</b>
                <span className={f.estado === "enviado" ? "text-menta-oscuro" : f.estado === "fallido" ? "text-coral-oscuro" : "text-ambar-oscuro"}>{f.estado === "enviado" ? "Enviado" : f.estado === "fallido" ? "Falló" : "Enviando"}</span>
                <span className="text-n-600">
                  · {f.origen === "manual" ? "a pedido" : "automático"}
                  {f.enviado_at ? ` · ${horaLocalDeInstante(f.enviado_at, ZONA)}` : ""} · {f.partes} {f.partes === 1 ? "mensaje" : "mensajes"}
                  {f.veces > 1 ? ` · enviado ${f.veces} veces` : ""}
                </span>
              </div>
              {f.fuentes_fallidas.length > 0 && <p className="text-ambar-oscuro">No se pudo leer: {f.fuentes_fallidas.join(", ")}.</p>}
              {f.error && <p className="text-coral-oscuro">{f.error}</p>}
              {f.texto && (
                <details className="mt-1 text-n-700">
                  <summary className="cursor-pointer text-n-600">Ver el texto</summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded bg-n-50 p-3 text-xs">{f.texto.replace(/<[^>]+>/g, "")}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
