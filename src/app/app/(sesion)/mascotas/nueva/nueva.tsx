"use client";

import { useRef, useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { comprimirImagen } from "@/lib/imagen";
import { IconoCamara, IconoFlecha } from "@/components/app/iconos";
import { crearMascota } from "./acciones";

const ESPECIES = [
  { clave: "perro", nombre: "Perro" },
  { clave: "gato", nombre: "Gato" },
  { clave: "otro", nombre: "Otra" },
];

export function NuevaMascota() {
  const envio = useEspera();
  const [especie, setEspecie] = useState("perro");
  const [sexo, setSexo] = useState("");
  const [vista, setVista] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const foto = useRef<Blob | null>(null);
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      className="apd-lista"
      data-nueva-mascota
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(form.current!);
        fd.set("especie", especie);
        fd.set("sexo", sexo);
        fd.delete("foto");
        if (foto.current) fd.set("foto", new File([foto.current], "foto.jpg", { type: "image/jpeg" }));
        const r = await envio.ejecutar(() => crearMascota(fd));
        if (r?.error) setError(r.error);
      }}
    >
      <div className="apd-tarjeta apd-aparece" style={{ ["--i" as string]: 1 }}>
        <label className="apd-etiqueta" htmlFor="nm-nombre">¿Cómo se llama?</label>
        <input id="nm-nombre" name="nombre" className="apd-campo" required maxLength={60} autoComplete="off" placeholder="Canela" data-campo-nombre />
        <p className="apd-etiqueta" style={{ marginTop: "1rem" }}>¿Qué es?</p>
        <div className="apd-tabs" role="group" aria-label="Especie">
          {ESPECIES.map((x) => (
            <button key={x.clave} type="button" className="apd-tab" aria-pressed={especie === x.clave} onClick={() => setEspecie(x.clave)} data-especie={x.clave}>{x.nombre}</button>
          ))}
        </div>
        {especie === "otro" && <input name="especie_detalle" className="apd-campo" style={{ marginTop: "0.6rem" }} placeholder="Conejo, hámster, tortuga…" maxLength={40} />}
        <p className="apd-etiqueta" style={{ marginTop: "1rem" }}>¿Macho o hembra?</p>
        <div className="apd-tabs" role="group" aria-label="Sexo">
          {[["macho", "Macho"], ["hembra", "Hembra"], ["", "No sé / no aplica"]].map(([v, t]) => (
            <button key={v} type="button" className="apd-tab" aria-pressed={sexo === v} onClick={() => setSexo(v)}>{t}</button>
          ))}
        </div>
        <label className="apd-etiqueta" htmlFor="nm-raza" style={{ marginTop: "1rem" }}>Raza (si quieres)</label>
        <input id="nm-raza" name="raza" className="apd-campo" maxLength={60} placeholder="Mestizo, Schnauzer, Siamés…" />
        <label className="apd-etiqueta" htmlFor="nm-nac" style={{ marginTop: "1rem" }}>¿Cuándo nació? (aproximado está bien)</label>
        <input id="nm-nac" name="fecha_nacimiento" type="date" className="apd-campo" max={new Date().toISOString().slice(0, 10)} />
      </div>

      <div className="apd-tarjeta apd-aparece" style={{ ["--i" as string]: 2 }}>
        <p className="apd-etiqueta">Su foto (si quieres)</p>
        <div className="apd-fila">
          {vista ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vista} alt="" className="apd-foto" />
          ) : (
            <span className="apd-foto apd-inicial" aria-hidden><IconoCamara style={{ width: 26, height: 26 }} /></span>
          )}
          <label className="apd-boton-sec" style={{ cursor: "pointer" }}>
            {vista ? "Cambiar foto" : "Escoger o tomar foto"}
            <input
              type="file"
              name="foto"
              accept="image/*"
              style={{ display: "none" }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const b = await comprimirImagen(f, 1000);
                  foto.current = b;
                  setVista(URL.createObjectURL(b));
                } catch {
                  foto.current = f;
                  setVista(URL.createObjectURL(f));
                }
              }}
            />
          </label>
        </div>
      </div>

      {error && <p className="apd-aviso apd-aviso-error" role="alert">{error}</p>}
      <button type="submit" className="apd-boton apd-boton-ancho apd-aparece" style={{ ["--i" as string]: 3 }} aria-busy={envio.cargando} disabled={envio.cargando} data-guardar-mascota>
        Guardar y seguir con su cartilla
        <span className="apd-boton-flecha"><IconoFlecha style={{ width: 16, height: 16 }} /></span>
      </button>
    </form>
  );
}
