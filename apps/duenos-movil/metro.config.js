// Metro de Expo con los ids que Sentry usa para leer los errores de JavaScript con su línea original.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

module.exports = getSentryExpoConfig(__dirname);
