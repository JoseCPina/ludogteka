import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { ETIQUETA_MOTIVO_CERTIFICADO } from "@/lib/veterinaria/carnet";

export default async function Certificados() {
  const supabase = await createSupabaseServerClient();
  const hoy = hoyNegocio(await zonaActual());
  const [puede, { data }] = await Promise.all([
    vetPuede(supabase, "emitir_certificados"),
    supabase
      .from("certificados_salud")
      .select("id, numero, folio_medico, motivo, fecha_emision, vigente_hasta, estado, perros(nombre), clientes(nombre)")
      .is("deleted_at", null)
      .order("numero", { ascending: false })
      .limit(200),
  ]);
  const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">← Veterinaria</Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-n-900">Certificados de salud</h1>
            <p className="mt-1 max-w-3xl text-n-600">Los que ya se emitieron, del más reciente al más viejo. Un certificado no se edita: se anula con motivo y se emite otro.</p>
          </div>
          {puede && (
            <Link href="/veterinaria/carnet" className="inline-flex min-h-12 items-center rounded-md bg-morado px-5 text-base font-semibold text-white hover:bg-morado-oscuro">
              Emitir uno nuevo
            </Link>
          )}
        </div>
      </div>
      {(data ?? []).length === 0 ? (
        <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">Todavía no se ha emitido ningún certificado. Para emitir uno, abre el carnet de la mascota.</p>
      ) : (
        <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
          {(data ?? []).map((c) => {
            const mascota = un(c.perros as { nombre: string } | { nombre: string }[] | null);
            const dueno = un(c.clientes as { nombre: string } | { nombre: string }[] | null);
            const vencido = c.estado === "vigente" && (c.vigente_hasta as string) < hoy;
            return (
              <li key={c.id as string}>
                <Link href={`/veterinaria/certificados/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-n-50">
                  <span>
                    <span className="font-semibold text-n-900">N.º {c.numero as number} · {mascota?.nombre ?? "—"}</span>
                    <span className="block text-sm text-n-600">{dueno?.nombre ?? "—"} · {ETIQUETA_MOTIVO_CERTIFICADO[c.motivo as string] ?? c.motivo}{c.folio_medico ? ` · folio ${c.folio_medico}` : ""}</span>
                  </span>
                  <span className="text-sm text-n-700">
                    {formatearFechaCalendario(c.fecha_emision as string)} → {formatearFechaCalendario(c.vigente_hasta as string)}{" "}
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${c.estado === "anulado" ? "bg-n-100 text-n-600" : vencido ? "bg-ambar-suave text-ambar-oscuro" : "bg-menta-suave text-menta-oscuro"}`}>
                      {c.estado === "anulado" ? "Anulado" : vencido ? "Vencido" : "Vigente"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
