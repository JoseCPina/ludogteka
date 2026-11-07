// Doble de Google (Geocoding + Routes) para grabar los videos que piden una ruta al mapa (54: «Guardar y calcular»,
// «Cotizar recolección»). La app se arranca con GOOGLE_MAPS_API_KEY=de-prueba GOOGLE_API_URL=http://127.0.0.1:4457
// (lo hace tanda.mjs); nunca se gasta una consulta real al grabar. Mismo contrato que el doble de recoleccion-dev.mjs.
//
//   node scripts/tutoriales/lib/doble-google.mjs        (solo, en primer plano)
import http from "node:http";

export const PUERTO_DOBLE = 4457;
const ORIGEN = { lat: 22.1565, lng: -100.9855 }; // el local del demo (San Luis Potosí, inventado)
const hash = (t) => [...String(t)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);

/** Levanta el doble y devuelve el servidor (ciérralo con `servidor.close()`). */
export function levantarDobleGoogle(puerto = PUERTO_DOBLE) {
  const servidor = http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      const j = (status, o) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      const u = new URL(req.url, "http://doble");
      if (u.pathname.endsWith("/geocode/json")) {
        if (u.searchParams.get("latlng")) return j(200, { status: "OK", results: [{ formatted_address: "Av. Propuesta 77, Centro" }] });
        const d = u.searchParams.get("address") ?? "";
        return j(200, { status: "OK", results: [{ geometry: { location_type: "ROOFTOP", location: { lat: ORIGEN.lat + 0.03 + hash(d.toLowerCase()) / 100000, lng: ORIGEN.lng + 0.02 } } }] });
      }
      if (u.pathname.endsWith(":computeRoutes")) return j(200, { routes: [{ distanceMeters: 6400 + (hash(b) % 30) * 100 }] });
      j(404, {});
    });
  });
  return new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(puerto, "127.0.0.1", () => resolve(servidor));
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  await levantarDobleGoogle();
  console.log(`doble de Google en ${PUERTO_DOBLE}`);
}
