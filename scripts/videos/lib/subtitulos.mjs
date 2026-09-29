// Subtítulos a partir de la locución de cada escena.
//
// Sin voz grabada, los tiempos salen del guion: la ventana de voz de cada
// escena (voz.desde → voz.hasta) se reparte entre frases cortas según sus
// letras. Quien grabe la voz lee al ritmo de esa ventana (el guion.md que
// genera producir.mjs la dice por escena). Con voz de ElevenLabs, los
// tiempos salen de su alineación letra por letra.

// Parte un texto en frases de a lo más `max` letras, cortando de
// preferencia en la puntuación y nunca a media palabra.
export function frases(texto, max) {
  const partes = texto.replace(/\s+/g, " ").trim().split(/(?<=[.,;:?!])\s+/);
  const salida = [];
  for (const parte of partes) {
    if (parte.length <= max) { salida.push(parte); continue; }
    let actual = "";
    for (const palabra of parte.split(" ")) {
      if ((actual + " " + palabra).trim().length > max && actual) { salida.push(actual); actual = palabra; }
      else actual = (actual + " " + palabra).trim();
    }
    if (actual) salida.push(actual);
  }
  // Junta una frase muy corta con la siguiente si caben.
  const juntas = [];
  for (const f of salida) {
    const prev = juntas.at(-1);
    if (prev && prev.length < 12 && (prev + " " + f).length <= max) juntas[juntas.length - 1] = prev + " " + f;
    else juntas.push(f);
  }
  return juntas;
}

export function partirSubtitulos(escenas, { max, alineacion } = {}) {
  const subs = [];
  for (const e of escenas) {
    if (!e.voz?.texto) continue;
    const lista = frases(e.voz.subtitulo ?? e.voz.texto, max);
    const al = alineacion?.[e.id];
    if (al) {
      // Alineación de ElevenLabs ({ caracteres, inicios, fines }, relativos al
      // audio de la escena) → palabras dichas con su inicio y su fin.
      const dichas = palabrasDichas(al);
      const nSub = lista.reduce((s, f) => s + f.split(" ").length, 0);
      const base = e.inicio + e.voz.desde;
      let k = 0;
      for (const f of lista) {
        const n = f.split(" ").length;
        // Mismo número de palabras (lo normal): palabra por palabra. Si el
        // subtítulo escribe distinto lo que se dice («peludesk.mx» por
        // «peludesk punto mx»), en proporción.
        const a = nSub === dichas.length ? k : Math.round((k / nSub) * dichas.length);
        const b = nSub === dichas.length ? k + n - 1 : Math.max(a, Math.round(((k + n) / nSub) * dichas.length) - 1);
        subs.push({ escena: e.id, texto: f, inicio: base + dichas[a].inicio, fin: base + dichas[Math.min(b, dichas.length - 1)].fin + 0.15 });
        k += n;
      }
      // Uno no se queda en pantalla encima del que sigue.
      for (let i = subs.length - lista.length; i < subs.length - 1; i++) subs[i].fin = Math.min(subs[i].fin, subs[i + 1].inicio - 0.02);
      continue;
    }
    const desde = e.inicio + e.voz.desde;
    const hasta = e.inicio + (e.voz.hasta ?? e.duracion - 0.3);
    const letras = lista.reduce((s, f) => s + f.length + 6, 0);
    let t = desde;
    for (const f of lista) {
      const d = ((f.length + 6) / letras) * (hasta - desde);
      subs.push({ escena: e.id, texto: f, inicio: t, fin: t + d - 0.06 });
      t += d;
    }
  }
  return subs;
}

function palabrasDichas(al) {
  const salida = [];
  let actual = null;
  al.caracteres.forEach((ch, i) => {
    if (/\s/.test(ch)) { actual = null; return; }
    if (!actual) { actual = { inicio: al.inicios[i], fin: al.fines[i] }; salida.push(actual); }
    else actual.fin = al.fines[i];
  });
  return salida;
}

const hms = (s) => {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), seg = Math.floor((ms % 60000) / 1000), mil = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(seg).padStart(2, "0")},${String(mil).padStart(3, "0")}`;
};

export function srt(subs) {
  return subs.map((s, i) => `${i + 1}\n${hms(s.inicio)} --> ${hms(s.fin)}\n${s.texto}\n`).join("\n");
}
