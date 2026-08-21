// Build the browser half as the dsh 0.1.1-rc.1 loader factory bundle.
//
// The 0.1.1-rc.1 client module system serves every `dsh.client` package's
// exports["./client"] as a classic script that registers itself:
//
//   window.__ModuleLoader__.load({ id, factory: (require) => { ... return module.exports; } });
//
// (see installed @deepseek-ai/dsh-client-ui-theme/lib/client.js). The browser
// inserts it with a plain <script> tag, so the bundle must not contain ESM
// `import` statements; external packages resolve through the factory's
// `require`. Host and CLI entries remain plain ESM for Node.
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

const external = [
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
];

mkdirSync("lib", { recursive: true });
await build({
  entryPoints: ["src/client.tsx"],
  outfile: "lib/client.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  external,
  sourcemap: true,
  logLevel: "info",
  banner: {
    // The loader's factory environment has no Node globals; define the CJS
    // harness exactly like the shipped 0.1.1-rc.1 bundles (dsh-client-ui-theme).
    js: 'window.__ModuleLoader__.load({ id: "kolmopdf", factory: (require) => {\n"use strict";\nvar module = { exports: {} };\nvar exports = module.exports;\nObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
  },
  footer: {
    js: "\nreturn module.exports;\n} });",
  },
});
