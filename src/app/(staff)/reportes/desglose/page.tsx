import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fechaLocalDeInstante, formatearFechaCalendario, horaLocalDeInstante } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { TEXTO_CORTE_CIEGO, esTarjetaDeCaja, turnoAbiertoEnPeriodo } from "@/lib/caja/corte-ciego";
import {
  COLUMNAS_DESGLOSE,
  POR_PAGINA_DESGLOSE,
  etiquetaMetodos,
  tarjetaValida,
  type ColumnaDesglose,
  type Desglose,
} from "@/lib/reportes/desglose";
import { TablaResponsiva } from "@/components/ui/tabla-responsiva";

function dinero(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

const ETIQUETA_COLUMNA: Record<ColumnaDesglose, string> = {
  fecha: "Fecha y hora",
  cliente: "Cliente",
  mascota: "Mascota",
  concepto: "Concepto",
  usuario: "Registró",
  metodo: "Método",
  monto: "Monto",
  descuento: "Descuento",
};

export default async function DesglosePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; desde?: string; hasta?: string; q?: string; orden?: string; dir?: string; pagina?: string }>;
}) {
  const p = await searchParams;
  const zona = await zonaActual();
  const fechaOk = (f?: string) => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f);
  if (!tarjetaValida(p.t) || !fechaOk(p.desde) || !fechaOk(p.hasta)) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variante="error" titulo="Desglose no válido">
          Faltan la cifra o las fechas. Vuelve a Reportes y toca la cifra otra vez.
        </Alert>
        <Link href="/reportes" className="font-semibold text-morado hover:underline">← Volver a Reportes</Link>
      </div>
    );
  }
  const tarjeta = p.t;
  const desde = p.desde!;
  const hasta = p.hasta!;
  const q = (p.q ?? "").trim();
  const orden: ColumnaDesglose = (COLUMNAS_DESGLOSE as readonly string[]).includes(p.orden ?? "") ? (p.orden as ColumnaDesglose) : "fecha";
  const dir = p.dir === "asc" ? "asc" : "desc";
  const pagina = Math.max(1, Number.parseInt(p.pagina ?? "1", 10) || 1);

  const supabase = await createSupabaseServerClient();
  // Corte ciego: el dinero de caja por método de un periodo con el turno abierto no se lista (ni se pide).
  if (esTarjetaDeCaja(tarjeta) && (await turnoAbiertoEnPeriodo(supabase, desde, hasta, zona))) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variante="info" titulo="Caja por método: al cerrar el turno">
          {TEXTO_CORTE_CIEGO}
        </Alert>
        <Link href={`/reportes?desde=${desde}&hasta=${hasta}`} className="font-semibold text-morado hover:underline">← Volver a Reportes</Link>
      </div>
    );
  }
  const { data, error } = await supabase.rpc("reporte_desglose", {
    p_tarjeta: tarjeta, p_desde: desde, p_hasta: hasta, p_buscar: q || null, p_orden: orden, p_dir: dir,
    p_limite: POR_PAGINA_DESGLOSE, p_desplazamiento: (pagina - 1) * POR_PAGINA_DESGLOSE,
  });
  if (error || !data) {
    if (error) console.error("[reportes] desglose falló", { tarjeta, desde, hasta, codigo: error.code, mensaje: error.message });
    return (
      <div className="flex flex-col gap-4">
        <Alert variante="error" titulo="No pudimos cargar el desglose">
          Revisa que tengas el permiso «Reportes financieros» y que la cifra exista. Si el problema sigue, avísale al equipo técnico.
        </Alert>
        <Link href={`/reportes?desde=${desde}&hasta=${hasta}`} className="font-semibold text-morado hover:underline">← Volver a Reportes</Link>
      </div>
    );
  }
  const d = data as Desglose;
  const esDinero = d.tipo_total === "dinero";
  const paginas = Math.max(1, Math.ceil(Number(d.total_filas) / POR_PAGINA_DESGLOSE));
  const valor = (n: number) => (esDinero ? dinero(Number(n)) : String(Number(n)));

  const enlace = (cambios: Record<string, string | undefined>) => {
    const u = new URLSearchParams({ t: tarjeta, desde, hasta });
    if (q) u.set("q", q);
    if (orden !== "fecha" || dir !== "desc") { u.set("orden", orden); u.set("dir", dir); }
    if (pagina > 1) u.set("pagina", String(pagina));
    for (const [k, v] of Object.entries(cambios)) {
      if (v === undefined) u.delete(k); else u.set(k, v);
    }
    return `/reportes/desglose?${u.toString()}`;
  };
  const ordenarPor = (c: ColumnaDesglose) =>
    enlace({ orden: c, dir: orden === c && dir === "desc" ? "asc" : "desc", pagina: undefined });
  const flecha = (c: ColumnaDesglose) => (orden === c ? (dir === "asc" ? " ▲" : " ▼") : "");
  const excel = (() => {
    const u = new URLSearchParams({ t: tarjeta, desde, hasta, orden, dir });
    if (q) u.set("q", q);
    return `/api/reportes/desglose/excel?${u.toString()}`;
  })();
  const columnas = COLUMNAS_DESGLOSE;

  return (
    <div className="flex flex-col gap-5" data-desglose={tarjeta}>
      <div>
        <Link href={`/reportes?desde=${desde}&hasta=${hasta}`} className="text-sm font-semibold text-morado hover:underline">← Volver a Reportes</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">{d.titulo}</h1>
        <p className="mt-1 text-n-600">
          Del {formatearFechaCalendario(desde)} al {formatearFechaCalendario(hasta)}. Son las operaciones que forman esa cifra, con los mismos criterios del reporte.
        </p>
      </div>

      <form method="get" action="/reportes/desglose" className="flex flex-wrap items-end gap-3 rounded-lg border border-n-200 bg-white p-4">
        <input type="hidden" name="t" value={tarjeta} />
        <input type="hidden" name="desde" value={desde} />
        <input type="hidden" name="hasta" value={hasta} />
        <input type="hidden" name="orden" value={orden} />
        <input type="hidden" name="dir" value={dir} />
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor="q" className="mb-1.5 block text-sm font-semibold text-n-800">Buscar</label>
          <input
            id="q" name="q" type="search" defaultValue={q} placeholder="Cliente, mascota, concepto, quién lo registró…"
            className="min-h-12 w-full rounded-md border-[1.5px] border-n-400 px-3.5 text-base focus:border-morado focus:outline-none focus:ring-[3px] focus:ring-morado-suave"
          />
        </div>
        <Button type="submit">Buscar</Button>
        {q && <Link href={enlace({ q: undefined, pagina: undefined })} className="pb-3 text-sm font-semibold text-morado hover:underline">Quitar búsqueda</Link>}
        <a href={excel} className="pb-3 text-sm font-semibold text-morado hover:underline" data-desglose-excel>Descargar en Excel</a>
      </form>

      <div className="rounded-lg border border-n-200 bg-white p-4 text-sm text-n-700" data-desglose-resumen>
        <strong className="text-n-900" data-desglose-total-tarjeta>
          {d.signo < 0 && esDinero ? "−" : ""}{valor(Number(d.total))}
        </strong>{" "}
        en la tarjeta · {Number(d.total_filas_tarjeta)} {Number(d.total_filas_tarjeta) === 1 ? "operación" : "operaciones"}
        {q && (
          <>
            {" "}· con la búsqueda: <strong className="text-n-900" data-desglose-total-filtrado>{valor(Number(d.total_filtrado))}</strong> en {Number(d.total_filas)}
          </>
        )}
      </div>

      {d.filas.length === 0 ? (
        <p className="rounded-lg border border-n-200 bg-white p-6 text-center text-n-600">No hay operaciones{q ? " con esa búsqueda" : " en este periodo"}.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-n-200 bg-white sm:block">
            <TablaResponsiva className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr>
                  {columnas.map((c) => (
                    <th key={c} className={`border-b border-n-200 bg-n-100 px-3 py-3 text-xs font-bold uppercase tracking-wide text-n-600 ${c === "monto" || c === "descuento" ? "text-right" : "text-left"}`}>
                      <Link href={ordenarPor(c)} className="hover:underline">{c === "monto" && !esDinero ? "Cantidad" : ETIQUETA_COLUMNA[c]}{flecha(c)}</Link>
                    </th>
                  ))}
                  <th className="border-b border-n-200 bg-n-100 px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">Cuenta</th>
                </tr>
              </thead>
              <tbody className="text-n-800">
                {d.filas.map((f) => (
                  <tr key={f.id} className="align-top" data-desglose-fila>
                    <td className="whitespace-nowrap border-b border-n-200 px-3 py-2">{fechaLocalDeInstante(f.fecha, zona)} · {horaLocalDeInstante(f.fecha, zona)}</td>
                    <td className="border-b border-n-200 px-3 py-2">{f.cliente || "—"}</td>
                    <td className="border-b border-n-200 px-3 py-2">{f.mascota || "—"}</td>
                    <td className="border-b border-n-200 px-3 py-2">
                      {f.concepto || "—"}
                      {f.detalle && <span className="block text-xs text-n-500">{f.detalle}</span>}
                    </td>
                    <td className="border-b border-n-200 px-3 py-2">{f.usuario || "—"}</td>
                    <td className="border-b border-n-200 px-3 py-2">{f.metodo ? etiquetaMetodos(f.metodo) : "—"}</td>
                    <td className="whitespace-nowrap border-b border-n-200 px-3 py-2 text-right font-semibold tabular-nums">{valor(Number(f.monto))}</td>
                    <td className="whitespace-nowrap border-b border-n-200 px-3 py-2 text-right tabular-nums text-n-600">{Number(f.descuento) > 0 ? dinero(Number(f.descuento)) : "—"}</td>
                    <td className="border-b border-n-200 px-3 py-2">
                      {f.href ? <Link href={f.href} className="font-semibold text-morado hover:underline">Abrir</Link> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold text-n-900">
                  <td colSpan={6} className="px-3 py-3 text-right">{q ? "Total con la búsqueda" : "Total"}</td>
                  <td className="px-3 py-3 text-right tabular-nums" data-desglose-pie>{d.signo < 0 && esDinero ? "−" : ""}{valor(Number(q ? d.total_filtrado : d.total))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </TablaResponsiva>
          </div>

          <ul className="flex flex-col gap-3 sm:hidden">
            {d.filas.map((f) => (
              <li key={f.id} className="rounded-lg border border-n-200 bg-white p-3 text-sm" data-desglose-fila>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-n-900">{f.concepto || f.cliente || "—"}</p>
                  <p className="whitespace-nowrap font-bold tabular-nums text-n-900">{valor(Number(f.monto))}</p>
                </div>
                <p className="mt-1 text-xs text-n-600">{fechaLocalDeInstante(f.fecha, zona)} · {horaLocalDeInstante(f.fecha, zona)}</p>
                <p className="mt-1 text-n-700">
                  {[f.cliente, f.mascota].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="mt-1 text-xs text-n-600">
                  {[f.usuario && `Registró: ${f.usuario}`, f.metodo && etiquetaMetodos(f.metodo), Number(f.descuento) > 0 && `Descuento ${dinero(Number(f.descuento))}`].filter(Boolean).join(" · ")}
                </p>
                {f.detalle && <p className="mt-1 text-xs text-n-500">{f.detalle}</p>}
                {f.href && <Link href={f.href} className="mt-2 inline-block font-semibold text-morado hover:underline">Abrir la cuenta</Link>}
              </li>
            ))}
            <li className="rounded-lg bg-n-100 p-3 text-right text-sm font-bold text-n-900">
              {q ? "Total con la búsqueda" : "Total"}: {d.signo < 0 && esDinero ? "−" : ""}{valor(Number(q ? d.total_filtrado : d.total))}
            </li>
          </ul>

          {paginas > 1 && (
            <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Páginas del desglose">
              {pagina > 1 ? <Link href={enlace({ pagina: String(pagina - 1) })} className="font-semibold text-morado hover:underline">← Anterior</Link> : <span />}
              <span className="text-n-600">Página {pagina} de {paginas}</span>
              {pagina < paginas ? <Link href={enlace({ pagina: String(pagina + 1) })} className="font-semibold text-morado hover:underline">Siguiente →</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
