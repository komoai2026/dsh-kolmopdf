import { defineConfig } from "tsup";

// Host and CLI entries are plain ESM for Node. The browser half is built by
// scripts/build-client.mjs as the rc.6 loader factory bundle (classic script,
// `window.__ModuleLoader__.load({ id, factory })`); see that file.
export default defineConfig({
  entry: { index: "src/index.ts", cli: "src/cli.ts" },
  format: ["esm"],
  target: "es2022",
  platform: "neutral",
  outDir: "lib",
  dts: { entry: { index: "src/index.ts", cli: "src/cli.ts" } },
  sourcemap: true,
  splitting: false,
  clean: true,
  treeshake: true,
  external: [
    "react",
    "react/jsx-runtime",
    "@deepseek-ai/cordis",
    "@deepseek-ai/dsh-api-remotes",
    "@deepseek-ai/dsh-api-remotes/client",
    "@deepseek-ai/dsh-client-connection",
    "@deepseek-ai/dsh-client-connection/client",
    "@deepseek-ai/dsh-client-locale",
    "@deepseek-ai/dsh-client-locale/client",
    "@deepseek-ai/dsh-client-runtime",
    "@deepseek-ai/dsh-client-runtime/client",
    "@deepseek-ai/dsh-client-ui-primitives",
    "@deepseek-ai/dsh-client-ui-settings",
    "@deepseek-ai/dsh-client-ui-settings/client",
    "@deepseek-ai/dsh-client-ui-slots",
    "@deepseek-ai/dsh-system-prompt",
    "@deepseek-ai/dsh-tools",
    "@deepseek-ai/dsh-settings",
    "@deepseek-ai/dsh-home-paths",
    "@deepseek-ai/schemastery",
  ],
});
