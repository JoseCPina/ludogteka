"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useEspera } from "@/hooks/use-espera";
import { conTope } from "@/lib/ui/espera";
import { textoFaltaDato, textoPrecioLinea, type DatoDePrecio } from "@/lib/servicios/cotizacion-linea";
import type { ResultadoCotizacion } from "@/hooks/use-cotizacion-lineas";
import { TextoConEnlaces } from "@/components/ui/texto-con-enlaces";
import { catalogoTallaPelaje, guardarTallaPelaje } from "@/lib/servicios/cotizacion-linea-actions";

type Opcion = { id: string; etiqueta: string };

/**
 * Lo que la pantalla dice del precio de una línea: el precio, o lo único que falta para saberlo con la salida ahí mismo.
 * Mientras no diga «Precio: …», la línea no se puede guardar (`lineaConPrecio`).
 */
export function PrecioDeLinea({
  perroId,
  perroNombre,
  resultado,
  onGuardado,
  parte = "todo",
}: {
  perroId: string;
  perroNombre: string;
  resultado: ResultadoCotizacion | undefined;
  onGuardado: () => void;
  // Una pantalla que pone los avisos arriba (junto a evaluación y vacunas) y el precio junto a las fechas lo pinta dos
  // veces: «aviso» solo enseña lo que bloquea y «precio» solo el precio (o «Calculando…»).
  parte?: "todo" | "aviso" | "precio";
}) {
  const esPrecio = !resultado || ("cotizacion" in resultado && resultado.cotizacion.estado === "ok");
  if ((parte === "aviso" && esPrecio) || (parte === "precio" && !esPrecio)) return null;
  if (!resultado) return <p className="mt-3 text-sm text-n-600" data-precio-linea="calculando">Calculando el precio…</p>;
  if ("error" in resultado) {
    return (
      <p className="mt-3 rounded-md border border-coral bg-coral-suave p-3 text-sm text-coral-oscuro" role="alert" data-precio-linea="error">
        No pudimos calcular el precio: {resultado.error}
      </p>
    );
  }
  const c = resultado.cotizacion;
  if (c.estado === "ok") {
    return (
      <p className="mt-3 text-sm font-semibold text-n-900" data-precio-linea>
        {textoPrecioLinea(c)}
      </p>
    );
  }
  if (c.estado === "faltan_datos") return <FaltaDatoDePrecio perroId={perroId} perroNombre={perroNombre} faltan={c.faltan} onGuardado={onGuardado} />;
  return (
    <p className="mt-3 rounded-md border border-coral bg-coral-suave p-3 text-sm text-coral-oscuro" role="alert" data-precio-linea={c.estado}>
      <TextoConEnlaces texto={c.mensaje} />
    </p>
  );
}

/**
 * QA R50 (N133): al perro le falta un dato del que depende el precio (talla o pelaje). Es un bloqueo, no una
 * recomendación: el aviso dice qué falta, el selector está ahí mismo, «Guardar en su expediente y calcular» lo guarda
 * en el perro y la pantalla vuelve a cotizar (`onGuardado`). Lo usan Hotel, Guardería (reserva, walk-in y series) y
 * Estética; quién lo enseña lo decide cotizar_linea_servicio, no la pantalla.
 */
export function FaltaDatoDePrecio({
  perroId,
  perroNombre,
  faltan,
  tamanos,
  pelajes,
  onGuardado,
}: {
  perroId: string;
  perroNombre: string;
  faltan: DatoDePrecio[];
  // Si la pantalla ya tiene el catálogo, lo pasa; si no, se pide al servidor.
  tamanos?: Opcion[];
  pelajes?: Opcion[];
  onGuardado: (guardado: { tamanoId: string | null; pelajeId: string | null }) => void;
}) {
  const [catalogo, setCatalogo] = useState<{ tamanos: Opcion[]; pelajes: Opcion[] } | null>(tamanos && pelajes ? { tamanos, pelajes } : null);
  const [tamano, setTamano] = useState("");
  const [pelaje, setPelaje] = useState("");
  const [error, setError] = useState<string | null>(null);
  const guardando = useEspera();
  const pideTalla = faltan.includes("tamano");
  const pidePelaje = faltan.includes("pelaje");

  useEffect(() => {
    if (catalogo) return;
    let vigente = true;
    void conTope(catalogoTallaPelaje())
      .then((c) => vigente && setCatalogo({ tamanos: tamanos ?? c.tamanos, pelajes: pelajes ?? c.pelajes }))
      .catch(() => vigente && setError("No pudimos cargar las tallas. Recarga la página."));
    return () => {
      vigente = false;
    };
  }, [catalogo, tamanos, pelajes]);

  async function guardar() {
    if ((pideTalla && !tamano) || (pidePelaje && !pelaje)) {
      setError(`Elige ${pideTalla && pidePelaje ? "la talla y el pelaje" : pideTalla ? "la talla" : "el pelaje"} de ${perroNombre}.`);
      return;
    }
    setError(null);
    const t = pideTalla ? tamano : null;
    const p = pidePelaje ? pelaje : null;
    const res = await guardando.ejecutar(() => guardarTallaPelaje(perroId, t, p));
    if (res.error) {
      setError(res.error);
      return;
    }
    onGuardado({ tamanoId: t, pelajeId: p });
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-coral bg-coral-suave p-3 text-sm text-coral-oscuro" role="alert" data-falta-dato-precio={faltan.join(",")}>
      <p className="font-semibold">{textoFaltaDato(perroNombre, faltan)}.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {pideTalla && (
          <Select label="Talla" value={tamano} onChange={(e) => setTamano(e.target.value)} data-elegir-talla>
            <option value="">Elige la talla</option>
            {(catalogo?.tamanos ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.etiqueta}
              </option>
            ))}
          </Select>
        )}
        {pidePelaje && (
          <Select label="Pelaje" value={pelaje} onChange={(e) => setPelaje(e.target.value)} data-elegir-pelaje>
            <option value="">Elige el pelaje</option>
            {(catalogo?.pelajes ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.etiqueta}
              </option>
            ))}
          </Select>
        )}
      </div>
      {error && <p className="font-semibold">{error}</p>}
      <Button type="button" className="self-start" cargando={guardando.cargando} onClick={guardar}>
        Guardar en su expediente y calcular
      </Button>
    </div>
  );
}
