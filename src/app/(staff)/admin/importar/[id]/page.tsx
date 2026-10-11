import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { formatearFecha } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { Chip } from "@/components/ui/chip";
import type { Progreso } from "../actions";
import { AccionesImportacion } from "./acciones";

export const dynamic = "force-dynamic";

const FILAS_POR_VISTA = 200;
const ESTADOS = { preparada: "Sin terminar de subir", procesando: "En curso", completada: "Terminada", deshecha: "Deshecha", cancelada: "Cancelada" };
const ESTADO_FILA: Record<string, string> = {
  pendiente: "Pendiente",
  creada: "Creada",
  actualizada: "Actualizada",
  omitida: "Omitida",
  error: "Error",
  deshecha: "Deshecha",
};

export default async function ImportacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ver?: string }>;
}) {
  const sesion = await obtenerSesionConRol();
  if (!tienePermiso(sesion, "importar_datos")) redirect("/admin");
  const { id } = await params;
  const { ver } = await searchParams;
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("importacion_progreso", { p_id: id });
  if (error || !data) notFound();
  const p = data as Progreso;
  const filtro = ver === "errores" ? "error" : ver === "creadas" ? "creada" : ver === "actualizadas" ? "actualizada" : ver === "omitidas" ? "omitida" : null;
  let consulta = supabase
    .from("importacion_filas")
    .select("n, estado, mensaje, datos")
    .eq("importacion_id", id)
    .order("n")
    .limit(FILAS_POR_VISTA);
  if (filtro) consulta = consulta.eq("estado", filtro);
  const { data: filas } = await consulta;
  const lista = (filas ?? []) as { n: number; estado: string; mensaje: string | null; datos: Record<string, unknown> }[];

  const tabs: { clave: string; texto: string; n: number }[] = [
    { clave: "", texto: "Todas", n: p.filas },
    { clave: "creadas", texto: "Creadas", n: p.creadas },
    { clave: "actualizadas", texto: "Actualizadas", n: p.actualizadas },
    { clave: "omitidas", texto: "Omitidas", n: p.omitidas },
    { clave: "errores", texto: "Con error", n: p.errores },
  ];
  const cifras: [string, number][] = [
    ["Dueños creados", p.clientes_creados],
    ["Mascotas creadas", p.mascotas_creadas],
    ["Actualizadas", p.actualizadas],
    ["Omitidas", p.omitidas],
    ["Con error", p.errores],
    ["Por procesar", p.pendientes],
    ["Deshechas", p.deshechas],
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Link href="/admin/importar" className="text-sm font-semibold text-morado underline">
        ← Importar
      </Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">{p.nombre_archivo}</h1>
        <p className="mt-1 text-n-700">
          {formatearFecha(p.creada_at, zona)} · {p.total.toLocaleString("es-MX")} filas ·{" "}
          {p.modo === "actualizar" ? "actualizar duplicados" : "omitir duplicados"}
          {p.deshecha_at ? ` · deshecha el ${formatearFecha(p.deshecha_at, zona)}` : ""}
        </p>
        <div className="mt-2">
          <Chip tono={p.estado === "completada" ? "exito" : p.estado === "deshecha" || p.estado === "cancelada" ? "neutro" : "proceso"}>
            {ESTADOS[p.estado]}
          </Chip>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cifras.map(([t, v]) => (
          <div key={t} className="rounded-md border border-borde bg-white p-3">
            <div className="text-2xl font-bold text-n-900">{v.toLocaleString("es-MX")}</div>
            <div className="text-sm text-n-700">{t}</div>
          </div>
        ))}
      </div>

      {p.razas_sin_catalogo.length > 0 && (
        <section className="rounded-lg border border-morado/30 bg-morado-suave p-4">
          <h2 className="font-bold text-morado">Razas que quedaron como texto</h2>
          <p className="mt-1 text-n-800">
            {p.razas_sin_catalogo.map((r) => `${r.texto} (${r.cuenta})`).join(", ")}. Asígnalas al catálogo en{" "}
            <Link className="font-semibold underline" href="/perros/razas">
              Perros → Razas
            </Link>
            .
          </p>
        </section>
      )}

      <AccionesImportacion id={id} estado={p.estado} pendientes={p.pendientes} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar filas">
          {tabs.map((t) => (
            <Link
              key={t.clave}
              href={t.clave ? `/admin/importar/${id}?ver=${t.clave}` : `/admin/importar/${id}`}
              aria-current={(ver ?? "") === t.clave ? "true" : undefined}
              className={`min-h-10 rounded-full border px-3 py-2 text-sm font-semibold ${
                (ver ?? "") === t.clave ? "border-morado bg-morado text-white" : "border-borde bg-white text-n-800"
              }`}
            >
              {t.texto} ({t.n.toLocaleString("es-MX")})
            </Link>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-borde text-n-700">
                <th className="py-2 pr-2 font-semibold">Fila</th>
                <th className="py-2 pr-2 font-semibold">Dueño</th>
                <th className="py-2 pr-2 font-semibold">Mascota</th>
                <th className="py-2 font-semibold">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => (
                <tr key={f.n} className="border-b border-borde/60 align-top">
                  <td className="py-2 pr-2 text-n-700">{f.n}</td>
                  <td className="py-2 pr-2">{String(f.datos.c_nombre ?? "—")}</td>
                  <td className="py-2 pr-2">{String(f.datos.m_nombre ?? "—")}</td>
                  <td className={`py-2 ${f.estado === "error" ? "font-semibold text-coral-oscuro" : ""}`}>
                    <span className="mr-1 font-semibold">{ESTADO_FILA[f.estado] ?? f.estado}</span>
                    {f.mensaje ? `· ${f.mensaje}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lista.length === FILAS_POR_VISTA && <p className="text-sm text-n-700">Se muestran las primeras {FILAS_POR_VISTA} filas.</p>}
      </section>
    </div>
  );
}
