"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import {
  CLASES_FISCALES_EXTRA,
  UNIDADES_EXTRA,
  etiquetaUnidadExtra,
  type CatalogoExtra,
  type ZonaExtra,
} from "@/lib/extras/tipos";
import { guardarExtraCatalogo, guardarPaqueteExtra, guardarZonaExtra } from "../actions";
import { dinero } from "@/lib/dinero";

export type PaqueteExtra = { sesiones: number; vigenciaDias: number | null; precio: number };


// Servicios que casi todo negocio con guardería u hotel ofrece: un toque llena el formulario.
const SUGERIDOS: { nombre: string; tipo: "general" | "traslado"; unidad: string }[] = [
  { nombre: "Paseo", tipo: "general", unidad: "vez" },
  { nombre: "Entrenamiento (sesión)", tipo: "general", unidad: "sesion" },
  { nombre: "Traslado a domicilio", tipo: "traslado", unidad: "viaje" },
  { nombre: "Baño de salida", tipo: "general", unidad: "vez" },
  { nombre: "Administración de medicamento", tipo: "general", unidad: "vez" },
  { nombre: "Cuidado especial nocturno", tipo: "general", unidad: "dia" },
];

export function CatalogoExtras({
  catalogo,
  paquetes,
  iva,
}: {
  catalogo: CatalogoExtra[];
  paquetes: Record<string, PaqueteExtra>;
  iva: Record<string, string>;
}) {
  const [nuevo, setNuevo] = useState<{ nombre: string; tipo: "general" | "traslado"; unidad: string } | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4">
        <p className="text-sm font-bold uppercase tracking-wide text-n-600">Agregar un servicio extra</p>
        <div className="flex flex-wrap gap-2">
          {SUGERIDOS.filter((s) => !catalogo.some((c) => c.nombre.toLowerCase() === s.nombre.toLowerCase())).map((s) => (
            <button
              key={s.nombre}
              type="button"
              onClick={() => setNuevo(s)}
              className="rounded-full border-[1.5px] border-borde bg-white px-3 py-1.5 text-sm font-semibold text-n-900 hover:bg-n-100"
            >
              + {s.nombre}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setNuevo({ nombre: "", tipo: "general", unidad: "vez" })}
            className="rounded-full border-[1.5px] border-morado bg-morado-suave px-3 py-1.5 text-sm font-semibold text-morado hover:bg-white"
          >
            + Otro servicio
          </button>
        </div>
        {nuevo && (
          <FormularioExtra
            key={`${nuevo.nombre}-${nuevo.tipo}`}
            extra={null}
            inicial={nuevo}
            iva={iva}
            alGuardar={() => setNuevo(null)}
            alCancelar={() => setNuevo(null)}
          />
        )}
      </div>

      {catalogo.length === 0 && <p className="text-sm text-n-500">Todavía no hay servicios extra. Agrega el primero arriba.</p>}
      {catalogo.map((e) => (
        <div key={e.id} className={`flex flex-col gap-3 rounded-lg border bg-white p-4 ${e.activo ? "border-n-200" : "border-n-200 opacity-70"}`}>
          <FormularioExtra extra={e} iva={iva} />
          {e.tipo === "traslado" && <Zonas extra={e} />}
          {e.tipo === "general" && <Paquete extra={e} paquete={paquetes[e.id] ?? null} />}
        </div>
      ))}
    </div>
  );
}

function FormularioExtra({
  extra,
  inicial,
  iva,
  alGuardar,
  alCancelar,
}: {
  extra: CatalogoExtra | null;
  inicial?: { nombre: string; tipo: "general" | "traslado"; unidad: string };
  iva: Record<string, string>;
  alGuardar?: () => void;
  alCancelar?: () => void;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [nombre, setNombre] = useState(extra?.nombre ?? inicial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(extra?.descripcion ?? "");
  const [tipo, setTipo] = useState<string>(extra?.tipo ?? inicial?.tipo ?? "general");
  const [unidad, setUnidad] = useState<string>(extra?.unidad ?? inicial?.unidad ?? "vez");
  const [precio, setPrecio] = useState(extra ? String(extra.precio) : "");
  const [clase, setClase] = useState<string>(extra?.clase_fiscal ?? "otro_servicio");
  const [claveSat, setClaveSat] = useState(extra?.clave_prod_serv ?? "");
  const [activo, setActivo] = useState(extra?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setOk(null);
    const r = await envio.ejecutar(() =>
      guardarExtraCatalogo({
        id: extra?.id ?? null,
        nombre,
        descripcion,
        tipo,
        unidad,
        precio: Number(precio || 0),
        claseFiscal: clase,
        claveProdServ: claveSat,
        activo,
      })
    );
    if (r.error) {
      setError(r.error);
      return;
    }
    setOk("Guardado");
    router.refresh();
    alGuardar?.();
  }

  const esTraslado = tipo === "traslado";
  return (
    <div className="flex flex-col gap-3" data-extra-form>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej. Paseo de 30 minutos" />
        <Field label="Qué incluye (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={Boolean(extra)}>
          <option value="general">Servicio normal</option>
          <option value="traslado">Traslado a domicilio (con zonas)</option>
        </Select>
        <Select label="Se cobra" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
          {UNIDADES_EXTRA.map((u) => (
            <option key={u.valor} value={u.valor}>
              {u.etiqueta}
            </option>
          ))}
        </Select>
        <Field
          label={esTraslado ? "Precio base (si no se elige zona)" : "Precio (lo que paga el cliente, IVA incluido)"}
          type="number"
          min="0"
          step="0.01"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          ayuda={esTraslado ? "Cada zona trae su propio precio, más abajo." : `Por ${etiquetaUnidadExtra(unidad).replace("por ", "")}.`}
        />
        <Select label="Clase fiscal (IVA)" value={clase} onChange={(e) => setClase(e.target.value)} ayuda={`Facturación: ${iva[clase] ?? "IVA 16 %"}. La tasa se cambia en Facturación.`}>
          {CLASES_FISCALES_EXTRA.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.etiqueta} · {iva[c.valor] ?? "IVA 16 %"}
            </option>
          ))}
        </Select>
        <Field
          label="Clave del SAT (opcional)"
          inputMode="numeric"
          maxLength={8}
          value={claveSat}
          onChange={(e) => setClaveSat(e.target.value.replace(/\D/g, ""))}
          ayuda="8 números. Vacía = la de la clase fiscal."
        />
        <label className="flex items-center gap-2 pt-7 text-sm font-semibold text-n-800">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-5 w-5 accent-morado" />
          Se ofrece al agregar servicios extra
        </label>
      </div>
      <AccionesFormulario error={error} exito={ok}>
        <Button type="button" cargando={envio.cargando} onClick={guardar}>
          {extra ? "Guardar cambios" : "Crear servicio extra"}
        </Button>
        {alCancelar && (
          <Button type="button" variante="secundario" onClick={alCancelar}>
            Cancelar
          </Button>
        )}
      </AccionesFormulario>
    </div>
  );
}

function Zonas({ extra }: { extra: CatalogoExtra }) {
  return (
    <div className="flex flex-col gap-2 border-t border-n-200 pt-3">
      <p className="text-sm font-bold uppercase tracking-wide text-n-600">Zonas y precio por zona</p>
      {/* QA S18 (N70): cómo se cobra un traslado por zona, con un ejemplo de SUS zonas. */}
      <p className="text-sm text-n-700" data-como-se-cobra-zona>
        Cada viaje cobra el precio de UNA zona (no se multiplica por kilómetro): al agregarlo a la estancia se escoge la
        zona del domicilio. Los km son solo de referencia para escoger bien.
        {extra.zonas.filter((z) => z.activo).length > 0 &&
          ` Ejemplo: un traslado a «${extra.zonas.filter((z) => z.activo)[0].nombre}» se cobra ${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(extra.zonas.filter((z) => z.activo)[0].precio)} por viaje.`}
      </p>
      {extra.zonas.length === 0 && <p className="text-sm text-n-500">Sin zonas: se cobra el precio base.</p>}
      {extra.zonas.map((z) => (
        <FilaZona key={z.id} extraId={extra.id} zona={z} />
      ))}
      <FilaZona key={`nueva-${extra.zonas.length}`} extraId={extra.id} zona={null} />
    </div>
  );
}

function FilaZona({ extraId, zona }: { extraId: string; zona: ZonaExtra | null }) {
  const router = useRouter();
  const envio = useEspera();
  const [nombre, setNombre] = useState(zona?.nombre ?? "");
  const [km, setKm] = useState(zona?.km_hasta ? String(zona.km_hasta) : "");
  const [precio, setPrecio] = useState(zona ? String(zona.precio) : "");
  const [activo, setActivo] = useState(zona?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setOk(null);
    const r = await envio.ejecutar(() =>
      guardarZonaExtra({ id: zona?.id ?? null, extraId, nombre, kmHasta: km ? Number(km) : null, precio: Number(precio || 0), activo })
    );
    if (r.error) {
      setError(r.error);
      return;
    }
    setOk("Guardado");
    if (!zona) {
      setNombre("");
      setKm("");
      setPrecio("");
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-n-50 p-2" data-zona-form>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <Field label={zona ? "Zona" : "Zona nueva"} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej. Centro, hasta 5 km" />
        <Field label="Hasta (km)" type="number" min="0" step="0.1" value={km} onChange={(e) => setKm(e.target.value)} />
        <Field label="Precio" type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        {zona && (
          <label className="flex items-center gap-2 pt-7 text-sm font-semibold text-n-800">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-5 w-5 accent-morado" />
            Activa
          </label>
        )}
      </div>
      <AccionesFormulario error={error} exito={ok}>
        <Button type="button" variante="secundario" cargando={envio.cargando} onClick={guardar}>
          {zona ? "Guardar zona" : "Agregar zona"}
        </Button>
        {zona && <span className="text-sm text-n-500">{dinero(zona.precio)}</span>}
      </AccionesFormulario>
    </div>
  );
}

function Paquete({ extra, paquete }: { extra: CatalogoExtra; paquete: PaqueteExtra | null }) {
  const router = useRouter();
  const envio = useEspera();
  const [abierto, setAbierto] = useState(Boolean(paquete));
  const [sesiones, setSesiones] = useState(paquete ? String(paquete.sesiones) : "");
  const [precio, setPrecio] = useState(paquete ? String(paquete.precio) : "");
  const [vigencia, setVigencia] = useState(paquete?.vigenciaDias ? String(paquete.vigenciaDias) : "");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function guardar(quitar: boolean) {
    setError(null);
    setOk(null);
    const r = await envio.ejecutar(() =>
      guardarPaqueteExtra({
        extraId: extra.id,
        sesiones: quitar ? null : Number(sesiones || 0),
        precio: Number(precio || 0),
        vigenciaDias: vigencia ? Number(vigencia) : null,
      })
    );
    if (r.error) {
      setError(r.error);
      return;
    }
    setOk(quitar ? "Paquete quitado" : "Paquete guardado");
    if (quitar) {
      setAbierto(false);
      setSesiones("");
      setPrecio("");
      setVigencia("");
    }
    router.refresh();
  }

  if (!abierto) {
    return (
      <div className="border-t border-n-200 pt-3">
        <Button type="button" variante="secundario" onClick={() => setAbierto(true)}>
          Venderlo también como paquete de sesiones
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-t border-n-200 pt-3" data-paquete-form>
      <p className="text-sm font-bold uppercase tracking-wide text-n-600">Paquete de sesiones</p>
      <p className="text-sm text-n-600">
        Se vende desde la ficha del cliente, para un perro. Cada vez que se marca una sesión como hecha, se descuenta del
        paquete y no se cobra aparte.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Sesiones" type="number" min="2" max="200" value={sesiones} onChange={(e) => setSesiones(e.target.value)} />
        <Field label="Precio del paquete" type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        <Field label="Vigencia en días (opcional)" type="number" min="1" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
      </div>
      <AccionesFormulario error={error} exito={ok}>
        <Button type="button" variante="secundario" cargando={envio.cargando} onClick={() => guardar(false)}>
          Guardar paquete
        </Button>
        {paquete && (
          <Button type="button" variante="secundario" onClick={() => guardar(true)}>
            Quitar el paquete
          </Button>
        )}
      </AccionesFormulario>
    </div>
  );
}
