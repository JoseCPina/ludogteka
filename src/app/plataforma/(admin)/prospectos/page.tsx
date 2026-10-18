import Link from "next/link";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { consultaProspectos, leerFiltros, parametros, type Prospecto } from "@/lib/prospectos/consulta";
import { ETAPAS, GIROS, textoEtapa, textoGiro } from "@/lib/prospectos/textos";
import { agregarProspecto, buscarAhora, guardarAjustes } from "./acciones";

export const maxDuration = 300;

const ZONA = "America/Mexico_City";
const POR_PAGINA = 25;

type Resumen = { total: number; clientes: number; descartados?: number; descartados_no_giro?: number; sucursales?: number; calientes?: number; con_telefono: number; con_correo: number; con_instagram: number; por_ciudad_giro: { ciudad: string; giro: string; n: number }[]; por_etapa: Record<string, number> };
type Corrida = { id: string; origen: string; estado: string; busquedas: number; resultados: number; nuevos: number; duplicados: number; clientes: number; errores: number; webs_revisadas: number; detalle: { errores?: string[] }; error: string | null; inicio_at: string };
type Ajustes = { ciudades: string[]; consultas: Record<string, string[]>; tope_busquedas_dia: number; paginas_por_consulta: number; pausado: boolean; lista_whatsapp: number; lista_instagram: number; dias_seguimiento: number; max_seguimientos: number; firma: string };

const ESTADO_CORRIDA: Record<string, string> = { corriendo: "Corriendo", terminada: "Terminada", fallida: "Falló", sin_llave: "Sin llave de Google", pausada: "En pausa" };

// CRM de prospectos de PeluDesk (etapa 1 del embudo): lo que encuentra la búsqueda diaria en Google Maps y lo
// capturado a mano. Solo la administración de PeluDesk; ningún negocio ve nada de esto.
export default async function Prospectos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await exigirPlataforma();
  const sp = await searchParams;
  const f = leerFiltros(sp);
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const [{ data: res }, { data: aj }, { data: corridas }, lista] = await Promise.all([
    supabase.rpc("prospectos_resumen"),
    supabase.from("prospeccion_ajustes").select("ciudades, consultas, tope_busquedas_dia, paginas_por_consulta, pausado, lista_whatsapp, lista_instagram, dias_seguimiento, max_seguimientos, firma").eq("id", 1).maybeSingle(),
    supabase.from("prospeccion_corridas").select("id, origen, estado, busquedas, resultados, nuevos, duplicados, clientes, errores, webs_revisadas, detalle, error, inicio_at").is("deleted_at", null).order("inicio_at", { ascending: false }).limit(8),
    consultaProspectos(supabase, f).range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
  ]);
  const resumen = (res ?? { total: 0, clientes: 0, con_telefono: 0, con_correo: 0, con_instagram: 0, por_ciudad_giro: [], por_etapa: {} }) as Resumen;
  const ajustes = (aj ?? { ciudades: [], consultas: {}, tope_busquedas_dia: 30, paginas_por_consulta: 3, pausado: false, lista_whatsapp: 15, lista_instagram: 15, dias_seguimiento: 3, max_seguimientos: 2, firma: "José" }) as Ajustes;
  const filas = (lista.data ?? []) as unknown as Prospecto[];
  const total = lista.count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const ciudades = [...new Set([...ajustes.ciudades, ...resumen.por_ciudad_giro.map((x) => x.ciudad)])].sort((a, b) => a.localeCompare(b, "es"));
  const porCiudad = new Map<string, Record<string, number>>();
  for (const x of resumen.por_ciudad_giro) porCiudad.set(x.ciudad, { ...(porCiudad.get(x.ciudad) ?? {}), [x.giro]: x.n });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Prospectos</h1>
        <p className="mt-1 text-n-600">
          Negocios que podrían usar PeluDesk. Cada día a las 7:00 (Ciudad de México) se buscan en Google Maps los giros y ciudades de los ajustes, sin
          duplicar por teléfono, web ni nombre + ciudad. Los que ya son negocios de PeluDesk se marcan y no cuentan.
        </p>
      </div>
      <Link href="/plataforma/prospectos/hoy" data-ir-hoy className="flex items-center justify-between rounded-[14px] bg-morado px-5 py-4 text-white">
        <span><b className="text-lg">Contactar hoy</b><span className="block text-sm opacity-90">La lista del día con sus mensajes listos para WhatsApp e Instagram</span></span>
        <span aria-hidden className="text-2xl">→</span>
      </Link>
      {lista.error && <Alert variante="error" titulo="No pudimos cargar los prospectos">{lista.error.message}</Alert>}
      {ajustes.pausado && <Alert variante="advertencia" titulo="Búsqueda diaria en pausa">La de las 7:00 no corre hasta que la reanudes en Ajustes. «Buscar ahora» sigue funcionando.</Alert>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Prospectos", resumen.total],
          ["Con teléfono", resumen.con_telefono],
          ["Con correo", resumen.con_correo],
          ["Con Instagram", resumen.con_instagram],
          ["Calientes", resumen.calientes ?? 0],
          ["Sucursales agrupadas", resumen.sucursales ?? 0],
          ["Descartados", resumen.descartados ?? 0],
          ["Ya son de PeluDesk", resumen.clientes],
        ].map(([t, n]) => (
          <div key={t} className="rounded-lg border border-n-200 bg-white p-4">
            <p className="text-sm text-n-600">{t}</p>
            <p className="text-2xl font-bold text-n-900">{Number(n).toLocaleString("es-MX")}</p>
          </div>
        ))}
      </section>

      {porCiudad.size > 0 && (
        <section className="rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Por ciudad y giro</h2>
          <table className="tabla-tarjetas mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-n-600">
                <th className="py-1 pr-3">Ciudad</th>
                {GIROS.map((g) => <th key={g.clave} className="py-1 pr-3 text-right">{g.texto}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...porCiudad.entries()].map(([ciudad, g]) => (
                <tr key={ciudad} className="border-t border-n-100">
                  <td className="py-1 pr-3 font-semibold text-n-900">{ciudad}</td>
                  {GIROS.map((x) => <td key={x.clave} data-label={x.texto} className="py-1 pr-3 text-right">{g[x.clave] ?? 0}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <form method="get" className="grid gap-3 sm:grid-cols-5 sm:items-end">
          <Select label="Ciudad" name="ciudad" defaultValue={f.ciudad}>
            <option value="">Todas</option>
            {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select label="Giro" name="giro" defaultValue={f.giro}>
            <option value="">Todos</option>
            {GIROS.map((g) => <option key={g.clave} value={g.clave}>{g.texto}</option>)}
          </Select>
          <Select label="Etapa" name="etapa" defaultValue={f.etapa}>
            <option value="">Todas</option>
            {ETAPAS.map((e) => <option key={e.clave} value={e.clave}>{e.texto} ({resumen.por_etapa[e.clave] ?? 0})</option>)}
          </Select>
          <Field label="Buscar" name="q" defaultValue={f.q} placeholder="Nombre, teléfono o correo" />
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-n-800">
              <input type="checkbox" name="clientes" value="1" defaultChecked={f.clientes} /> Ver los que ya son de PeluDesk
            </label>
            <button type="submit" className="rounded-md bg-n-900 px-4 py-2 text-sm font-semibold text-white">Filtrar</button>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-n-600">{total.toLocaleString("es-MX")} {total === 1 ? "resultado" : "resultados"}</span>
          <a href={`/plataforma/prospectos/excel${parametros(f)}`} className="font-semibold text-indigo-700 hover:underline" data-exportar-excel>
            Descargar en Excel
          </a>
        </div>
        {filas.length === 0 ? (
          <p className="mt-4 text-sm text-n-600">No hay prospectos con estos filtros.</p>
        ) : (
          <table className="tabla-tarjetas mt-3 w-full text-sm" data-lista-prospectos>
            <thead>
              <tr className="text-left text-n-600">
                <th className="py-2 pr-3">Negocio</th>
                <th className="py-2 pr-3">Giro</th>
                <th className="py-2 pr-3">Ciudad</th>
                <th className="py-2 pr-3">Contacto</th>
                <th className="py-2 pr-3">Google</th>
                <th className="py-2 pr-3">Etapa</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.id} className="border-t border-n-100 align-top">
                  <td className="py-2 pr-3">
                    <Link href={`/plataforma/prospectos/${p.id}`} className="font-semibold text-indigo-700 hover:underline">{p.nombre}</Link>
                    {p.negocio_cliente_id && <span className="ml-2 rounded bg-menta-suave px-1.5 text-xs font-semibold text-menta-oscuro">Ya es de PeluDesk</span>}
                    {p.etapa === "caliente" && <span className="ml-2 rounded bg-coral-suave px-1.5 text-xs font-semibold text-coral-oscuro">Caliente · {p.visitas} {p.visitas === 1 ? "visita" : "visitas"}</span>}
                    {p.descarte_motivo && <span className="block text-xs text-n-500">{p.descarte_motivo}</span>}
                    <p className="text-xs text-n-500">Alta {formatearFecha(p.created_at, ZONA)}</p>
                  </td>
                  <td data-label="Giro" className="py-2 pr-3">{textoGiro(p.giro)}</td>
                  <td data-label="Ciudad" className="py-2 pr-3">{p.ciudad}</td>
                  <td data-label="Contacto" className="py-2 pr-3">
                    {[p.telefono, p.correo, p.instagram ? "Instagram" : null].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td data-label="Google" className="py-2 pr-3">{p.calificacion != null ? `${p.calificacion} ★ (${p.resenas ?? 0})` : "—"}</td>
                  <td data-label="Etapa" className="py-2 pr-3">{textoEtapa(p.etapa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {paginas > 1 && (
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Páginas">
            {pagina > 1 ? <Link href={`/plataforma/prospectos${parametros(f, { pagina: String(pagina - 1) })}`} className="font-semibold text-indigo-700">← Anterior</Link> : <span />}
            <span className="text-n-600">Página {pagina} de {paginas}</span>
            {pagina < paginas ? <Link href={`/plataforma/prospectos${parametros(f, { pagina: String(pagina + 1) })}`} className="font-semibold text-indigo-700">Siguiente →</Link> : <span />}
          </nav>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Buscar ahora</h2>
          <p className="mt-1 text-sm text-n-600">Cada búsqueda es una llamada a Google (hasta 20 negocios). Cuenta para el crédito gratuito igual que la diaria.</p>
          <FormularioPlataforma accion={buscarAhora} textoBoton="Buscar ahora" className="mt-3">
            <Select label="Ciudad" name="ciudad" defaultValue="">
              <option value="">Las de los ajustes</option>
              {ajustes.ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select label="Giro" name="giro" defaultValue="">
              <option value="">Todos</option>
              {GIROS.filter((g) => g.clave !== "mixto").map((g) => <option key={g.clave} value={g.clave}>{g.texto}</option>)}
            </Select>
            <Field label="Búsquedas en esta corrida (1 a 60)" name="tope" type="number" min={1} max={60} step={1} defaultValue={5} required />
          </FormularioPlataforma>
        </div>
        <div className="rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Agregar a mano</h2>
          <FormularioPlataforma accion={agregarProspecto} textoBoton="Agregar prospecto" variante="secundario" className="mt-3">
            <Field label="Nombre del negocio" name="nombre" required maxLength={200} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ciudad" name="ciudad" required maxLength={80} />
              <Select label="Giro" name="giro" defaultValue="guarderia">
                {GIROS.map((g) => <option key={g.clave} value={g.clave}>{g.texto}</option>)}
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Teléfono (opcional)" name="telefono" type="tel" />
              <Field label="Correo (opcional)" name="correo" type="email" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Web (opcional)" name="web" />
              <Field label="Instagram (opcional)" name="instagram" />
            </div>
          </FormularioPlataforma>
        </div>
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Ajustes de la búsqueda diaria</h2>
        <p className="mt-1 text-sm text-n-600">
          Cada día se buscan primero las combinaciones ciudad + consulta que llevan más tiempo sin buscarse, hasta el tope. Google da 1,000 búsquedas gratis al
          mes con teléfono y web: con 30 al día no se pasa.
        </p>
        <FormularioPlataforma accion={guardarAjustes} textoBoton="Guardar ajustes" variante="secundario" className="mt-3">
          <Textarea label="Ciudades (una por renglón)" name="ciudades" rows={5} defaultValue={ajustes.ciudades.join("\n")} required />
          <div className="grid gap-3 sm:grid-cols-2">
            {GIROS.filter((g) => g.clave !== "mixto").map((g) => (
              <Textarea key={g.clave} label={`Consultas de ${g.texto.toLowerCase()} (una por renglón)`} name={`consultas_${g.clave}`} rows={3} defaultValue={(ajustes.consultas[g.clave] ?? []).join("\n")} />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tope de búsquedas por día (0 a 500)" name="tope" type="number" min={0} max={500} step={1} defaultValue={ajustes.tope_busquedas_dia} required />
            <Field label="Páginas por consulta (1 a 3, 20 negocios cada una)" name="paginas" type="number" min={1} max={3} step={1} defaultValue={ajustes.paginas_por_consulta} required />
          </div>
          <h3 className="font-bold text-n-900">Contactar hoy</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Por WhatsApp cada día" name="lista_whatsapp" type="number" min={0} max={100} step={1} defaultValue={ajustes.lista_whatsapp} required />
            <Field label="Por Instagram cada día" name="lista_instagram" type="number" min={0} max={100} step={1} defaultValue={ajustes.lista_instagram} required />
            <Field label="Días sin respuesta para el seguimiento" name="dias_seguimiento" type="number" min={1} max={30} step={1} defaultValue={ajustes.dias_seguimiento} required />
            <Field label="Seguimientos antes de dejarlo en pausa" name="max_seguimientos" type="number" min={0} max={5} step={1} defaultValue={ajustes.max_seguimientos} required />
          </div>
          <Field label="Nombre con el que se firman los mensajes" name="firma" defaultValue={ajustes.firma} required maxLength={40} />
          <label className="flex items-center gap-2 text-sm text-n-800">
            <input type="checkbox" name="pausado" value="si" defaultChecked={ajustes.pausado} /> Pausar la búsqueda diaria
          </label>
        </FormularioPlataforma>
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Últimas corridas</h2>
        {(corridas ?? []).length === 0 && <p className="mt-2 text-sm text-n-600">Todavía no ha corrido ninguna.</p>}
        <ul className="mt-2 flex flex-col divide-y divide-n-200" data-corridas>
          {((corridas ?? []) as Corrida[]).map((c) => (
            <li key={c.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-n-900">{`${formatearFecha(c.inicio_at, ZONA)} ${horaLocalDeInstante(c.inicio_at, ZONA)}`}</b>
                <span className={c.estado === "terminada" ? "text-menta-oscuro" : c.estado === "corriendo" ? "text-ambar-oscuro" : "text-coral-oscuro"}>{ESTADO_CORRIDA[c.estado] ?? c.estado}</span>
                <span className="text-n-600">· {c.origen === "cron" ? "automática" : c.origen === "script" ? "por script" : "a pedido"}</span>
              </div>
              <p className="text-n-700">
                {c.busquedas} búsquedas · {c.resultados} lugares · <b>{c.nuevos} nuevos</b> · {c.duplicados} duplicados · {c.clientes} ya de PeluDesk · {c.webs_revisadas} webs revisadas · {c.errores} errores
              </p>
              {c.error && <p className="text-coral-oscuro">{c.error}</p>}
              {(c.detalle?.errores?.length ?? 0) > 0 && (
                <details className="text-n-700">
                  <summary className="cursor-pointer text-n-600">Ver errores</summary>
                  <ul className="mt-1 list-disc pl-5">{c.detalle.errores!.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
