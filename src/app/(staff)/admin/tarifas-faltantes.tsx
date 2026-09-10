import Link from "next/link";
import { Alert } from "@/components/ui/alert";

export type ServicioConHuecos = { id: string; nombre: string; faltan: number };

/**
 * Precios sin capturar, en el panel de admin.
 *
 * Existe por un efecto secundario concreto: la pantalla de alta oculta las
 * tallas que el negocio marcó como "no aplica", y esa misma lógica
 * escondería una talla a la que solo se le olvidó el precio. En la matriz
 * un hueco sale alarmante; en el alta desaparecería en silencio y el
 * dueño se quedaría sin poder escoger el tamaño de su perro.
 *
 * Por eso la regla quedó partida: `no_aplica` se oculta, `sin_tarifa` se
 * sigue ofreciendo — y se reporta aquí, que es donde alguien puede
 * arreglarlo.
 */
export function TarifasFaltantes({ servicios }: { servicios: ServicioConHuecos[] }) {
  if (servicios.length === 0) {
    return (
      <p className="text-n-600">
        Todos los servicios tienen su matriz de precios completa. Nada que capturar.
      </p>
    );
  }

  return (
    <Alert variante="advertencia" titulo="Hay precios sin capturar">
      <p className="mb-2">
        Esas combinaciones no se pueden cobrar: la app las rechaza en el mostrador. Si es algo que
        el negocio no ofrece, márcalo como <strong>No aplica</strong> en vez de dejarlo vacío — así
        deja de aparecer aquí y de ofrecérsele al cliente.
      </p>
      <ul className="flex flex-col gap-1">
        {servicios.map((s) => (
          <li key={s.id}>
            <Link
              href={`/servicios/${s.id}/tarifas`}
              className="font-semibold text-azul hover:underline"
            >
              {s.nombre}
            </Link>{" "}
            — {s.faltan} {s.faltan === 1 ? "celda sin precio" : "celdas sin precio"}
          </li>
        ))}
      </ul>
    </Alert>
  );
}
