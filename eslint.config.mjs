import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Videos de producto: dependencias propias y proyectos generados.
    "scripts/videos/node_modules/**",
    "scripts/videos/.build/**",
    "scripts/videos/grabaciones/**",
  ]),
]);

export default eslintConfig;
