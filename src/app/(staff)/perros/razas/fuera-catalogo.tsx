"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Antiguedad } from "@/components/ui/antiguedad";
import { asignarTextoARaza, proponerRaza, revertirNormalizacion } from "./grupos-actions";

export type Sugerencia = { raza_id: string; nombre: string; puntaje: number; exacta: boolean };
export type GrupoFuera = {
  texto_norm: string;
  textos: string[];
  perros: number;
  sugerencias: Sugerencia[];
  propuesta_id: string | null;
  propuesta_estado: string | null;
};
export type Asignacion = { id: string; textos: string[]; raza: string; perros: number; hecha_por: string; revertida: boolean; dias: number };
type Catalogo = { id: string; etiqueta: string };

function primeraMayuscula(t: string) {
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

export function FueraDeCatalogo({
  grupos,
  razas,
  tamanos,
  pelajes,
  asignaciones,
  puedeAsignar,
  puedeProponer,
}: {
  grupos: GrupoFuera[];
  razas: { id: string; nombre: string }[];
  tamanos: Catalogo[];
  pelajes: Catalogo[];
  asignaciones: Asignacion[];
  puedeAsignar: boolean;
  puedeProponer: boolean;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [activo, setActivo] = useState<string | null>(null);
  const [otra, setOtra] = useState<Record<string, string>>({});
  const [nueva, setNueva] = useState<string | null>(null);
  const [form, setForm] = useState({ nombre: "", variantes: "", tamanoId: "", pelajeId: "" });
  const [mensajes, setMensajes] = useState<Record<string, { error?: string | null; exito?: string }>>({});

  async function asignar(g: GrupoFuera, razaId: string) {
    setActivo(g.texto_norm);
    const res = await envio.ejecutar(() => asignarTextoARaza(g.texto_norm, razaId));
    setMensajes((m) => ({ ...m, [g.texto_norm]: res }));
    if (!res.error) router.refresh();
  }

  async function proponer(g: GrupoFuera) {
    setActivo(g.texto_norm);
    const res = await envio.ejecutar(() => proponerRaza({ ...form, textoNorm: g.texto_norm }));
    setMensajes((m) => ({ ...m, [g.texto_norm]: res }));
    if (!res.error) {
      setNueva(null);
      router.refresh();
    }
  }

  async function deshacer(id: string) {
    setActivo(id);
    const res = await envio.ejecutar(() => revertirNormalizacion(id));
    setMensajes((m) => ({ ...m, [id]: res }));
    if (!res.error) router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {grupos.length === 0 ? (
        <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">No hay textos de raza fuera del catálogo.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {grupos.map((g) => {
            const msg = mensajes[g.texto_norm];
            const abierta = nueva === g.texto_norm;
            return (
              <li key={g.texto_norm} className="rounded-lg border border-n-200 bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-lg font-bold text-n-900">{g.textos.map(primeraMayuscula).join(" · ")}</p>
                  <p className="text-sm font-semibold text-n-700">{g.perros === 1 ? "1 perro" : `${g.perros} perros`}</p>
                </div>
                {g.propuesta_estado === "pendiente" && (
                  <p className="mt-2 rounded-md bg-ambar-suave px-3 py-2 text-sm font-semibold text-n-900">
                    Propuesta enviada a la plataforma. Cuando la aprueben, estos perros se ligan solos.
                  </p>
                )}

                {puedeAsignar && g.propuesta_estado !== "pendiente" && (
                  <div className="mt-3 flex flex-col gap-3">
                    {g.sugerencias.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm text-n-600">Parecidas del catálogo (tú decides, nada se junta solo):</p>
                        <div className="flex flex-wrap gap-2">
                          {g.sugerencias.map((s) => (
                            <Button
                              key={s.raza_id}
                              type="button"
                              variante={s.exacta ? "primario" : "secundario"}
                              cargando={envio.cargando && activo === g.texto_norm}
                              onClick={() => asignar(g, s.raza_id)}
                            >
                              Es esta raza: {s.nombre}{" "}
                              <span className="font-normal opacity-80">({s.exacta ? "misma escritura" : `${Math.round(s.puntaje * 100)} % parecida`})</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-n-600">Ninguna raza del catálogo se le parece.</p>
                    )}

                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-56 flex-1">
                        <Select label="O elige otra raza del catálogo" value={otra[g.texto_norm] ?? ""} onChange={(e) => setOtra((o) => ({ ...o, [g.texto_norm]: e.target.value }))}>
                          <option value="">Elige una raza</option>
                          {razas.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.nombre}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <Button type="button" variante="secundario" disabled={!otra[g.texto_norm]} cargando={envio.cargando && activo === g.texto_norm} onClick={() => asignar(g, otra[g.texto_norm])}>
                        Es esta raza
                      </Button>
                      {puedeProponer && (
                        <Button
                          type="button"
                          variante="exito"
                          onClick={() => {
                            setNueva(abierta ? null : g.texto_norm);
                            setForm({ nombre: primeraMayuscula(g.textos[0] ?? ""), variantes: g.textos.slice(1).join(", "), tamanoId: "", pelajeId: "" });
                          }}
                        >
                          Es una raza nueva
                        </Button>
                      )}
                    </div>

                    {abierta && (
                      <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
                        <p className="text-sm text-n-700">
                          La plataforma revisa la propuesta antes de agregarla al catálogo que usan todos los negocios. No lleva ningún precio: el grupo de precio lo decides tú después.
                        </p>
                        <Field label="Nombre de la raza" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
                        <Field label="Otras formas de escribirla (separadas por coma)" value={form.variantes} onChange={(e) => setForm({ ...form, variantes: e.target.value })} ayuda="Como la escribe la gente: «calupo, kalupoh»." />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Select label="Talla típica" value={form.tamanoId} onChange={(e) => setForm({ ...form, tamanoId: e.target.value })}>
                            <option value="">No sé</option>
                            {tamanos.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.etiqueta}
                              </option>
                            ))}
                          </Select>
                          <Select label="Tipo de pelo" value={form.pelajeId} onChange={(e) => setForm({ ...form, pelajeId: e.target.value })}>
                            <option value="">No sé</option>
                            {pelajes.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.etiqueta}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <AccionesFormulario error={msg?.error} exito={msg?.exito}>
                          <Button type="button" cargando={envio.cargando && activo === g.texto_norm} onClick={() => proponer(g)}>
                            Enviar propuesta
                          </Button>
                          <Button type="button" variante="secundario" onClick={() => setNueva(null)}>
                            Cancelar
                          </Button>
                        </AccionesFormulario>
                      </div>
                    )}
                  </div>
                )}
                {!abierta && (msg?.error || msg?.exito) && <AccionesFormulario error={msg?.error} exito={msg?.exito}>{null}</AccionesFormulario>}
              </li>
            );
          })}
        </ul>
      )}

      {asignaciones.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold text-n-900">Asignaciones recientes</h2>
          <ul className="flex flex-col gap-2">
            {asignaciones.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-n-200 bg-white p-3">
                <div>
                  <p className="font-semibold text-n-900">
                    {a.textos.map(primeraMayuscula).join(" · ")} → {a.raza} <span className="font-normal text-n-600">· {a.perros} perro(s)</span>
                  </p>
                  <p className="text-sm text-n-600">
                    {a.hecha_por} · <Antiguedad dias={a.dias} texto={a.dias === 0 ? "hoy" : `hace ${a.dias} día(s)`} />
                    {a.revertida ? " · deshecha" : ""}
                  </p>
                </div>
                {!a.revertida && puedeAsignar && (
                  <AccionesFormulario error={mensajes[a.id]?.error} exito={mensajes[a.id]?.exito}>
                    <Button type="button" variante="secundario" cargando={envio.cargando && activo === a.id} onClick={() => deshacer(a.id)}>
                      Deshacer
                    </Button>
                  </AccionesFormulario>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
