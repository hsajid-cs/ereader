const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Monorepo: let Metro see the workspace root's node_modules and the shared package.
config.watchFolders = [path.resolve(__dirname, "..")];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "../node_modules"),
];

// `EREADER_WEB_HARNESS=1 expo export --platform web` swaps native-only modules for browser shims so the
// real screens can be driven in a browser for layout checks. Normal builds are unaffected.
if (process.env.EREADER_WEB_HARNESS) {
  const shims = path.resolve(__dirname, "web-harness/shims");
  const alias = {
    "expo-secure-store": "secure-store.ts",
    "expo-file-system": "file-system.ts",
    "@shopify/react-native-skia": "skia.tsx",
    "react-native-webview": "webview.tsx",
    "expo-speech": "noop-module.ts",
    "expo-brightness": "noop-module.ts",
    "expo-keep-awake": "noop-module.ts",
    "expo-document-picker": "noop-module.ts",
  };
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === "web" && alias[moduleName]) {
      return { type: "sourceFile", filePath: path.join(shims, alias[moduleName]) };
    }
    return (upstream ?? context.resolveRequest)(context, moduleName, platform);
  };
}

module.exports = config;
