import { Alert } from "@/components/ui/alert";

// «Prueba gratis por WhatsApp» en /plataforma/prospectos: el embudo del formulario (WhatsApp Flow) que ofrece el
// bot, por fuente y por dónde se ofreció. Los conteos los hace la base (wa_flow_resumen).

export type FilaFlow = {
  fuente: string;
  punto: string;
  ofrecidos: number;
  abiertos: number;
  completados: number;
  cuentas: number;
  ya_tenian: number;
  respaldos: number;
  errores: number;
};

const FUENTES: Record<string, string> = {
  directo: "Escribió directo",
  google_places: "Prospección (Google)",
  manual: "Prospecto capturado a mano",
  anuncio_meta: "Anuncio de Meta",
};
const PUNTOS: Record<string, string> = {
  saludo: "Saludo",
  menu: "Menú, opción 1",
  precio: "Preguntó el precio",
  prueba: "Pidió la prueba",
  prospeccion: "Llegó de su página",
  anuncio: "Llegó de un anuncio",
  manual: "Envío manual",
};
const COLUMNAS = [
  ["ofrecidos", "Se le mandó"],
  ["abiertos", "Lo abrió"],
  ["completados", "Lo completó"],
  ["cuentas", "Cuentas creadas"],
  ["ya_tenian", "Ya tenía negocio"],
  ["respaldos", "Por texto"],
  ["errores", "Con error"],
] as const;

type Totales = Record<(typeof COLUMNAS)[number][0], number>;

function sumar(filas: FilaFlow[], clave: (f: FilaFlow) => string): [string, Totales][] {
  const m = new Map<string, Totales>();
  for (const f of filas) {
    const t = m.get(clave(f)) ?? { ofrecidos: 0, abiertos: 0, completados: 0, cuentas: 0, ya_tenian: 0, respaldos: 0, errores: 0 };
    for (const [c] of COLUMNAS) t[c] += Number(f[c] ?? 0);
    m.set(clave(f), t);
  }
  return [...m.entries()];
}

const pct = (n: number, de: number) => (de > 0 ? ` (${Math.round((n / de) * 100)} %)` : "");

function Tabla({ titulo, filas, nombres }: { titulo: string; filas: [string, Totales][]; nombres: Record<string, string> }) {
  return (
    <table className="tabla-tarjetas mt-3 w-full text-sm">
      <thead>
        <tr className="text-left text-n-600">
          <th className="py-1 pr-3">{titulo}</th>
          {COLUMNAS.map(([c, t]) => <th key={c} className="py-1 pr-3 text-right">{t}</th>)}
        </tr>
      </thead>
      <tbody>
        {filas.map(([k, t]) => (
          <tr key={k} className="border-t border-n-100">
            <td className="py-1 pr-3 font-semibold text-n-900">{nombres[k] ?? k}</td>
            {COLUMNAS.map(([c, nombre]) => (
              <td key={c} data-label={nombre} className="py-1 pr-3 text-right">
                {t[c].toLocaleString("es-MX")}
                {c !== "ofrecidos" && c !== "respaldos" && c !== "errores" ? pct(t[c], t.ofrecidos) : ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PanelFormularioWhatsApp({ filas, error }: { filas: FilaFlow[]; error: string | null }) {
  const total = sumar(filas, () => "total")[0]?.[1];
  return (
    <section className="rounded-lg border border-n-200 bg-white p-5" data-flow-whatsapp>
      <h2 className="text-lg font-bold text-n-900">Prueba gratis por WhatsApp</h2>
      <p className="mt-1 text-sm text-n-600">
        El formulario «Probar gratis» que manda el bot en el saludo, en la opción 1 del menú, cuando preguntan el precio o la prueba, y a quien llega de su
        página o de un anuncio. «Por texto»: el formulario no salió o no lo abrió en 10 minutos y el bot mandó el link de registro.
      </p>
      {error && <Alert variante="error" titulo="No pudimos cargar el resumen">{error}</Alert>}
      {!error && !total && <p className="mt-3 text-sm text-n-600">Todavía no se ha mandado ningún formulario.</p>}
      {total && (
        <>
          <Tabla titulo="Por fuente" filas={sumar(filas, (f) => f.fuente)} nombres={FUENTES} />
          <Tabla titulo="Dónde se ofreció" filas={sumar(filas, (f) => f.punto)} nombres={PUNTOS} />
        </>
      )}
    </section>
  );
}
