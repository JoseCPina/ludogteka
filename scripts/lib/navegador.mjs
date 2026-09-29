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

export function abrirNavegador() {
  const executablePath = process.platform === "win32" ? headlessShellDeWindows() : undefined;
  return chromium.launch({ executablePath, args: ["--disable-gpu", "--lang=es-MX"] });
}
