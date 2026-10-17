// fetch de los sembradores del demo (se pasa como global.fetch a createClient).
//
// Toda llamada a la base pasa por aquí. La que choca con el tope de 8 s del rol (57014: la transacción se deshizo
// sola, reintentar es seguro) se repite con espera; una lectura que el proxy corta (502/503/504 o red), también.
// Una escritura cortada a medias por la red NO se repite (pudo haber quedado): truena y el padre rehace el demo.
// Lo que tarda más de 4 s se anota, para saber qué pesa.
export async function fetchConReintento(url, init = {}) {
  const href = typeof url === "string" ? url : url.url ?? String(url);
  const metodo = String(init.method ?? "GET").toUpperCase();
  const lectura = metodo === "GET" || metodo === "HEAD";
  const ruta = new URL(href).pathname.replace(/^\/(rest|auth|storage)\/v1\//, "");
  for (let i = 1; ; i++) {
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      if (!lectura || i >= 6) throw e;
      console.log(`  ${metodo} ${ruta}: ${e.message}; reintento ${i}/5…`);
      await new Promise((r) => setTimeout(r, 3000 * i));
      continue;
    }
    const ms = Date.now() - t0;
    if (ms > 4000) console.log(`  (lento: ${metodo} ${ruta} ${(ms / 1000).toFixed(1)} s)`);
    if (res.ok || res.status < 500 || i >= 6) return res;
    const cuerpo = await res.clone().text().catch(() => "");
    const tope = /57014|statement timeout|canceling statement/i.test(cuerpo);
    if (!tope && !(lectura && [502, 503, 504].includes(res.status))) return res;
    console.log(`  ${metodo} ${ruta}: ${tope ? "tope de tiempo de la base" : `HTTP ${res.status}`}; reintento ${i}/5…`);
    await new Promise((r) => setTimeout(r, 4000 * i));
  }
}
