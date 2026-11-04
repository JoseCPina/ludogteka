// La app nativa tiene su propio lint (la raíz del repo la ignora): la configuración de Expo.
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([expoConfig, { ignores: ["dist/*", ".expo/*", "android/*", "ios/*"] }]);
