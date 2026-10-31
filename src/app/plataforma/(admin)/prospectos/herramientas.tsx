import { TablaResponsiva } from "@/components/ui/tabla-responsiva";
import { herramientaPorClave } from "@/lib/herramientas/lista";

export type FilaHerramienta = { herramienta: string; fuente: string; visitas: number; usos: number; telefonos: number; cuentas: number };

/**
 * «Herramientas» en /plataforma/prospectos: visitas, usos, teléfonos capturados y cuentas creadas por herramienta
 * pública y por fuente (utm_source; «directo» sin etiqueta). Sale de herramientas_resumen (agregado en la base).
 */
export function PanelHerramientas({ filas, error }: { filas: FilaHerramienta[]; error: string | null }) {
  const porHerramienta = new Map<string, FilaHerramienta[]>();
  for (const f of filas) porHerramienta.set(f.herramienta, [...(porHerramienta.get(f.herramienta) ?? []), f]);
  const suma = (lista: FilaHerramienta[], k: keyof Omit<FilaHerramienta, "herramienta" | "fuente">) => lista.reduce((n, x) => n + Number(x[k]), 0);
  const n = (v: number) => Number(v).toLocaleString("es-MX");
  return (
    <section className="rounded-lg border border-n-200 bg-white p-5" data-herramientas>
      <h2 className="text-lg font-bold text-n-900">Herramientas públicas</h2>
      <p className="mt-1 text-sm text-n-600">
        Por herramienta y por fuente (utm_source): visitas, usos (la herramienta dio un resultado), teléfonos capturados («Recíbelo por WhatsApp») y cuentas de prueba abiertas desde ahí o con un teléfono capturado. Últimos 90 días.
      </p>
      {error && <p className="mt-2 text-sm text-coral-oscuro">No se pudo leer: {error}</p>}
      {filas.length === 0 && !error && <p className="mt-3 text-sm text-n-600">Todavía no hay eventos.</p>}
      {filas.length > 0 && (
        <TablaResponsiva className="tabla-tarjetas mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-n-600">
              <th className="py-1 pr-3 font-semibold">Herramienta</th>
              <th className="py-1 pr-3 font-semibold">Fuente</th>
              <th className="py-1 pr-3 text-right font-semibold">Visitas</th>
              <th className="py-1 pr-3 text-right font-semibold">Usos</th>
              <th className="py-1 pr-3 text-right font-semibold">Teléfonos</th>
              <th className="py-1 text-right font-semibold">Cuentas</th>
            </tr>
          </thead>
          <tbody>
            {[...porHerramienta.entries()].map(([clave, lista]) => (
              <Fragmento key={clave} clave={clave} lista={lista} suma={suma} n={n} />
            ))}
          </tbody>
        </TablaResponsiva>
      )}
    </section>
  );
}

function Fragmento({ clave, lista, suma, n }: { clave: string; lista: FilaHerramienta[]; suma: (l: FilaHerramienta[], k: "visitas" | "usos" | "telefonos" | "cuentas") => number; n: (v: number) => string }) {
  const nombre = herramientaPorClave(clave)?.nombre ?? clave;
  return (
    <>
      <tr className="border-t border-n-200 font-semibold text-n-900">
        <td className="py-1.5 pr-3">{nombre}</td>
        <td className="py-1.5 pr-3" data-label="Fuente">Todas</td>
        <td className="py-1.5 pr-3 text-right tabular-nums" data-label="Visitas">{n(suma(lista, "visitas"))}</td>
        <td className="py-1.5 pr-3 text-right tabular-nums" data-label="Usos">{n(suma(lista, "usos"))}</td>
        <td className="py-1.5 pr-3 text-right tabular-nums" data-label="Teléfonos">{n(suma(lista, "telefonos"))}</td>
        <td className="py-1.5 text-right tabular-nums" data-label="Cuentas">{n(suma(lista, "cuentas"))}</td>
      </tr>
      {lista.length > 1 &&
        lista.map((f) => (
          <tr key={`${clave}|${f.fuente}`} className="text-n-700">
            <td className="py-1 pr-3 pl-4 text-n-500">{nombre}</td>
            <td className="py-1 pr-3" data-label="Fuente">{f.fuente}</td>
            <td className="py-1 pr-3 text-right tabular-nums" data-label="Visitas">{n(f.visitas)}</td>
            <td className="py-1 pr-3 text-right tabular-nums" data-label="Usos">{n(f.usos)}</td>
            <td className="py-1 pr-3 text-right tabular-nums" data-label="Teléfonos">{n(f.telefonos)}</td>
            <td className="py-1 text-right tabular-nums" data-label="Cuentas">{n(f.cuentas)}</td>
          </tr>
        ))}
    </>
  );
}
