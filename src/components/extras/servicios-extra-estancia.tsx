"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { ListaExtras } from "./lista-extras";
import { etiquetaUnidadExtra, type CatalogoExtra, type ExtraFila } from "@/lib/extras/tipos";
import { agregarExtra, programarExtra } from "@/app/(staff)/extras/actions";

const dinero = (v: number) => `$${v.toFixed(2)}`;

/**
 * Servicios extra de UNA estancia (o de un día de guardería): lo ya agregado y el
 * formulario para agregar uno que ya se hizo o programarlo (paseo diario a las
 * 10:00, traslado, baño de salida…). Al marcarlo hecho el cargo entra a la cuenta.
 */
export function ServiciosExtraEstancia({
  estanciaId,
  clienteId,
  fechaEntrada,
  fechaSalida,
  hoy,
  catalogo,
  filas,
  negocio,
  puedeAgregar,
  direccionCliente,
}: {
  estanciaId: string;
  clienteId: string;
  fechaEntrada: string;
  fechaSalida: string;
  hoy: string;
  catalogo: CatalogoExtra[];
  filas: ExtraFila[];
  negocio: string;
  puedeAgregar: boolean;
  direccionCliente: string | null;
}) {
  const router = useRouter();
  const envio = useEspera();
  const maxFecha = fechaSalida >= fechaEntrada ? fechaSalida : fechaEntrada;
  const fechaInicial = hoy < fechaEntrada ? fechaEntrada : hoy > maxFecha ? maxFecha : hoy;

  const [extraId, setExtraId] = useState(catalogo[0]?.id ?? "");
  const [modo, setModo] = useState<"programar" | "hecho">("programar");
  const [fecha, setFecha] = useState(fechaInicial);
  const [hasta, setHasta] = useState("");
  const [hora, setHora] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [zonaId, setZonaId] = useState("");
  const [sentido, setSentido] = useState("entregar");
  const [direccion, setDireccion] = useState(direccionCliente ?? "");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const extra = catalogo.find((e) => e.id === extraId);
  const esTraslado = extra?.tipo === "traslado";
  const zonas = extra?.zonas ?? [];
  const zona = zonas.find((z) => z.id === zonaId);
  const precioUnitario = esTraslado ? (zona?.precio ?? (zonas.length ? 0 : (extra?.precio ?? 0))) : (extra?.precio ?? 0);
  const total = precioUnitario * (Number(cantidad) || 0);

  async function enviar() {
    setError(null);
    setOk(null);
    const comun = {
      estanciaId,
      extraId,
      hora,
      cantidad: Number(cantidad),
      zonaId: esTraslado ? zonaId : "",
      direccion: esTraslado ? direccion : "",
      sentido: esTraslado ? sentido : "",
      notas,
    };
    const r =
      modo === "hecho"
        ? await envio.ejecutar(() => agregarExtra({ ...comun, fecha, yaHecho: true }))
        : hasta && hasta > fecha
          ? await envio.ejecutar(() => programarExtra({ ...comun, desde: fecha, hasta }))
          : await envio.ejecutar(() => agregarExtra({ ...comun, fecha, yaHecho: false }));
    if (r.error) {
      setError(r.error);
      return;
    }
    setOk(
      modo === "hecho"
        ? r.cubierto
          ? "Registrado y cubierto con el paquete del perro."
          : "Registrado: el cargo ya está en la cuenta."
        : r.creados
          ? `Programado: ${r.creados} día${r.creados === 1 ? "" : "s"} en el tablero.`
          : "Programado: saldrá en el tablero del día."
    );
    setNotas("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4" data-servicios-extra>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold uppercase tracking-wide text-n-600">Servicios extra</p>
        <ListaExtras
          filas={filas}
          negocio={negocio}
          puedeAgregar={puedeAgregar}
          conFecha
          vacio="Ninguno todavía en esta estancia."
        />
      </div>

      {puedeAgregar && catalogo.length === 0 && (
        <p className="text-sm text-n-600">
          El negocio todavía no tiene servicios extra en su catálogo.{" "}
          <Link href="/extras/catalogo" className="font-semibold text-morado hover:underline">
            Crear el catálogo
          </Link>
        </p>
      )}

      {puedeAgregar && catalogo.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Servicio extra" value={extraId} onChange={(e) => { setExtraId(e.target.value); setZonaId(""); }}>
              {catalogo.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} {e.tipo === "traslado" ? "" : `· ${dinero(e.precio)} ${etiquetaUnidadExtra(e.unidad)}`}
                </option>
              ))}
            </Select>
            <Select label="¿Qué pasó?" value={modo} onChange={(e) => setModo(e.target.value as "programar" | "hecho")}>
              <option value="programar">Programarlo (sale en el tablero)</option>
              <option value="hecho">Ya se hizo (entra a la cuenta)</option>
            </Select>
            <Field label={modo === "programar" ? "Desde el día" : "Fecha"} type="date" min={fechaEntrada} max={maxFecha} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            {modo === "programar" && (
              <Field
                label="Repetir cada día hasta (opcional)"
                type="date"
                min={fecha}
                max={maxFecha}
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                ayuda="Para un paseo diario: del primer al último día."
              />
            )}
            <Field label="Hora (opcional)" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            <Field label="Cantidad" type="number" min="1" max="99" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </div>

          {esTraslado && (
            <div className="grid gap-3 sm:grid-cols-2">
              {zonas.length > 0 && (
                <Select label="Zona" value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
                  <option value="">Elige la zona…</option>
                  {zonas.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.nombre}
                      {z.km_hasta ? ` (hasta ${z.km_hasta} km)` : ""} · {dinero(z.precio)}
                    </option>
                  ))}
                </Select>
              )}
              <Select label="Es para" value={sentido} onChange={(e) => setSentido(e.target.value)}>
                <option value="entregar">Entregar al perro en su domicilio</option>
                <option value="recoger">Recoger al perro en su domicilio</option>
              </Select>
              <div className="sm:col-span-2">
                <Field label="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle, número, colonia" ayuda={direccionCliente ? "Viene de la ficha del cliente." : "El cliente no tiene dirección guardada."} />
              </div>
            </div>
          )}

          <Field label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="ej. Que no se encuentre con otros perros" />

          <AccionesFormulario error={error} exito={ok}>
            <Button type="button" cargando={envio.cargando} onClick={enviar} disabled={!extraId}>
              {modo === "hecho" ? "Registrar y cobrar en la cuenta" : "Programar"}
            </Button>
            <span className="text-sm text-n-600">{total > 0 ? `${dinero(total)} en total` : ""}</span>
          </AccionesFormulario>
          <p className="text-xs text-n-500">
            ¿Un paquete de sesiones? Se vende desde{" "}
            <Link href={`/clientes/${clienteId}`} className="font-semibold text-morado hover:underline">
              la ficha del cliente
            </Link>
            ; al marcar la sesión como hecha se descuenta solo.
          </p>
        </div>
      )}
      {!puedeAgregar && (
        <Alert variante="info" titulo="Sin permiso">Para agregar servicios extra necesitas el permiso «Agregar servicios extra».</Alert>
      )}
    </div>
  );
}
