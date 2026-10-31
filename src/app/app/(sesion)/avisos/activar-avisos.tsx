"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { useInstalar, appInstalada } from "@/components/pwa/instalar";
import { IconoCampana, IconoCheck } from "@/components/app/iconos";
import { guardarSuscripcion, probarAviso, quitarSuscripcion } from "./acciones";

/**
 * Activar los avisos en este celular (Web Push): pide permiso, suscribe el service worker con la llave pública y la
 * guarda; después se puede probar. En iPhone solo funciona con la app instalada en la pantalla de inicio: se dice.
 */
type Estado = "revisando" | "no_soporta" | "negado" | "apagado" | "prendido";

const base64aBytes = (b64: string) => {
  const relleno = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const nada = () => () => {};

export function ActivarAvisos({ llavePublica, tieneSuscripciones }: { llavePublica: string | null; tieneSuscripciones: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const prueba = useEspera();
  const { estado: instalacion, instalar } = useInstalar();
  const instalada = useSyncExternalStore(nada, appInstalada, () => false);
  const [estado, setEstado] = useState<Estado>("revisando");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ayuda, setAyuda] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return vivo && setEstado("no_soporta");
      if (Notification.permission === "denied") return vivo && setEstado("negado");
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (vivo) setEstado(sub ? "prendido" : "apagado");
      } catch {
        if (vivo) setEstado("apagado");
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const prender = async () => {
    setError(null);
    setOk(null);
    if (!llavePublica) return setError("Los avisos no están configurados en este entorno.");
    const r = await envio.correr(async () => {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") throw new Error(permiso === "denied" ? "negado" : "sin_permiso");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64aBytes(llavePublica) }));
      const json = sub.toJSON();
      const g = await guardarSuscripcion({ endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } });
      if (g.error) throw new Error(g.error);
      return true;
    });
    if (!r.ok) {
      if (r.error === "negado") {
        setEstado("negado");
        return setError("El navegador tiene los avisos bloqueados para PeluDesk. Actívalos en los ajustes del sitio y vuelve a intentar.");
      }
      if (r.error === "sin_permiso") return setError("Sin el permiso no podemos avisarte. Puedes intentarlo cuando quieras.");
      return setError(r.error);
    }
    setEstado("prendido");
    setOk("Listo: te avisamos en este celular.");
    router.refresh();
  };

  const apagar = async () => {
    setError(null);
    setOk(null);
    const r = await envio.correr(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await quitarSuscripcion(sub.endpoint);
        await sub.unsubscribe();
      }
      return true;
    });
    if (!r.ok) return setError(r.error);
    setEstado("apagado");
    setOk("Avisos apagados en este celular.");
    router.refresh();
  };

  const probar = async () => {
    setError(null);
    setOk(null);
    const r = await prueba.ejecutar(() => probarAviso());
    if (r.error) return setError(r.error);
    setOk("Mandamos un aviso de prueba. Si no llegó en unos segundos, revisa que el navegador deje avisar a PeluDesk.");
    router.refresh();
  };

  const esIOSSinInstalar = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent) && !instalada;

  return (
    <div className="apd-tarjeta" data-activar-avisos data-estado={estado}>
      <div className="apd-fila">
        <span className="apd-foto apd-inicial" style={{ width: "3rem", height: "3rem", borderRadius: "1rem", background: estado === "prendido" ? "var(--apd-menta-suave)" : "var(--apd-morado-suave)", color: estado === "prendido" ? "var(--apd-menta-oscuro)" : "var(--apd-morado)" }} aria-hidden>
          {estado === "prendido" ? <IconoCheck style={{ width: 22, height: 22 }} /> : <IconoCampana style={{ width: 22, height: 22 }} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 800 }}>{estado === "prendido" ? "Avisos prendidos en este celular" : "Avisos en tu celular"}</p>
          <p className="apd-nota">
            {estado === "no_soporta"
              ? "Este navegador no puede mandar avisos. En el celular, instala la app y actívalos ahí."
              : estado === "negado"
                ? "El navegador los tiene bloqueados para PeluDesk. Actívalos en los ajustes del sitio."
                : estado === "prendido"
                  ? "Te avisamos de vacunas, recordatorios y cualquier cosa importante de tus mascotas."
                  : "Para que te lleguen las vacunas, los recordatorios y los avisos importantes aunque la app esté cerrada."}
          </p>
        </div>
      </div>
      {esIOSSinInstalar && estado !== "prendido" && (
        <p className="apd-aviso apd-aviso-ambar" style={{ marginTop: "0.9rem" }}>
          En iPhone los avisos solo funcionan con la app instalada: toca Compartir y luego «Agregar a inicio», ábrela desde ahí y actívalos.
        </p>
      )}
      <div className="apd-fila" style={{ marginTop: "0.9rem", flexWrap: "wrap" }}>
        {estado === "apagado" && (
          <button type="button" className="apd-boton" aria-busy={envio.cargando} disabled={envio.cargando} onClick={prender} data-prender-avisos>
            Activar avisos en este teléfono
          </button>
        )}
        {estado === "prendido" && (
          <>
            <button type="button" className="apd-boton-sec" aria-busy={prueba.cargando} disabled={prueba.cargando} onClick={probar} data-probar-aviso>
              Mandarme un aviso de prueba
            </button>
            <button type="button" className="apd-boton-suave" aria-busy={envio.cargando} disabled={envio.cargando} onClick={apagar}>
              Apagar aquí
            </button>
          </>
        )}
        {instalacion !== "instalada" && !instalada && (
          <button
            type="button"
            className="apd-boton-suave"
            data-instalar-app
            onClick={async () => {
              const r = await instalar();
              setAyuda(r === "instrucciones" ? (instalacion === "ios" ? "En Safari: toca Compartir (el cuadrito con la flecha) y luego «Agregar a inicio»." : "En el menú del navegador (los tres puntos) busca «Instalar app» o «Agregar a pantalla de inicio».") : null);
            }}
          >
            Instalar la app
          </button>
        )}
      </div>
      {ayuda && <p className="apd-nota" style={{ marginTop: "0.6rem" }}>{ayuda}</p>}
      {tieneSuscripciones && estado === "apagado" && <p className="apd-nota" style={{ marginTop: "0.6rem" }}>Ya tienes avisos prendidos en otro dispositivo.</p>}
      {error && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.75rem" }}>{error}</p>}
      {ok && <p className="apd-aviso apd-aviso-ok" role="status" style={{ marginTop: "0.75rem" }}>{ok}</p>}
    </div>
  );
}
