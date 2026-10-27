"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Chip } from "@/components/ui/chip";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { useEspera } from "@/hooks/use-espera";
import { esperarConTope } from "@/lib/ui/espera";
import { sha256Archivo } from "@/lib/hash-archivo";
import { camposDisponibles, sugerirMapeo, campoPorClave } from "@/lib/importador/campos";
import { leerArchivo, type TablaArchivo } from "@/lib/importador/archivo";
import { plantillaCsv } from "@/lib/importador/plantilla";
import type { FilaCruda } from "@/lib/importador/validar";
import {
  agregarFilas,
  cancelarImportacion,
  crearImportacion,
  procesarLote,
  revisarFilas,
  type FilaRevisada,
  type Modo,
  type Progreso,
} from "./actions";

type Paso = "archivo" | "columnas" | "revision" | "importando" | "listo";
type Filtro = "todas" | "errores" | "avisos" | "duplicados";

const BLOQUE_REVISION = 400;
const BLOQUE_SUBIDA = 500;
const PASOS: { clave: Paso; texto: string }[] = [
  { clave: "archivo", texto: "1 · Archivo" },
  { clave: "columnas", texto: "2 · Columnas" },
  { clave: "revision", texto: "3 · Revisar" },
  { clave: "importando", texto: "4 · Importar" },
];

export function Importador({ conClinicos, conVet }: { conClinicos: boolean; conVet: boolean }) {
  const campos = useMemo(() => camposDisponibles(conClinicos, conVet), [conClinicos, conVet]);
  const [paso, setPaso] = useState<Paso>("archivo");
  const [modo, setModo] = useState<Modo>("omitir");
  const [tabla, setTabla] = useState<TablaArchivo | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [mapeo, setMapeo] = useState<(string | null)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revisadas, setRevisadas] = useState<FilaRevisada[]>([]);
  const [avance, setAvance] = useState<{ hecho: number; total: number } | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [verHasta, setVerHasta] = useState(100);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [reusada, setReusada] = useState<string | null>(null);
  const detener = useRef(false);
  const [detenida, setDetenida] = useState(false);
  const leyendo = useEspera({ tope: 60_000 });
  const revisando = useEspera({ tope: 10 * 60_000 });
  const importando = useEspera({ tope: 60 * 60_000 });

  function descargarPlantilla() {
    const blob = new Blob([plantillaCsv(conClinicos, conVet)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-clientes-y-mascotas.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function alElegirArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;
    setError(null);
    const r = await leyendo.correr(() => leerArchivo(archivo));
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setTabla(r.valor);
    setNombreArchivo(archivo.name);
    setMapeo(sugerirMapeo(r.valor.encabezados, conClinicos, conVet));
    setPaso("columnas");
  }

  const usos = useMemo(() => {
    const m = new Map<string, number>();
    mapeo.forEach((c) => c && m.set(c, (m.get(c) ?? 0) + 1));
    return m;
  }, [mapeo]);
  const repetidos = [...usos.entries()].filter(([, n]) => n > 1).map(([c]) => campoPorClave(c)?.etiqueta ?? c);
  const faltan = campos.filter((c) => c.obligatorio && !usos.has(c.clave)).map((c) => c.etiqueta);

  function filasMapeadas(): { n: number; valores: FilaCruda }[] {
    if (!tabla) return [];
    return tabla.filas.map((fila, i) => {
      const valores: FilaCruda = {};
      mapeo.forEach((clave, col) => {
        if (clave && fila[col]) valores[clave] = fila[col];
      });
      return { n: i + 2, valores }; // fila 1 = encabezados: el número es el de la hoja
    });
  }

  async function revisar() {
    setError(null);
    setRevisadas([]);
    setFiltro("todas");
    setVerHasta(100);
    setPaso("revision");
    const filas = filasMapeadas();
    setAvance({ hecho: 0, total: filas.length });
    const r = await revisando.correr(async () => {
      const todas: FilaRevisada[] = [];
      for (let i = 0; i < filas.length; i += BLOQUE_REVISION) {
        const res = await esperarConTope(() => revisarFilas(filas.slice(i, i + BLOQUE_REVISION)), 90_000);
        if (res.error || !("filas" in res)) throw new Error(res.error ?? "No se pudo revisar el archivo.");
        todas.push(...res.filas);
        setAvance({ hecho: Math.min(i + BLOQUE_REVISION, filas.length), total: filas.length });
      }
      return todas;
    });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    // Avisos que solo se ven mirando todo el archivo: microchip repetido.
    const vistos = new Map<string, number>();
    const completas = r.valor.map((f) => {
      const chip = f.datos?.m_microchip;
      if (!chip) return f;
      const k = chip.toLowerCase();
      const antes = vistos.get(k);
      vistos.set(k, antes ?? f.n);
      return antes ? { ...f, avisos: [...f.avisos, `El microchip ya aparece en la fila ${antes} de este archivo.`] } : f;
    });
    // El mismo teléfono en varias filas es UN dueño con varias mascotas: solo la primera lo crea.
    const telVisto = new Map<string, number>();
    const mascotaVista = new Map<string, number>();
    const marcadas = completas.map((f) => {
      if (f.error || !f.datos) return f;
      const tel = f.datos.c_telefono;
      const antesTel = telVisto.get(tel);
      if (antesTel === undefined) telVisto.set(tel, f.n);
      let repetidaMascota: number | null = null;
      if (f.datos.m_nombre) {
        const k = tel + "|" + f.datos.m_nombre.toLowerCase().trim();
        const antesM = mascotaVista.get(k);
        if (antesM === undefined) mascotaVista.set(k, f.n);
        else repetidaMascota = antesM;
      }
      return { ...f, repetidoCliente: antesTel ?? null, repetidaMascota };
    });
    setRevisadas(marcadas);
  }

  const resumen = useMemo(() => {
    const r = { total: revisadas.length, ok: 0, errores: 0, avisos: 0, clientesNuevos: 0, clientesExistentes: 0, mascotasNuevas: 0, mascotasExistentes: 0, deOtro: 0 };
    const razas = new Map<string, { texto: string; cuenta: number }>();
    for (const f of revisadas) {
      if (f.error) {
        r.errores++;
        continue;
      }
      r.ok++;
      if (f.avisos.length) r.avisos++;
      if (f.repetidoCliente) {
        // ya contado en la primera fila de ese teléfono
      } else if (f.cliente === "nuevo") r.clientesNuevos++;
      else r.clientesExistentes++;
      if (f.repetidaMascota) r.mascotasExistentes++;
      else if (f.mascota === "nueva") r.mascotasNuevas++;
      else if (f.mascota === "existente") r.mascotasExistentes++;
      else if (f.mascota === "de_otro") r.deOtro++;
      if (f.mascota !== "ninguna" && f.datos?.m_raza && f.raza !== "catalogo") {
        const k = f.datos.m_raza.toLowerCase();
        const e = razas.get(k) ?? { texto: f.datos.m_raza, cuenta: 0 };
        e.cuenta++;
        razas.set(k, e);
      }
    }
    return { ...r, razas: [...razas.values()].sort((a, b) => b.cuenta - a.cuenta) };
  }, [revisadas]);

  const visibles = useMemo(() => {
    const lista = revisadas.filter((f) => {
      if (filtro === "errores") return Boolean(f.error);
      if (filtro === "avisos") return !f.error && f.avisos.length > 0;
      if (filtro === "duplicados") return !f.error && (f.cliente === "existente" || f.mascota === "existente" || f.mascota === "de_otro");
      return true;
    });
    return lista;
  }, [revisadas, filtro]);

  async function importar() {
    setError(null);
    detener.current = false;
    setPaso("importando");
    const filas = filasMapeadas();
    const r = await importando.correr(async () => {
      const huella = await sha256Archivo(new Blob([JSON.stringify([modo, filas])]));
      const mapaClaves: Record<string, string> = {};
      mapeo.forEach((c, i) => c && (mapaClaves[tabla!.encabezados[i]] = c));
      const creada = await esperarConTope(
        () => crearImportacion({ nombreArchivo: nombreArchivo || "archivo", huella, modo, mapeo: mapaClaves, total: filas.length }),
        60_000
      );
      if (creada.error || !("id" in creada)) throw new Error(creada.error ?? "No se pudo crear la importación.");
      setImportId(creada.id);
      if (creada.reusada) {
        setReusada(creada.estado);
        if (creada.estado === "completada") {
          return { id: creada.id, terminada: true };
        }
      }
      if (creada.estado === "preparada") {
        for (let i = 0; i < filas.length; i += BLOQUE_SUBIDA) {
          const res = await esperarConTope(() => agregarFilas(creada.id, filas.slice(i, i + BLOQUE_SUBIDA)), 90_000);
          if (res.error) throw new Error(res.error);
        }
      }
      return { id: creada.id, terminada: false };
    });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (r.valor.terminada) {
      await seguir(r.valor.id);
      return;
    }
    await seguir(r.valor.id);
  }

  // Lotes hasta acabar. Si falla la red, "Reintentar" llama esto otra vez: lo
  // ya procesado no se repite.
  async function seguir(id: string) {
    setError(null);
    detener.current = false;
    setDetenida(false);
    setPaso("importando");
    const r = await importando.correr(async () => {
      for (;;) {
        const res = await esperarConTope(() => procesarLote(id), 90_000);
        if (res.error || !("progreso" in res)) throw new Error(res.error ?? "No se pudo procesar el lote.");
        setProgreso(res.progreso);
        if (res.progreso.estado !== "procesando" && res.progreso.estado !== "preparada") return res.progreso;
        if (detener.current) {
          setDetenida(true);
          const cancel = await esperarConTope(() => cancelarImportacion(id), 60_000);
          if (cancel.error || !("progreso" in cancel)) throw new Error(cancel.error ?? "No se pudo detener.");
          return cancel.progreso;
        }
      }
    });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setProgreso(r.valor);
    setPaso("listo");
  }

  const indicePaso = PASOS.findIndex((p) => p.clave === (paso === "listo" ? "importando" : paso));

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Pasos">
        {PASOS.map((p, i) => (
          <li
            key={p.clave}
            aria-current={i === indicePaso ? "step" : undefined}
            className={`rounded-full px-3 py-1 font-semibold ${i === indicePaso ? "bg-morado text-white" : i < indicePaso ? "bg-menta-suave text-menta-oscuro" : "bg-n-100 text-n-700"}`}
          >
            {p.texto}
          </li>
        ))}
      </ol>

      {error && (
        <Alert variante="error" titulo="No se pudo continuar">
          {error}
        </Alert>
      )}

      {paso === "archivo" && (
        <section className="flex flex-col gap-4 rounded-lg border border-borde bg-white p-4">
          <p className="text-n-800">
            Sube tu lista de clientes y mascotas en <strong>Excel (.xlsx)</strong> o <strong>CSV</strong>. Cada fila es un dueño; si trae el nombre
            de una mascota, también se crea su ficha. Si un dueño tiene varias mascotas, repite sus datos en cada fila: se reconoce por el
            teléfono.
          </p>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-n-800">Si alguien ya está registrado (mismo teléfono o microchip)</legend>
            <label className="flex items-start gap-2">
              <input type="radio" name="modo" checked={modo === "omitir"} onChange={() => setModo("omitir")} className="mt-1 h-4 w-4" />
              <span>
                <strong>Omitir</strong>: dejo lo que ya está tal cual. Las mascotas nuevas de un dueño que ya existe sí se agregan.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="modo" checked={modo === "actualizar"} onChange={() => setModo("actualizar")} className="mt-1 h-4 w-4" />
              <span>
                <strong>Actualizar</strong>: completo y corrijo con lo que trae el archivo. Un dato vacío nunca borra lo que ya hay.
              </span>
            </label>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-12 cursor-pointer items-center rounded-md bg-morado px-5 font-semibold text-white hover:bg-morado-oscuro">
              {leyendo.cargando ? "Leyendo…" : "Elegir archivo"}
              <input type="file" accept=".xlsx,.csv,.txt,.tsv" className="sr-only" onChange={alElegirArchivo} disabled={leyendo.cargando} data-testid="archivo-importar" />
            </label>
            <Button type="button" variante="secundario" onClick={descargarPlantilla}>
              Descargar plantilla
            </Button>
          </div>
          <p className="text-sm text-n-700">
            La plantilla trae los encabezados que el sistema reconoce solo y dos filas de ejemplo.
            {!conVet && " La especie y los datos clínicos (peso, alergias, microchip y folio) se piden cuando el módulo Veterinaria está prendido."}
            {conVet && !conClinicos && " Los datos clínicos (peso, alergias, microchip y folio) se piden con el permiso «Editar ficha clínica»."}
            {conVet && " Un gato u otra especie no pide raza de perro, tamaño ni pelaje."}
          </p>
        </section>
      )}

      {paso === "columnas" && tabla && (
        <section className="flex flex-col gap-4 rounded-lg border border-borde bg-white p-4">
          <p className="text-n-800">
            <strong>{nombreArchivo}</strong> · {tabla.filas.length.toLocaleString("es-MX")} filas. Revisa a qué campo corresponde cada columna
            (ya sugerimos las que reconocimos).
          </p>
          {faltan.length > 0 && (
            <Alert variante="advertencia" titulo="Falta mapear">
              {faltan.join(" y ")} {faltan.length > 1 ? "son obligatorios" : "es obligatorio"}.
            </Alert>
          )}
          {repetidos.length > 0 && (
            <Alert variante="advertencia" titulo="Un campo está en dos columnas">
              {repetidos.join(", ")}: elige solo una columna para cada campo.
            </Alert>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-b border-borde text-n-700">
                  <th className="py-2 pr-3 font-semibold">Columna del archivo</th>
                  <th className="py-2 pr-3 font-semibold">Ejemplos</th>
                  <th className="py-2 font-semibold">Campo del sistema</th>
                </tr>
              </thead>
              <tbody>
                {tabla.encabezados.map((enc, col) => (
                  <tr key={col} className="border-b border-borde/60 align-top">
                    <td className="py-2 pr-3 font-medium text-n-900">{enc}</td>
                    <td className="max-w-[16rem] py-2 pr-3 text-n-700">
                      {tabla.filas.slice(0, 3).map((f, i) => (
                        <div key={i} className="truncate">{f[col] || "—"}</div>
                      ))}
                    </td>
                    <td className="py-2">
                      <select
                        aria-label={`Campo para la columna ${enc}`}
                        value={mapeo[col] ?? ""}
                        onChange={(e) => setMapeo((m) => m.map((v, i) => (i === col ? e.target.value || null : v)))}
                        className="min-h-11 w-full rounded-md border-[1.5px] border-borde bg-white px-2 text-base"
                      >
                        <option value="">No importar</option>
                        <optgroup label="Dueño">
                          {campos.filter((c) => c.grupo === "cliente").map((c) => (
                            <option key={c.clave} value={c.clave}>{c.etiqueta}{c.obligatorio ? " *" : ""}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Mascota">
                          {campos.filter((c) => c.grupo === "mascota").map((c) => (
                            <option key={c.clave} value={c.clave}>{c.etiqueta}</option>
                          ))}
                        </optgroup>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AccionesFormulario error={null}>
            <Button type="button" variante="secundario" onClick={() => setPaso("archivo")}>
              Elegir otro archivo
            </Button>
            <Button type="button" disabled={faltan.length > 0 || repetidos.length > 0} onClick={revisar}>
              Revisar antes de importar
            </Button>
          </AccionesFormulario>
        </section>
      )}

      {paso === "revision" && (
        <section className="flex flex-col gap-4 rounded-lg border border-borde bg-white p-4">
          {revisando.cargando || (avance && avance.hecho < avance.total && revisadas.length === 0 && !error) ? (
            <div role="status" aria-live="polite">
              <p className="mb-2 text-n-800">Revisando el archivo… {avance ? `${avance.hecho.toLocaleString("es-MX")} de ${avance.total.toLocaleString("es-MX")}` : ""}</p>
              <Barra valor={avance?.hecho ?? 0} total={avance?.total ?? 1} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Dato titulo="Filas" valor={resumen.total} />
                <Dato titulo="Se importan" valor={resumen.ok} tono="exito" />
                <Dato titulo="Con error (no entran)" valor={resumen.errores} tono={resumen.errores ? "pendiente" : "neutro"} />
                <Dato titulo="Con aviso" valor={resumen.avisos} tono={resumen.avisos ? "proceso" : "neutro"} />
                <Dato titulo="Dueños nuevos" valor={resumen.clientesNuevos} />
                <Dato titulo="Dueños que ya existen" valor={resumen.clientesExistentes} />
                <Dato titulo="Mascotas nuevas" valor={resumen.mascotasNuevas} />
                <Dato titulo="Mascotas que ya existen" valor={resumen.mascotasExistentes} />
              </div>
              {resumen.deOtro > 0 && (
                <Alert variante="advertencia" titulo={`${resumen.deOtro} mascota(s) con un microchip que ya es de otro dueño`}>
                  No se importan: revisa esas filas (filtro «Ya existen»).
                </Alert>
              )}
              {resumen.razas.length > 0 && (
                <Alert variante="info" titulo="Razas que no están en el catálogo">
                  Quedarán como texto y podrás corregirlas después en Razas sin catalogar:{" "}
                  {resumen.razas.slice(0, 12).map((r) => `${r.texto} (${r.cuenta})`).join(", ")}
                  {resumen.razas.length > 12 ? ` y ${resumen.razas.length - 12} más` : ""}.
                </Alert>
              )}
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar filas">
                {(["todas", "errores", "avisos", "duplicados"] as Filtro[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filtro === f}
                    onClick={() => { setFiltro(f); setVerHasta(100); }}
                    className={`min-h-10 rounded-full border px-3 text-sm font-semibold ${filtro === f ? "border-morado bg-morado text-white" : "border-borde bg-white text-n-800"}`}
                  >
                    {{ todas: "Todas", errores: "Con error", avisos: "Con aviso", duplicados: "Ya existen" }[f]}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm" data-testid="tabla-revision">
                  <thead>
                    <tr className="border-b border-borde text-n-700">
                      <th className="py-2 pr-2 font-semibold">Fila</th>
                      <th className="py-2 pr-2 font-semibold">Dueño</th>
                      <th className="py-2 pr-2 font-semibold">Mascota</th>
                      <th className="py-2 font-semibold">Qué pasará</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.slice(0, verHasta).map((f) => (
                      <tr key={f.n} className="border-b border-borde/60 align-top">
                        <td className="py-2 pr-2 text-n-700">{f.n}</td>
                        <td className="py-2 pr-2">{f.datos ? `${f.datos.c_nombre} · ${f.datos.c_telefono}` : "—"}</td>
                        <td className="py-2 pr-2">{f.datos?.m_nombre ?? "—"}</td>
                        <td className="py-2">
                          {f.error ? (
                            <span className="font-semibold text-coral-oscuro">{f.error}</span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <span className="flex flex-wrap gap-1.5">
                                <Chip tono={f.cliente === "nuevo" && !f.repetidoCliente ? "exito" : "info"} punto={false}>
                                  {f.repetidoCliente ? `Mismo dueño que la fila ${f.repetidoCliente}` : f.cliente === "nuevo" ? "Dueño nuevo" : `Ya existe${f.clienteNombre ? `: ${f.clienteNombre}` : ""}${modo === "actualizar" ? " (se actualiza)" : ""}`}
                                </Chip>
                                {f.mascota !== "ninguna" && (
                                  <Chip tono={f.mascota === "nueva" && !f.repetidaMascota ? "exito" : f.mascota === "de_otro" ? "pendiente" : "info"} punto={false}>
                                    {f.repetidaMascota ? `Repetida (fila ${f.repetidaMascota})` : f.mascota === "nueva" ? "Mascota nueva" : f.mascota === "de_otro" ? "Microchip de otro dueño" : `Mascota ya existe (${f.mascotaPor === "microchip" ? "microchip" : "mismo nombre"})${modo === "actualizar" ? " (se actualiza)" : ""}`}
                                  </Chip>
                                )}
                              </span>
                              {f.avisos.map((a, i) => (
                                <span key={i} className="text-ambar-oscuro">{a}</span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {visibles.length === 0 && (
                      <tr><td colSpan={4} className="py-4 text-center text-n-700">No hay filas con ese filtro.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {visibles.length > verHasta && (
                <Button type="button" variante="secundario" onClick={() => setVerHasta((v) => v + 200)}>
                  Mostrar más ({(visibles.length - verHasta).toLocaleString("es-MX")} restantes)
                </Button>
              )}
              <AccionesFormulario error={null}>
                <Button type="button" variante="secundario" onClick={() => setPaso("columnas")}>
                  Volver a las columnas
                </Button>
                <Button type="button" disabled={resumen.ok === 0} onClick={importar}>
                  {`Importar ${resumen.ok.toLocaleString("es-MX")} filas`}
                </Button>
              </AccionesFormulario>
              <p className="text-sm text-n-700">
                Podrás deshacer la importación completa desde el historial mientras nadie haya modificado esos registros.
              </p>
            </>
          )}
        </section>
      )}

      {(paso === "importando" || paso === "listo") && (
        <section className="flex flex-col gap-4 rounded-lg border border-borde bg-white p-4" aria-live="polite">
          {reusada === "completada" && paso === "importando" && (
            <Alert variante="info" titulo="Este archivo ya se había importado">
              Es exactamente el mismo contenido; no se vuelve a importar.
            </Alert>
          )}
          {progreso && (
            <>
              <p className="text-n-800" data-testid="progreso-texto">
                {paso === "listo"
                  ? detenida
                    ? "La importación se detuvo. Lo que ya entró se queda (y se puede deshacer desde el historial)."
                    : "Importación terminada."
                  : "Importando… puedes dejar esta pantalla abierta; si la cierras, se retoma desde el historial."}
              </p>
              <Barra valor={progreso.total - progreso.pendientes} total={progreso.total} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Dato titulo="Dueños creados" valor={progreso.clientes_creados} tono="exito" />
                <Dato titulo="Mascotas creadas" valor={progreso.mascotas_creadas} tono="exito" />
                <Dato titulo="Actualizadas" valor={progreso.actualizadas} />
                <Dato titulo="Omitidas" valor={progreso.omitidas} />
                <Dato titulo="Con error" valor={progreso.errores} tono={progreso.errores ? "pendiente" : "neutro"} />
                <Dato titulo="Por procesar" valor={progreso.pendientes} />
              </div>
            </>
          )}
          {!progreso && !error && <p className="text-n-800">Preparando la importación…</p>}
          {paso === "importando" && (
            <div className="flex flex-wrap gap-3">
              <Button type="button" variante="secundario" onClick={() => (detener.current = true)} disabled={!progreso}>
                Detener después de este lote
              </Button>
            </div>
          )}
          {error && importId && (
            <div className="flex flex-wrap gap-3">
              <Button type="button" cargando={importando.cargando} onClick={() => seguir(importId)}>
                Reintentar (no duplica lo ya importado)
              </Button>
            </div>
          )}
          {paso === "listo" && progreso && (
            <>
              {progreso.razas_sin_catalogo.length > 0 && (
                <Alert variante="info" titulo="Razas que quedaron como texto">
                  {progreso.razas_sin_catalogo.slice(0, 15).map((r) => `${r.texto} (${r.cuenta})`).join(", ")}
                  {progreso.razas_sin_catalogo.length > 15 ? ` y ${progreso.razas_sin_catalogo.length - 15} más` : ""}. Corrígelas en{" "}
                  <Link className="font-semibold underline" href="/perros/razas">Razas sin catalogar</Link>.
                </Alert>
              )}
              {progreso.errores > 0 && (
                <Alert variante="advertencia" titulo={`${progreso.errores} fila(s) no entraron`}>
                  Mira el motivo de cada una en el detalle de la importación, corrígelas en tu archivo y súbelo otra vez: lo que ya entró no se duplica.
                </Alert>
              )}
              <div className="flex flex-wrap gap-3">
                <Link href={`/admin/importar/${progreso.id}`} className="inline-flex min-h-12 items-center rounded-md bg-morado px-5 font-semibold text-white hover:bg-morado-oscuro">
                  Ver el detalle
                </Link>
                <Link href="/clientes" className="inline-flex min-h-12 items-center rounded-md border-[1.5px] border-borde bg-white px-5 font-semibold text-n-900 hover:bg-n-100">
                  Ir a Clientes
                </Link>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Barra({ valor, total }: { valor: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-3 w-full overflow-hidden rounded-full bg-n-100">
      <div className="h-full bg-morado transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Dato({ titulo, valor, tono = "neutro" }: { titulo: string; valor: number; tono?: "neutro" | "exito" | "pendiente" | "proceso" }) {
  const color = { neutro: "text-n-900", exito: "text-menta-oscuro", pendiente: "text-coral-oscuro", proceso: "text-ambar-oscuro" }[tono];
  return (
    <div className="rounded-md border border-borde p-3">
      <div className={`text-2xl font-bold ${color}`}>{valor.toLocaleString("es-MX")}</div>
      <div className="text-sm text-n-700">{titulo}</div>
    </div>
  );
}
