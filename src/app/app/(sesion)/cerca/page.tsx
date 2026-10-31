import { sesionApp } from "@/lib/app/sesion";
import { Cerca } from "./cerca";

// Cerca de mí (Fase 0): lo que ya sabe la plataforma del directorio, por distancia. La Fase 4 trae lo vivo.
export default async function CercaPage() {
  const s = await sesionApp();
  const zona = s?.dueno.lat != null && s.dueno.lng != null ? { lat: s.dueno.lat, lng: s.dueno.lng } : null;
  return (
    <>
      <div className="apd-aparece">
        <span className="apd-ceja">Cerca de mí</span>
        <h1 className="apd-titulo">Lo que hay a unos minutos</h1>
        <p className="apd-linea">Veterinarias, estéticas, guarderías y hoteles cerca de ti, con su calificación. Los que usan PeluDesk van marcados.</p>
      </div>
      <section className="apd-seccion">
        <Cerca zonaGuardada={zona} />
      </section>
    </>
  );
}
