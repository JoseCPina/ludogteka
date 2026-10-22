// Abre el Chromium sin cabeza de Playwright, en Windows y en la nube.
//
// En la computadora del dueño (Windows) se usa el chrome-headless-shell que
// dejó instalado el Playwright MCP en %LOCALAPPDATA%\ms-playwright: la versión
// de playwright-core del repo no siempre trae el mismo número de build. En la
// nube (Linux) el navegador lo instala scripts/nube/preparar-entorno.sh con
// `npx playwright-core install chromium`, que baja justo el que esta versión
// espera, y chromium.launch() lo encuentra solo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

function headlessShellDeWindows() {
  const raiz = path.join(os.homedir(), "AppData/Local/ms-playwright");
  if (!fs.existsSync(raiz)) return undefined;
  const carpetas = fs.readdirSync(raiz).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse();
  for (const carpeta of carpetas) {
    const dir = path.join(raiz, carpeta);
    const sub = fs.readdirSync(dir).find((x) => fs.existsSync(path.join(dir, x, "chrome-headless-shell.exe")));
    if (sub) return path.join(dir, sub, "chrome-headless-shell.exe");
  }
  return undefined;
}

// Las auditorías corren contra un servidor que habla con Supabase por un proxy (en la nube cada viaje
// a la base tarda 0.2–0.6 s y una pantalla del personal hace varios): con los 30 s de Playwright, una
// pantalla lenta pero sana se contaba como fallo. Solo las auditorías reciben el tope más largo; los
// videos conservan el suyo.
const TOPE_ACCION_MS = 45_000;
const TOPE_NAVEGACION_MS = 90_000;
const esAuditoria = () => /[\\/]auditoria[\\/]/.test(process.argv[1] ?? "");

function conTopes(contexto) {
  contexto.setDefaultTimeout(TOPE_ACCION_MS);
  contexto.setDefaultNavigationTimeout(TOPE_NAVEGACION_MS);
  return contexto;
}

// Una auditoría con navegador a la vez, y con un solo proceso de render (22 de octubre de 2026): desde que todo el
// ciclo corre en la computadora del dueño, dos auditorías con Chromium + `next start` al mismo tiempo se quedan
// sin memoria. El candado es un archivo en la carpeta temporal con el pid de quien lo tiene; la segunda auditoría
// espera a que la primera termine (o a que su proceso ya no exista). Un mismo proceso puede abrir varios
// navegadores (la teleconsulta abre dos). AUDITORIA_PARALELO=1 lo apaga.
const CANDADO = path.join(os.tmpdir(), "peludesk-auditoria-navegador.lock");
let tengoCandado = false;
function vivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
async function tomarCandado() {
  if (tengoCandado || process.env.AUDITORIA_PARALELO === "1") return;
  let avisado = false;
  for (;;) {
    try {
      fs.writeFileSync(CANDADO, String(process.pid), { flag: "wx" });
      tengoCandado = true;
      const soltar = () => {
        try {
          if (fs.readFileSync(CANDADO, "utf8").trim() === String(process.pid)) fs.unlinkSync(CANDADO);
        } catch {}
      };
      // Al salir se suelta; si el proceso muere sin pasar por aquí, el siguiente ve que el pid ya no existe.
      process.on("exit", soltar);
      return;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const pid = Number(fs.readFileSync(CANDADO, "utf8").trim() || 0);
      if (!pid || !vivo(pid)) {
        try { fs.unlinkSync(CANDADO); } catch {}
        continue;
      }
      if (!avisado) {
        console.log(`[navegador] otra auditoría con navegador corre (pid ${pid}); espero a que termine…`);
        avisado = true;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

export async function abrirNavegador(argsExtra = []) {
  const auditoria = esAuditoria();
  if (auditoria) await tomarCandado();
  const executablePath = process.platform === "win32" ? headlessShellDeWindows() : undefined;
  // En auditorías, un solo proceso de render para todas las pestañas (cada contexto sigue con su propia sesión).
  const unSoloRender = auditoria && process.env.AUDITORIA_PARALELO !== "1" ? ["--renderer-process-limit=1"] : [];
  const navegador = await chromium.launch({ executablePath, args: ["--disable-gpu", "--lang=es-MX", ...unSoloRender, ...argsExtra] });
  if (!auditoria) return navegador;
  const nuevoContexto = navegador.newContext.bind(navegador);
  navegador.newContext = async (opciones) => conTopes(await nuevoContexto(opciones));
  const nuevaPagina = navegador.newPage.bind(navegador);
  navegador.newPage = async (opciones) => {
    const pagina = await nuevaPagina(opciones);
    conTopes(pagina.context());
    return pagina;
  };
  return navegador;
}
