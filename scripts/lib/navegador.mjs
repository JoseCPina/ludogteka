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

export async function abrirNavegador(argsExtra = []) {
  const executablePath = process.platform === "win32" ? headlessShellDeWindows() : undefined;
  const navegador = await chromium.launch({ executablePath, args: ["--disable-gpu", "--lang=es-MX", ...argsExtra] });
  if (!esAuditoria()) return navegador;
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
