"use client";

import { Desplegable } from "@/components/desplegable";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useEspera } from "@/hooks/use-espera";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { dinero as formatearMoneda } from "@/lib/dinero";
import { ETIQUETA_TIPO_CARGO, pareceVacuna, type CargosConsulta, type LineaCargo } from "@/lib/veterinaria/cargos-consulta";
import { agregarCargoConsulta, ajustarCargoConsulta, pasarCargosACaja, ponerPrecioCargo, quitarCargoConsulta, restaurarCargoConsulta, sinCobroCargo, type ResultadoCargos } from "./cargos-actions";

// Una línea sin precio de un servicio del catálogo es, por definición, un servicio al que el catálogo no le
// pone precio: quien puede editar precios la guarda como precio de catálogo (viene marcada, se puede desmarcar).
const sePuedeGuardarEnCatalogo = (l: LineaCargo) => l.tipo === "consulta" || l.tipo === "vacuna" || (l.tipo === "procedimiento" && l.origen === "catalogo");

const num = (t: string) => Number(t.replace(",", ".").trim());

/**
 * Lo que se va a cobrar por esta consulta. En borrador es una propuesta que el médico ve antes de
 * firmar y puede quitar o ajustar según sus permisos; ya firmada, es el resumen de lo que pasó a
 * la cuenta de Caja. `onResumen` avisa el total para que el diálogo de firma lo diga.
 */
export function CargosConsulta({
  consultaId,
  inicial,
  puedeAgregar,
  onResumen,
  puedeCatalogo = false,
  aplicarVacuna,
}: {
  consultaId: string;
  inicial: CargosConsulta;
  puedeAgregar: boolean;
  onResumen?: (d: CargosConsulta) => void;
  // Admin o «Precios y tarifas»: puede dejar el precio capturado como precio de catálogo.
  puedeCatalogo?: boolean;
  // El formulario de «Aplicar vacuna» (carnet), aparte de «Otro procedimiento».
  aplicarVacuna?: ReactNode;
}) {
  const [d, setD] = useState<CargosConsulta>(inicial);
  // Lo que llega del servidor (p. ej. después de aplicar una vacuna) vuelve a reemplazar lo mostrado.
  const [inicialPrevio, setInicialPrevio] = useState(inicial);
  if (inicial !== inicialPrevio) {
    setInicialPrevio(inicial);
    setD(inicial);
  }
  const [precioDe, setPrecioDe] = useState<string | null>(null); // id de la línea a la que se le pone precio
  const [precioNuevo, setPrecioNuevo] = useState("");
  const [aCatalogo, setACatalogo] = useState(false);
  const [sinCobroDe, setSinCobroDe] = useState<string | null>(null);
  const [motivoSinCobro, setMotivoSinCobro] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null); // id de la línea en edición
  const [modo, setModo] = useState<"ajustar" | "quitar">("ajustar");
  const [cantidad, setCantidad] = useState("");
  const [precio, setPrecio] = useState("");
  const [motivo, setMotivo] = useState("");
  const [nuevoTipo, setNuevoTipo] = useState<"catalogo" | "libre" | "producto">("catalogo");
  const [nuevoServicio, setNuevoServicio] = useState("");
  const [nuevoProducto, setNuevoProducto] = useState("");
  const [nuevoConcepto, setNuevoConcepto] = useState("");
  const [nuevoPrecio, setNuevoPrecio] = useState("");
  const [nuevaCantidad, setNuevaCantidad] = useState("1");
  const envio = useEspera();
  const borrador = d.estado_consulta === "borrador";

  async function correr(fn: () => Promise<ResultadoCargos>) {
    setError(null);
    setAviso(null);
    const r = await envio.ejecutar(fn);
    if (r.error) {
      setError(r.error);
      return false;
    }
    if (r.datos) {
      setD(r.datos);
      onResumen?.(r.datos);
    }
    if (r.aviso) setAviso(r.aviso);
    return true;
  }

  function abrir(l: LineaCargo, m: "ajustar" | "quitar") {
    setAbierta(l.id);
    setModo(m);
    setCantidad(String(l.cantidad));
    setPrecio(l.precio_unitario == null ? "" : String(l.precio_unitario));
    setMotivo("");
    setError(null);
  }

  async function confirmar(l: LineaCargo) {
    const ok = await correr(() =>
      modo === "quitar" ? quitarCargoConsulta(consultaId, l.id, motivo) : ajustarCargoConsulta(consultaId, l.id, num(cantidad), num(precio), motivo)
    );
    if (ok) setAbierta(null);
  }

  async function agregar() {
    const cant = num(nuevaCantidad);
    const ok = await correr(() =>
      nuevoTipo === "producto"
        ? agregarCargoConsulta(consultaId, { tipo: "medicamento", cantidad: cant, insumoId: nuevoProducto })
        : nuevoTipo === "catalogo"
          ? agregarCargoConsulta(consultaId, { tipo: "procedimiento", cantidad: cant, servicioId: nuevoServicio })
          : agregarCargoConsulta(consultaId, { tipo: "procedimiento", concepto: nuevoConcepto, cantidad: cant, precio: num(nuevoPrecio) })
    );
    if (ok) {
      setNuevoServicio("");
      setNuevoProducto("");
      setNuevoConcepto("");
      setNuevoPrecio("");
      setNuevaCantidad("1");
    }
  }

  async function guardarPrecio(l: LineaCargo) {
    const ok = await correr(() => ponerPrecioCargo(consultaId, l.id, num(precioNuevo), aCatalogo));
    if (ok) {
      setPrecioDe(null);
      setPrecioNuevo("");
      setACatalogo(false);
    }
  }

  async function marcarSinCobro(l: LineaCargo) {
    const ok = await correr(() => sinCobroCargo(consultaId, l.id, motivoSinCobro));
    if (ok) {
      setSinCobroDe(null);
      setMotivoSinCobro("");
    }
  }

  const visibles = d.lineas;
  const pendientesSinPrecio = d.sin_precio;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5" aria-labelledby="cargos-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cargos-titulo" className="text-lg font-bold text-n-900">{borrador ? "Cargos de esta consulta" : "Cobro de esta consulta"}</h2>
        <p className="text-lg font-bold text-n-900">Total {formatearMoneda(d.total)}</p>
      </div>
      <p className="text-sm text-n-600">
        {borrador
          ? "Esto es lo que pasará a Caja cuando firmes: el tipo de consulta, las vacunas aplicadas hoy, los medicamentos surtidos y lo que agregues. Recepción lo cobra como cualquier cuenta."
          : d.reserva_id
            ? "Estos cargos ya están en la cuenta de la mascota: recepción los cobra en Caja."
            : "Esta consulta no generó cuenta en Caja todavía."}
      </p>

      {visibles.length === 0 ? (
        <p className="text-n-700">Todavía no hay cargos. Agrega un procedimiento o un medicamento, o captura el precio de la consulta en Servicios y precios.</p>
      ) : (
        <ul className="divide-y divide-n-200 rounded-md border border-n-200">
          {visibles.map((l) => (
            <li key={l.id} className="flex flex-col gap-2 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className={l.estado === "quitado" ? "opacity-60" : ""}>
                  <p className={`font-semibold text-n-900 ${l.estado === "quitado" ? "line-through" : ""}`}>
                    {l.concepto}
                    {l.cantidad !== 1 ? <span className="font-normal text-n-600"> × {l.cantidad}</span> : null}
                  </p>
                  <p className="text-xs text-n-500">
                    {ETIQUETA_TIPO_CARGO[l.tipo]}
                    {l.ajustado ? ` · ajustado${l.ajuste_motivo ? `: ${l.ajuste_motivo}` : ""}` : ""}
                    {l.estado === "quitado" && l.motivo_quitado ? ` · quitado: ${l.motivo_quitado}` : ""}
                    {l.estado === "cubierto" ? ` · ya está ${l.cubierto_por === "teleconsulta" ? "pagada con la teleconsulta" : "en el estimado aceptado: no se cobra otra vez"}` : ""}
                    {l.estado === "cobrado" ? " · en la cuenta" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {l.estado === "propuesto" && l.importe == null ? (
                    borrador ? (
                      <span className="text-sm font-semibold text-coral-oscuro">Sin precio</span>
                    ) : (
                      <Link href="/servicios" className="text-sm font-semibold text-coral-oscuro hover:underline">Sin precio: captúralo</Link>
                    )
                  ) : l.importe != null ? (
                    <span className={`font-semibold ${l.estado === "quitado" || l.estado === "cubierto" ? "text-n-400 line-through" : "text-n-900"}`}>{formatearMoneda(l.importe)}</span>
                  ) : null}
                  {borrador && l.estado === "propuesto" && (
                    <>
                      {d.puede_ajustar && (
                        <button type="button" className="text-sm font-semibold text-morado hover:underline" onClick={() => abrir(l, "ajustar")}>Ajustar</button>
                      )}
                      {(d.puede_ajustar || l.origen === "manual") && (
                        <button type="button" className="text-sm font-semibold text-coral-oscuro hover:underline" onClick={() => abrir(l, "quitar")}>Quitar</button>
                      )}
                    </>
                  )}
                  {borrador && (l.estado === "quitado" || (l.estado === "cubierto" && l.cubierto_por === "estimado")) && d.puede_ajustar && (
                    <button type="button" className="text-sm font-semibold text-morado hover:underline" onClick={() => correr(() => restaurarCargoConsulta(consultaId, l.id))}>
                      {l.estado === "cubierto" ? "Cobrar aparte" : "Restaurar"}
                    </button>
                  )}
                </div>
              </div>
              {borrador && l.estado === "propuesto" && l.importe == null && (
                <div data-precio-faltante className="flex flex-col gap-3 rounded-md border-l-4 border-ambar bg-ambar-suave p-3">
                  <p className="text-sm font-semibold text-n-900">Precio de esta consulta: falta el de «{l.concepto}». Sin precio no se puede firmar.</p>
                  {precioDe === l.id ? (
                    <div className="grid items-end gap-3 sm:grid-cols-3">
                      <Field label="Precio de esta consulta ($)" name="precio_faltante" inputMode="decimal" value={precioNuevo} onChange={(e) => setPrecioNuevo(e.target.value)} />
                      {puedeCatalogo && sePuedeGuardarEnCatalogo(l) && (
                        <label className="flex items-center gap-2 text-sm text-n-800 sm:col-span-2">
                          <input type="checkbox" checked={aCatalogo} onChange={(e) => setACatalogo(e.target.checked)} className="h-4 w-4" />
                          Guardar como precio de catálogo (las próximas consultas ya lo traen)
                        </label>
                      )}
                      <div className="flex gap-2 sm:col-span-3">
                        <Button type="button" cargando={envio.cargando} onClick={() => guardarPrecio(l)}>Guardar el precio</Button>
                        <Button type="button" variante="secundario" onClick={() => setPrecioDe(null)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : sinCobroDe === l.id ? (
                    <div className="grid items-end gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <Field label="Motivo de «Sin cobro» (obligatorio)" name="motivo_sin_cobro" value={motivoSinCobro} onChange={(e) => setMotivoSinCobro(e.target.value)} placeholder="Cortesía, seguimiento incluido…" />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" cargando={envio.cargando} onClick={() => marcarSinCobro(l)}>Marcar sin cobro</Button>
                        <Button type="button" variante="secundario" onClick={() => setSinCobroDe(null)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={() => { setPrecioDe(l.id); setSinCobroDe(null); setPrecioNuevo(""); setACatalogo(puedeCatalogo && sePuedeGuardarEnCatalogo(l)); setError(null); }}>Poner el precio</Button>
                      {(d.puede_ajustar || l.origen === "manual") && (
                        <Button type="button" variante="secundario" onClick={() => { setSinCobroDe(l.id); setPrecioDe(null); setMotivoSinCobro(""); setError(null); }}>Sin cobro</Button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {abierta === l.id && (
                <div className="grid gap-3 rounded-md bg-n-50 p-3 sm:grid-cols-3">
                  {modo === "ajustar" && (
                    <>
                      <Field label="Cantidad" name="cantidad_ajuste" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
                      <Field label="Precio unitario ($)" name="precio_ajuste" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} ayuda="Cero si es cortesía." />
                    </>
                  )}
                  <Field label={modo === "quitar" ? "Motivo (obligatorio)" : "Motivo del ajuste"} name="motivo_cargo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  <div className="flex items-end gap-2 sm:col-span-3">
                    <Button type="button" cargando={envio.cargando} onClick={() => confirmar(l)}>{modo === "quitar" ? "Quitar el cargo" : "Guardar el ajuste"}</Button>
                    <Button type="button" variante="secundario" onClick={() => setAbierta(null)}>Cancelar</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {pendientesSinPrecio > 0 && borrador && (
        <Alert variante="advertencia" titulo={`${pendientesSinPrecio} ${pendientesSinPrecio === 1 ? "cargo sin precio" : "cargos sin precio"}: no se puede firmar todavía`}>
          Pon el precio aquí mismo con «Poner el precio» (puedes dejarlo como precio de catálogo si tienes «Precios y tarifas») o márcalo «Sin cobro» con su motivo si es cortesía o un seguimiento incluido. También lo puedes capturar en <Link href="/servicios" className="font-semibold text-morado hover:underline">Servicios y precios</Link>.
        </Alert>
      )}
      {!borrador && pendientesSinPrecio > 0 && (
        <Alert variante="advertencia" titulo="Hay cargos sin pasar a Caja">
          Les faltaba el precio. Cuando lo captures en Servicios y precios, pásalos a Caja con el botón.
        </Alert>
      )}
      {d.estado_consulta === "anulada" && d.cuenta_con_cobros && d.lineas.some((l) => l.estado === "cobrado") && (
        <Alert variante="advertencia" titulo="La consulta se anuló pero su cuenta ya tiene cobros">
          Los cargos se quedan en la cuenta. Si hay que regresar el dinero, hazlo en Caja con la devolución de siempre.
        </Alert>
      )}

      {borrador && puedeAgregar && aplicarVacuna && (
        <Desplegable titulo="Aplicar vacuna" atributos={{ "data-aplicar-vacuna": "" }} className="rounded-md border border-dashed border-n-300 p-3">
          <p className="mb-3 text-xs text-n-600">Queda en el carnet de la mascota con su lote y su fecha, y se cobra con esta consulta. Una vacuna no se agrega como «otro procedimiento».</p>
          {aplicarVacuna}
        </Desplegable>
      )}

      {borrador && puedeAgregar && (
        <details className="rounded-md border border-dashed border-n-300 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-morado">Agregar un procedimiento o medicamento</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Select label="Qué agregas" name="nuevo_tipo_cargo" value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value as typeof nuevoTipo)}>
              <option value="catalogo">Un servicio de mi catálogo veterinario</option>
              <option value="producto">Un medicamento o producto del inventario</option>
              <option value="libre">Otro procedimiento (lo escribo; las vacunas van en «Aplicar vacuna»)</option>
            </Select>
            {nuevoTipo === "catalogo" && d.catalogo.length === 0 && (
              <p data-sin-catalogo className="rounded-md border-l-4 border-ambar bg-ambar-suave px-3 py-2 text-sm text-n-800">
                No hay servicios cargados. Dalos de alta en <Link href="/servicios" className="font-semibold text-morado hover:underline">Servicios</Link> o escribe el procedimiento en «Otro procedimiento».
              </p>
            )}
            {nuevoTipo === "catalogo" && d.catalogo.length > 0 && (
              <Select label="Servicio" name="nuevo_servicio_cargo" value={nuevoServicio} onChange={(e) => setNuevoServicio(e.target.value)}>
                <option value="">Escoge uno</option>
                {d.catalogo.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}{s.precio == null ? " (sin precio)" : ` · ${formatearMoneda(s.precio)}`}</option>
                ))}
              </Select>
            )}
            {nuevoTipo === "producto" && d.productos.length === 0 && (
              <p data-sin-productos className="rounded-md border-l-4 border-ambar bg-ambar-suave px-3 py-2 text-sm text-n-800">
                No hay productos cargados. Dalos de alta en <Link href="/veterinaria/inventario" className="font-semibold text-morado hover:underline">Inventario</Link> para poder agregarlos a la consulta.
              </p>
            )}
            {nuevoTipo === "producto" && d.productos.length > 0 && (
              <Select label="Producto" name="nuevo_producto_cargo" value={nuevoProducto} onChange={(e) => setNuevoProducto(e.target.value)}>
                <option value="">Escoge uno</option>
                {d.productos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} · {p.precio == null ? "sin precio" : `${formatearMoneda(p.precio)} por ${p.unidad}`}{p.controlado ? " · controlado" : ""}</option>
                ))}
              </Select>
            )}
            {nuevoTipo === "libre" && (
              <>
                <Field label="Concepto" name="nuevo_concepto_cargo" value={nuevoConcepto} onChange={(e) => setNuevoConcepto(e.target.value)} placeholder="Sutura, curación…" />
                <Field label="Precio ($)" name="nuevo_precio_cargo" inputMode="decimal" value={nuevoPrecio} onChange={(e) => setNuevoPrecio(e.target.value)} />
              </>
            )}
            {nuevoTipo === "libre" && pareceVacuna(nuevoConcepto) && (
              <p data-aviso-vacuna className="rounded-md border-l-4 border-ambar bg-ambar-suave px-3 py-2 text-sm text-n-800 sm:col-span-2">
                Eso es una vacuna: no va como procedimiento. Usa <strong>Aplicar vacuna</strong> (arriba) para que entre al carnet con su lote y su fecha.
              </p>
            )}
            <Field label={nuevoTipo === "producto" ? "Cantidad (en la unidad de consumo)" : "Cantidad"} name="nueva_cantidad_cargo" inputMode="decimal" value={nuevaCantidad} onChange={(e) => setNuevaCantidad(e.target.value)} />
            <div className="flex items-end">
              <Button type="button" variante="secundario" cargando={envio.cargando} onClick={agregar}>Agregar al cobro</Button>
            </div>
          </div>
          {nuevoTipo === "producto" && <p className="mt-2 text-xs text-n-600">Un producto controlado no se agrega aquí: se surte con su receta o su espejo del SITPV y entra solo.</p>}
        </details>
      )}

      <AccionesFormulario error={error} exito={aviso}>
        {!borrador && pendientesSinPrecio > 0 && (
          <Button type="button" cargando={envio.cargando} onClick={() => correr(() => pasarCargosACaja(consultaId))}>Pasar a Caja lo que falta</Button>
        )}
        {d.reserva_id && (
          <Link href={`/caja/cobrar/${d.reserva_id}`} className="text-sm font-semibold text-morado hover:underline">Abrir la cuenta en Caja →</Link>
        )}
      </AccionesFormulario>
    </section>
  );
}
