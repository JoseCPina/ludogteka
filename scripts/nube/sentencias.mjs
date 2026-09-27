// Parte un archivo de migración en sentencias IGUAL que el CLI de Supabase
// (pkg/parser de supabase/cli): corta en cada `;` que no esté dentro de una
// cadena '…', un identificador "…", un comentario -- o /* */ (anidables), un
// cuerpo $tag$…$tag$ ni un BEGIN ATOMIC … END; recorta espacios y el `;` final
// y descarta lo vacío. Es lo que el CLI guarda en
// supabase_migrations.schema_migrations.statements, así que scripts/nube/
// migrar-dev.mjs lo usa para registrar cada migración con el mismo formato.
// Se comprueba contra lo que el CLI ya registró: node scripts/nube/migrar-dev.mjs --comparar
export function partirSentencias(sql) {
  const sentencias = [];
  let inicio = 0;
  let i = 0;
  const n = sql.length;
  const esIdent = (c) => /[A-Za-z0-9_\u0080-￿]/.test(c);
  const palabraEn = (pos, palabra) =>
    sql.slice(pos, pos + palabra.length).toLowerCase() === palabra &&
    (pos === 0 || !esIdent(sql[pos - 1])) &&
    !esIdent(sql[pos + palabra.length] ?? " ");

  const cortar = (fin) => {
    const t = sql.slice(inicio, fin).trim().replace(/[\s;]+$/, "");
    if (t) sentencias.push(t);
    inicio = fin;
  };

  while (i < n) {
    const c = sql[i];
    if (c === "-" && sql[i + 1] === "-") {
      const fin = sql.indexOf("\n", i);
      i = fin === -1 ? n : fin + 1;
    } else if (c === "/" && sql[i + 1] === "*") {
      let prof = 1;
      i += 2;
      while (i < n && prof > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") { prof += 1; i += 2; }
        else if (sql[i] === "*" && sql[i + 1] === "/") { prof -= 1; i += 2; }
        else i += 1;
      }
    } else if (c === "'" || c === '"') {
      // '' y "" dentro de la cadena salen y vuelven a entrar: da lo mismo.
      const fin = sql.indexOf(c, i + 1);
      i = fin === -1 ? n : fin + 1;
    } else if (c === "$" && (i === 0 || !esIdent(sql[i - 1]))) {
      const m = /^\$([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/.exec(sql.slice(i, i + 200));
      if (m) {
        const fin = sql.indexOf(m[0], i + m[0].length);
        i = fin === -1 ? n : fin + m[0].length;
      } else i += 1;
    } else if ((c === "b" || c === "B") && palabraEn(i, "begin") && /^begin\s+atomic\b/i.test(sql.slice(i, i + 40))) {
      // Cuerpo SQL estándar: sus `;` no cortan hasta el END que lo cierra.
      i += 5;
      while (i < n && !(palabraEn(i, "end") && /^end\s*;/i.test(sql.slice(i, i + 10)))) i += 1;
      i += 3;
    } else if (c === ";") {
      i += 1;
      cortar(i);
    } else i += 1;
  }
  cortar(n);
  return sentencias;
}
