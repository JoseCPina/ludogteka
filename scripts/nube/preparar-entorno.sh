#!/usr/bin/env bash
# Arranque del entorno de Claude Code en la nube (claude.ai/code).
#
# Se corre desde el campo "Setup script" del entorno:
#     bash scripts/nube/preparar-entorno.sh
# y otra vez al inicio de cada sesión por el hook SessionStart de
# .claude/settings.json (scripts/nube/sesion.mjs), porque el resultado del
# setup se guarda en caché y el repo puede haber cambiado de dependencias
# desde entonces. Es idempotente: lo que ya está, lo salta.
#
# NUNCA escribe un secreto en el repo. Los valores llegan como variables de
# entorno (configuración del entorno en claude.ai/code) y lo único que se
# escribe con ellos es .env.local, que está en .gitignore y solo lleva las
# llaves de DESARROLLO (el script se niega si le llegan las de producción).
set -euo pipefail
cd "$(dirname "$0")/../.."

paso() { printf '\n== %s\n' "$*"; }
aviso() { printf '   AVISO: %s\n' "$*" >&2; }
SUDO=""
if [ "$(id -u)" != "0" ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi

# ------------------------------------------------------------------ Node
# El repo usa Map.groupBy y otras cosas de Node 22+; en la computadora del
# dueño corre Node 24.
paso "Node"
mayor=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$mayor" -lt 22 ]; then
  echo "   Node $(node -v 2>/dev/null || echo ausente) es viejo; instalando Node 24 con n"
  npm install -g n --no-audit --no-fund
  $SUDO n 24
  hash -r
fi
echo "   node $(node -v) · npm $(npm -v)"

# ------------------------------------------------------------ dependencias
# Incluye el CLI de Supabase (devDependency `supabase`: su postinstall baja
# el binario de los releases de GitHub) y playwright-core.
paso "Dependencias (npm ci)"
huella=$(sha256sum package-lock.json | cut -c1-16)
if [ -f node_modules/.huella-lock ] && [ "$(cat node_modules/.huella-lock)" = "$huella" ]; then
  echo "   node_modules ya corresponde a package-lock.json"
else
  npm ci --no-audit --no-fund
  echo "$huella" > node_modules/.huella-lock
fi
echo "   supabase $(node node_modules/supabase/dist/supabase.js --version)"

# ------------------------------------------------------------ Vercel CLI
paso "CLI de Vercel"
if ! command -v vercel >/dev/null 2>&1; then
  npm install -g vercel@latest --no-audit --no-fund
fi
echo "   vercel $(vercel --version 2>/dev/null | tail -n 1)"
# El despliegue consulta `vercel ls ludogteka`: sin carpeta .vercel el CLI
# toma el equipo y el proyecto de VERCEL_ORG_ID / VERCEL_PROJECT_ID. Se deja
# también el archivo (en .gitignore) para los comandos que no leen el entorno.
if [ -n "${VERCEL_ORG_ID:-}" ] && [ -n "${VERCEL_PROJECT_ID:-}" ] && [ ! -f .vercel/project.json ]; then
  mkdir -p .vercel
  printf '{"projectId":"%s","orgId":"%s","projectName":"ludogteka"}\n' "$VERCEL_PROJECT_ID" "$VERCEL_ORG_ID" > .vercel/project.json
fi

# ------------------------------------------------------------ Playwright
# Chromium sin cabeza con sus librerías del sistema (apt). La versión la
# decide el playwright-core del repo; scripts/lib/navegador.mjs lo encuentra.
paso "Playwright + Chromium"
if ! npx --no-install playwright-core install --with-deps chromium; then
  aviso "no se pudieron instalar las librerías del sistema; se intenta solo el navegador"
  npx --no-install playwright-core install chromium || aviso "Playwright quedó sin navegador"
fi

# ------------------------------------------------------------ .env.local
# Solo DESARROLLO (sgfolltpvktbsiisfuzq). Las auditorías y siembras leen este
# archivo; Next también, aunque las variables del proceso mandan.
paso ".env.local (desarrollo)"
if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  aviso "NEXT_PUBLIC_SUPABASE_URL no está en el entorno: no se escribe .env.local"
elif [ -f .env.local ] && [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  echo "   ya existe y esto no es la nube: no se toca"
elif [[ "$NEXT_PUBLIC_SUPABASE_URL" != *sgfolltpvktbsiisfuzq* ]]; then
  echo "   ERROR: NEXT_PUBLIC_SUPABASE_URL no es el proyecto de desarrollo. Las llaves" >&2
  echo "   de producción viven solo en Vercel; en el entorno de la nube van las de desarrollo." >&2
  exit 1
else
  umask 077
  url_negocios_dev='http://{slug}.localhost:3001'
  {
    echo "# Generado por scripts/nube/preparar-entorno.sh desde las variables del entorno."
    echo "# Solo DESARROLLO. No se commitea (.gitignore)."
    echo "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL"
    echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"
    echo "SUPABASE_SECRET_KEY=${SUPABASE_SECRET_KEY:-}"
    echo "LUDOGTEKA_URL_PUBLICA=${LUDOGTEKA_URL_PUBLICA:-http://localhost:3001}"
    echo "PELUDESK_URL_DESARROLLO=${PELUDESK_URL_DESARROLLO:-$url_negocios_dev}"
  } > .env.local
  echo "   escrito (sin Mercado Pago ni Google Maps: corren en simulación)"
fi

# ------------------------------------------------- Supabase CLI → desarrollo
# El CLI queda ligado a DESARROLLO, igual que en la computadora del dueño.
# Producción nunca se liga: se le pasa --db-url (scripts/desplegar-produccion.mjs).
paso "Supabase CLI ligado a desarrollo"
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  aviso "sin SUPABASE_ACCESS_TOKEN: el CLI no puede ligar ni leer llaves de producción"
elif [ -f supabase/.temp/project-ref ] && [ "$(cat supabase/.temp/project-ref)" = "sgfolltpvktbsiisfuzq" ]; then
  echo "   ya ligado a sgfolltpvktbsiisfuzq"
else
  # SUPABASE_DB_PASSWORD (la de desarrollo) la lee el CLI del entorno.
  node node_modules/supabase/dist/supabase.js link --project-ref sgfolltpvktbsiisfuzq \
    || aviso "no se pudo ligar; revisa SUPABASE_ACCESS_TOKEN / SUPABASE_DB_PASSWORD y el acceso a red"
fi

paso "Listo. Comprobación completa: node scripts/nube/verificar-entorno.mjs"
