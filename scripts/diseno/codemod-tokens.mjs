// Lleva las clases hechas a mano de una pantalla del panel a los tokens de docs/diseno/DESIGN.md. Se corre POR ÁREA
// del rediseño (carpetas que se pasan), nunca sobre todo src/ de golpe, y después se revisa cada pantalla a ojo.
//   node scripts/diseno/codemod-tokens.mjs "src/app/(staff)/hotel" "src/app/(staff)/reservas" [--ver]
// --ver: solo cuenta lo que cambiaría.
//
// Qué cambia (y por qué):
//   · border-n-200 → border-border, divide-n-200 → divide-border: el borde decorativo sale del token «línea».
//   · Tarjeta blanca «rounded-lg border border-border bg-white» → + bg-card y shadow-tarjeta (DESIGN.md → «Tarjeta»).
//   · Panel crema «rounded-lg border border-border bg-n-50» → tarjeta (el lienzo del panel ya no es crema).
//   · bg-n-50 / hover:bg-n-50 sueltos → bg-muted / hover:bg-muted (fondo secundario y hover del panel).
//   · Título de sección en mayúsculas «text-sm font-bold uppercase tracking-wide text-n-600» → título de tarjeta
//     (15 px, 600, foreground): los grupos en mayúsculas quedan solo en el menú y los encabezados de tabla.
//   · «text-lg font-bold text-n-900» → «text-lg font-semibold text-foreground» (título de sección, DESIGN.md 2.3).
//   · Encabezado de tabla «bg-n-100 … text-xs font-bold uppercase tracking-wide text-n-600» → fondo muted.
//   · Control suelto min-h-12 / border-borde bg-white → 44 px, border-input bg-card (DESIGN.md → «Campo»).
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const soloVer = args.includes("--ver");
const dirs = args.filter((a) => !a.startsWith("--"));
if (!dirs.length) throw new Error("Pasa al menos una carpeta.");

const REGLAS = [
  [/\bdivide-n-200\b/g, "divide-border"],
  [/\bborder-n-200\b/g, "border-border"],
  [/rounded-lg border border-border bg-n-50\b/g, "rounded-lg border border-border bg-card shadow-tarjeta"],
  [/rounded-lg border border-border bg-white\b(?! shadow)/g, "rounded-lg border border-border bg-card shadow-tarjeta"],
  [/rounded-md border border-border bg-white\b/g, "rounded-md border border-border bg-card"],
  [/\bhover:bg-n-50\b/g, "hover:bg-muted"],
  [/(?<![:\w-])bg-n-50\b/g, "bg-muted"],
  [/text-sm font-bold uppercase tracking-wide text-n-600/g, "text-[0.9375rem] font-semibold text-foreground"],
  [/text-lg font-bold text-n-900/g, "text-lg font-semibold text-foreground"],
  [/text-lg font-bold capitalize text-n-900/g, "text-lg font-semibold capitalize text-foreground"],
  [/\bbg-n-100 (px-\d(?:\.5)? py-\d(?:\.5)? text-left text-xs) font-bold uppercase tracking-wide text-n-600/g, "bg-muted $1 font-semibold text-muted-foreground"],
  [/min-h-12 rounded-md border-\[1\.5px\] border-borde bg-white/g, "min-h-11 rounded-md border-[1.5px] border-input bg-card"],
];

let archivos = 0, cambios = 0;
const recorrer = (d) => {
  const entradas = fs.statSync(d).isDirectory() ? fs.readdirSync(d, { withFileTypes: true }).map((e) => ({ e, p: path.join(d, e.name) })) : [{ e: { name: path.basename(d), isDirectory: () => false }, p: d }];
  for (const { e, p: pp } of entradas) {
    const p = pp;
    if (e.isDirectory()) recorrer(p);
    else if (/\.tsx$/.test(e.name)) {
      const antes = fs.readFileSync(p, "utf8");
      let c = antes, n = 0;
      for (const [re, rep] of REGLAS) c = c.replace(re, (...m) => { n++; return typeof rep === "string" ? rep.replace("$1", m[1] ?? "") : rep; });
      if (c !== antes) {
        archivos++;
        cambios += n;
        if (!soloVer) fs.writeFileSync(p, c);
        console.log(`  ${n.toString().padStart(3)}  ${p}`);
      }
    }
  }
};
for (const d of dirs) recorrer(d);
console.log(`${soloVer ? "Cambiaría" : "Cambió"}: ${cambios} clases en ${archivos} archivos.`);
