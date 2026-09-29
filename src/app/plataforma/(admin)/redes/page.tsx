import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { formatearFecha, horaLocalDeInstante, horaLocalParaInput } from "@/lib/formato";
import { credencialesMeta } from "@/lib/redes/meta";
import { estadoTikTok, REDIRECT_TIKTOK } from "@/lib/redes/tiktok";
import { TITULOS } from "@/lib/redes/serie";
import { cancelar, cargarSerie, conectarTikTok, linkTikTok, pausar, probar, publicarAhora, reprogramar, resolver } from "./acciones";

// Las acciones de esta pantalla pueden correr el publicador (Meta tarda).
export const maxDuration = 300;

type Fila = {
  id: string; video: string; red: string; formato: string; archivo: string; programada_at: string; pie: string; estado: string;
  intentos: number; proximo_intento_at: string | null; url: string | null; error: string | null; publicada_at: string | null; prueba: boolean;
};

const ZONA = "America/Mexico_City";
const RED: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };
const FORMATO: Record<string, string> = { reel: "reel 9:16", muro: "muro 16:9", borrador: "borrador 9:16" };
const ESTADO: Record<string, { texto: string; clase: string }> = {
  programada: { texto: "Programada", clase: "bg-morado-suave text-morado" },
  publicando: { texto: "Publicando", clase: "bg-ambar-suave text-ambar-oscuro" },
  reintentar: { texto: "Reintenta", clase: "bg-ambar-suave text-ambar-oscuro" },
  publicada: { texto: "Publicada", clase: "bg-menta-suave text-menta-oscuro" },
  fallida: { texto: "Falló", clase: "bg-coral-suave text-coral-oscuro" },
  revisar: { texto: "Revisar", clase: "bg-coral-suave text-coral-oscuro" },
  cancelada: { texto: "Cancelada", clase: "bg-n-100 text-n-600" },
};

// Publicación automática de los videos de PeluDesk (src/lib/redes). La
// tarea de Vercel corre cada hora (minuto 3) y publica lo que ya toca.
export default async function RedesPlataforma() {
  const { supabase } = await exigirPlataforma();
  const [{ data, error }, { data: ajustes }, tiktok] = await Promise.all([
    supabase.from("redes_publicaciones").select("id, video, red, formato, archivo, programada_at, pie, estado, intentos, proximo_intento_at, url, error, publicada_at, prueba").is("deleted_at", null).order("programada_at").order("red"),
    supabase.from("redes_ajustes").select("clave, valor").is("deleted_at", null),
    estadoTikTok().catch(() => ({ conectada: false, cuenta: null, app: false })),
  ]);
  const filas = (data ?? []) as Fila[];
  const serie = filas.filter((f) => !f.prueba);
  const pruebas = filas.filter((f) => f.prueba).slice(-6).reverse();
  const pausado = (ajustes ?? []).some((a) => a.clave === "pausa" && a.valor === "si");
  const meta = credencialesMeta();
  const porDia = Map.groupBy(serie, (f) => formatearFecha(f.programada_at, ZONA));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Redes</h1>
        <p className="mt-1 text-n-600">
          Los videos de PeluDesk salen solos en Facebook, Instagram y TikTok (a TikTok llegan como borrador y se publican desde la app).
          Cada hora se publica lo que ya toca; cada publicación y cada falla avisan en Telegram.
        </p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar el calendario">{error.message}</Alert>}
      {pausado && <Alert variante="advertencia" titulo="Publicación en pausa">No sale nada hasta que la reanudes.</Alert>}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Conexiones</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            <li>Facebook: {meta.token && meta.pagina ? "lista" : <b className="text-coral-oscuro">faltan PELUDESK_META_TOKEN y PELUDESK_FB_PAGE_ID</b>}</li>
            <li>Instagram: {meta.token && meta.ig ? "lista" : <b className="text-coral-oscuro">faltan PELUDESK_META_TOKEN y PELUDESK_IG_USER_ID</b>}</li>
            <li>TikTok: {!tiktok.app ? <b className="text-coral-oscuro">faltan TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET</b> : tiktok.conectada ? `conectada${tiktok.cuenta ? ` (${tiktok.cuenta})` : ""}` : <b className="text-coral-oscuro">sin conectar</b>}</li>
          </ul>
          <div className="mt-4 flex flex-col gap-3 border-t border-n-200 pt-4">
            <p className="text-sm text-n-600">Conectar TikTok: abre el link con la sesión de la cuenta de PeluDesk, autoriza, y pega aquí el código que te enseña la página ({REDIRECT_TIKTOK}).</p>
            <FormularioPlataforma accion={linkTikTok} textoBoton="Pedir link de TikTok" variante="secundario" />
            <FormularioPlataforma accion={conectarTikTok} textoBoton="Conectar TikTok" reiniciar>
              <Field label="Código de TikTok" name="code" autoComplete="off" required />
            </FormularioPlataforma>
          </div>
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Calendario</h2>
          <FormularioPlataforma accion={cargarSerie} textoBoton="Cargar el calendario de la serie" variante="secundario" />
          <FormularioPlataforma accion={pausar.bind(null, !pausado)} textoBoton={pausado ? "Reanudar la publicación" : "Pausar todo"} variante={pausado ? "exito" : "peligro"} />
          <div className="border-t border-n-200 pt-4">
            <p className="text-sm text-n-600">Prueba de conexión: Facebook sube un video sin publicar y lo borra; Instagram deja un contenedor que nunca se publica; TikTok deja un borrador (bórralo en la app).</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["facebook", "instagram", "tiktok"] as const).map((r) => (
                <FormularioPlataforma key={r} accion={probar.bind(null, r)} textoBoton={`Probar ${RED[r]}`} variante="secundario" />
              ))}
            </div>
          </div>
        </div>
      </section>

      {pruebas.length > 0 && (
        <section className="rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Últimas pruebas</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {pruebas.map((p) => (
              <li key={p.id}>
                {horaLocalDeInstante(p.programada_at, ZONA)} · {RED[p.red]} · <Estado e={p.estado} /> {p.error && <span className="text-n-600">— {p.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {serie.length === 0 ? (
        <Alert variante="info" titulo="Todavía no hay calendario">Cárgalo con «Cargar el calendario de la serie».</Alert>
      ) : (
        [...porDia].map(([dia, lista]) => (
          <section key={dia} className="rounded-lg border border-n-200 bg-white p-5">
            <h2 className="text-lg font-bold text-n-900">{dia} · {horaLocalDeInstante(lista[0].programada_at, ZONA)}</h2>
            <p className="text-n-600">{TITULOS[lista[0].video] ?? lista[0].video}</p>
            <ul className="mt-3 flex flex-col divide-y divide-n-200">
              {lista.map((f) => (
                <li key={f.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-n-900">{RED[f.red]}</b>
                    <span className="text-sm text-n-600">{FORMATO[f.formato]}</span>
                    <Estado e={f.estado} />
                    {f.intentos > 0 && <span className="text-xs text-n-600">{f.intentos} intento(s)</span>}
                    {f.estado === "reintentar" && f.proximo_intento_at && <span className="text-xs text-n-600">reintenta {horaLocalDeInstante(f.proximo_intento_at, ZONA)}</span>}
                    {f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-morado underline">Ver</a>}
                  </div>
                  {f.error && <p className="text-sm text-coral-oscuro">{f.error}</p>}
                  <details className="text-sm text-n-700">
                    <summary className="cursor-pointer text-n-600">Pie y acciones</summary>
                    <p className="mt-2 whitespace-pre-line rounded bg-n-50 p-3">{f.pie}</p>
                    {["programada", "reintentar", "fallida"].includes(f.estado) && (
                      <div className="mt-3 flex flex-col gap-3">
                        <FormularioPlataforma accion={reprogramar.bind(null, f.id)} textoBoton="Reprogramar" variante="secundario">
                          <Field label="Fecha y hora (Ciudad de México)" name="fecha" type="datetime-local" defaultValue={horaLocalParaInput(f.programada_at, ZONA)} required />
                        </FormularioPlataforma>
                        <div className="flex flex-wrap gap-2">
                          <FormularioPlataforma accion={publicarAhora.bind(null, f.id)} textoBoton="Publicar ahora" />
                          <FormularioPlataforma accion={cancelar.bind(null, f.id)} textoBoton="Cancelar" variante="peligro" />
                        </div>
                      </div>
                    )}
                    {["revisar", "fallida"].includes(f.estado) && (
                      <div className="mt-3 flex flex-col gap-3 border-t border-n-200 pt-3">
                        <FormularioPlataforma accion={resolver.bind(null, f.id, true)} textoBoton="Sí salió: anotarla" variante="exito">
                          <Field label="Enlace de la publicación (opcional)" name="url" type="url" />
                        </FormularioPlataforma>
                        {f.estado === "revisar" && <FormularioPlataforma accion={resolver.bind(null, f.id, false)} textoBoton="No salió: volver a mandarla" variante="secundario" />}
                      </div>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Estado({ e }: { e: string }) {
  const s = ESTADO[e] ?? { texto: e, clase: "bg-n-100 text-n-600" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.clase}`}>{s.texto}</span>;
}
