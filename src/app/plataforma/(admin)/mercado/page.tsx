import Link from "next/link";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { TablaResponsiva } from "@/components/ui/tabla-responsiva";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { GIROS_MERCADO, SERVICIOS_MERCADO, pesosMercado, servicioMercado, slugDe, type GiroMercado } from "@/lib/mercado/catalogo";
import { CIUDADES_MERCADO } from "@/lib/mercado/ciudades";
import { ciudadesConDatos, rangoDe } from "@/lib/mercado/rangos";

export const maxDuration = 60;
const ZONA = "America/Mexico_City";

type Resumen = {
  total: number;
  invalidos: number;
  ultima_fecha: string | null;
  por_fuente: { fuente: string; n: number; validos: number }[];
  por_giro: { giro: string; n: number }[];
  por_servicio: { giro: string; servicio: string; n: number }[];
  por_ciudad: { ciudad: string; estado: string; n: number }[];
  prospectos_con_web: { giro: string; n: number }[];
  ciudades_con_pagina: number;
};
type Corrida = { id: string; fuente: string; origen: string; estado: string; inicio_at: string; fin_at: string | null; revisados: number; encontrados: number; insertados: number; costo_ia_mxn: number; gasto_usd: number; errores: number; error: string | null; detalle: Record<string, unknown> };

const FUENTE: Record<string, string> = { sitio_web: "Sitios web de prospectos", resenas_google: "Reseñas de Google", doctoralia: "Doctoralia", cuidadores: "Plataformas de cuidadores", negocio_peludesk: "Negocios de PeluDesk (autorizados)", herramienta: "Capturado en la herramienta", reporte_mensual: "Reporte mensual" };
const n = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("es-MX");
const REFERENCIA: { giro: GiroMercado; servicio: string; talla: "mediano" | null }[] = [{ giro: "estetica", servicio: "bano", talla: "mediano" }, { giro: "hotel", servicio: "noche_hotel", talla: null }, { giro: "veterinaria", servicio: "consulta", talla: null }];
const CIUDADES_REFERENCIA = ["San Luis Potosí", "Guadalajara", "Ciudad de México"];

// El Índice PeluDesk de precios por dentro: cuántos precios hay y de dónde, las corridas de recolección y los rangos de
// referencia. Solo la administración de PeluDesk; los datos se cargan con scripts/mercado (desde la computadora) y la
// tarea mensual /api/cron/mercado.
export default async function MercadoPlataforma() {
  const { supabase } = await exigirPlataforma();
  const [{ data: res, error }, { data: corridas }] = await Promise.all([
    supabase.rpc("precios_mercado_resumen"),
    supabase.from("precios_mercado_corridas").select("id, fuente, origen, estado, inicio_at, fin_at, revisados, encontrados, insertados, costo_ia_mxn, gasto_usd, errores, error, detalle").is("deleted_at", null).order("inicio_at", { ascending: false }).limit(12),
  ]);
  const r = (res ?? { total: 0, invalidos: 0, ultima_fecha: null, por_fuente: [], por_giro: [], por_servicio: [], por_ciudad: [], prospectos_con_web: [], ciudades_con_pagina: 0 }) as Resumen;
  const referencia = await Promise.all(
    CIUDADES_REFERENCIA.flatMap((nombre) => {
      const ciudad = CIUDADES_MERCADO.find((c) => c.nombre === nombre) ?? null;
      return REFERENCIA.map(async (x) => ({ ciudad: nombre, ...x, rango: await rangoDe({ giro: x.giro, servicio: x.servicio, ciudad, talla: x.talla }) }));
    })
  );
  const conPagina = await Promise.all(GIROS_MERCADO.map(async (g) => ({ giro: g, ciudades: await ciudadesConDatos(g.clave) })));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Índice PeluDesk de precios</h1>
        <p className="mt-1 text-n-600">
          Lo que alimenta <Link href="/precios-mercado" className="font-semibold text-morado underline">peludesk.mx/precios-mercado</Link>: precios públicos de sitios web y reseñas de Google de los prospectos, Doctoralia y plataformas de cuidadores, lo que capturan las herramientas y las tarifas de negocios que lo autorizan. Los scripts de <code>scripts/mercado/</code> cargan datos desde la computadora; la tarea del día 1 mete las tarifas autorizadas y manda el reporte mensual.
        </p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos leer el resumen">{error.message}</Alert>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Precios válidos", n(r.total)],
          ["No creíbles (fuera de rango)", n(r.invalidos)],
          ["Ciudades con página (≥ 8)", n(r.ciudades_con_pagina)],
          ["Último precio", r.ultima_fecha ? formatearFecha(`${r.ultima_fecha}T12:00:00Z`, ZONA) : "—"],
        ].map(([t, v]) => (
          <div key={t} className="rounded-lg border border-n-200 bg-white p-4">
            <p className="text-sm text-n-600">{t}</p>
            <p className="text-2xl font-bold text-n-900">{v}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Por fuente</h2>
          <TablaResponsiva className="tabla-tarjetas mt-3 w-full text-sm">
            <thead><tr className="text-left text-n-600"><th className="py-1 pr-3 font-semibold">Fuente</th><th className="py-1 pr-3 text-right font-semibold">Válidos</th><th className="py-1 text-right font-semibold">Total</th></tr></thead>
            <tbody>
              {r.por_fuente.map((f) => (
                <tr key={f.fuente} className="border-t border-n-200"><td className="py-1.5 pr-3">{FUENTE[f.fuente] ?? f.fuente}</td><td className="py-1.5 pr-3 text-right tabular-nums" data-label="Válidos">{n(f.validos)}</td><td className="py-1.5 text-right tabular-nums" data-label="Total">{n(f.n)}</td></tr>
              ))}
              {r.por_fuente.length === 0 && <tr><td colSpan={3} className="py-2 text-n-600">Sin datos todavía.</td></tr>}
            </tbody>
          </TablaResponsiva>
        </div>
        <div className="rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Prospectos con sitio web, por giro</h2>
          <p className="mt-1 text-sm text-n-600">Los que la corrida de sitios puede revisar (web propia, no una red social).</p>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {r.prospectos_con_web.map((x) => (
              <li key={x.giro} className="flex justify-between border-t border-n-200 py-1.5"><span>{x.giro}</span><b className="tabular-nums">{n(x.n)}</b></li>
            ))}
          </ul>
          <h3 className="mt-5 text-sm font-bold text-n-900">Precios válidos por giro</h3>
          <ul className="mt-1 grid grid-cols-2 gap-2 text-sm">
            {r.por_giro.map((x) => (
              <li key={x.giro} className="flex justify-between border-t border-n-200 py-1.5"><span>{x.giro}</span><b className="tabular-nums">{n(x.n)}</b></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Rangos de referencia</h2>
        <p className="mt-1 text-sm text-n-600">Baño de perro mediano, noche de hotel y consulta en tres ciudades (ciudad → estado → país con menos de 8 muestras).</p>
        <TablaResponsiva className="tabla-tarjetas mt-3 w-full text-sm">
          <thead><tr className="text-left text-n-600"><th className="py-1 pr-3 font-semibold">Ciudad</th><th className="py-1 pr-3 font-semibold">Servicio</th><th className="py-1 pr-3 text-right font-semibold">p25</th><th className="py-1 pr-3 text-right font-semibold">Mediana</th><th className="py-1 pr-3 text-right font-semibold">p75</th><th className="py-1 pr-3 text-right font-semibold">Muestras</th><th className="py-1 font-semibold">Nivel</th></tr></thead>
          <tbody>
            {referencia.map((x) => (
              <tr key={`${x.ciudad}|${x.servicio}`} className="border-t border-n-200">
                <td className="py-1.5 pr-3">{x.ciudad}</td>
                <td className="py-1.5 pr-3" data-label="Servicio">{servicioMercado(x.servicio)?.nombre}{x.talla ? ` (${x.talla})` : ""}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums" data-label="p25">{x.rango.p25 != null ? pesosMercado(x.rango.p25) : "—"}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums" data-label="Mediana">{x.rango.mediana != null ? pesosMercado(x.rango.mediana) : "—"}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums" data-label="p75">{x.rango.p75 != null ? pesosMercado(x.rango.p75) : "—"}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums" data-label="Muestras">{n(x.rango.muestras)}</td>
                <td className="py-1.5" data-label="Nivel">{x.rango.nivel === "sin_datos" ? "sin datos" : `${x.rango.nivel}${x.rango.lugar ? ` (${x.rango.lugar})` : ""}`}</td>
              </tr>
            ))}
          </tbody>
        </TablaResponsiva>
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Por servicio</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {SERVICIOS_MERCADO.map((s) => {
            const x = r.por_servicio.find((y) => y.servicio === s.clave);
            return <li key={s.clave} className="flex justify-between border-t border-n-200 py-1.5"><span>{s.nombre} <span className="text-n-500">({s.giro})</span></span><b className="tabular-nums">{n(x?.n)}</b></li>;
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Ciudades con página propia</h2>
        <p className="mt-1 text-sm text-n-600">Las que juntan 8 precios o más del giro de 3 negocios distintos o más; cada una tiene su página indexable en /precios-mercado/&lt;giro&gt;/&lt;ciudad&gt;.</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {conPagina.map((g) => (
            <div key={g.giro.clave}>
              <p className="text-sm font-bold text-n-900">{g.giro.plural} ({g.ciudades.length})</p>
              <ul className="mt-1 text-sm text-n-700">
                {g.ciudades.slice(0, 30).map((c) => (
                  <li key={c.ciudad} className="flex justify-between py-0.5"><Link href={`/precios-mercado/${g.giro.clave}/${slugDe(c.ciudad)}`} className="text-morado underline">{c.ciudad}</Link><span className="tabular-nums">{n(c.muestras)}</span></li>
                ))}
                {g.ciudades.length === 0 && <li className="text-n-500">Ninguna todavía.</li>}
              </ul>
            </div>
          ))}
        </div>
        {r.por_ciudad.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-bold text-n-900">Ciudades con más precios (todos los giros)</h3>
            <p className="mt-1 text-sm text-n-700">{r.por_ciudad.slice(0, 30).map((c) => `${c.ciudad} (${n(c.n)})`).join(" · ")}</p>
          </>
        )}
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Corridas</h2>
        <p className="mt-1 text-sm text-n-600">Cada recolección: qué revisó, cuántos precios encontró e insertó, y lo que costó en IA (Anthropic) y en Google Places.</p>
        <TablaResponsiva className="tabla-tarjetas mt-3 w-full text-sm">
          <thead><tr className="text-left text-n-600"><th className="py-1 pr-3 font-semibold">Inicio</th><th className="py-1 pr-3 font-semibold">Fuente</th><th className="py-1 pr-3 font-semibold">Estado</th><th className="py-1 pr-3 text-right font-semibold">Revisados</th><th className="py-1 pr-3 text-right font-semibold">Encontrados</th><th className="py-1 pr-3 text-right font-semibold">Insertados</th><th className="py-1 pr-3 text-right font-semibold">IA (MXN)</th><th className="py-1 pr-3 text-right font-semibold">Places (USD)</th><th className="py-1 font-semibold">Errores</th></tr></thead>
          <tbody>
            {((corridas ?? []) as Corrida[]).map((c) => (
              <tr key={c.id} className="border-t border-n-200 align-top">
                <td className="py-1.5 pr-3 whitespace-nowrap">{formatearFecha(c.inicio_at, ZONA)} {horaLocalDeInstante(c.inicio_at, ZONA)}</td>
                <td className="py-1.5 pr-3" data-label="Fuente">{FUENTE[c.fuente] ?? c.fuente} <span className="text-n-500">({c.origen})</span></td>
                <td className="py-1.5 pr-3" data-label="Estado">{c.estado}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums" data-label="Revisados">{n(c.revisados)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums" data-label="Encontrados">{n(c.encontrados)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums" data-label="Insertados">{n(c.insertados)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums" data-label="IA (MXN)">{Number(c.costo_ia_mxn).toFixed(2)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums" data-label="Places (USD)">{Number(c.gasto_usd).toFixed(2)}</td>
                <td className="py-1.5 max-w-[20rem] text-n-700" data-label="Errores">{n(c.errores)}{c.error ? ` · ${c.error.slice(0, 160)}` : ""}</td>
              </tr>
            ))}
            {(corridas ?? []).length === 0 && <tr><td colSpan={9} className="py-2 text-n-600">Ninguna corrida todavía. Desde la computadora: <code>node scripts/mercado/sitios.mjs --prod</code>, <code>resenas.mjs</code>, <code>doctoralia.mjs</code>, <code>cuidadores.mjs</code>.</td></tr>}
          </tbody>
        </TablaResponsiva>
      </section>
    </div>
  );
}
