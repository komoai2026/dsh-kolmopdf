// Build the browser half as the dsh 0.2.x loader factory bundle.
//
// The client module system serves every `dsh.client` package's
// exports["./client"] as a classic script that registers itself:
//
//   window.__ModuleLoader__.load({ id, factory: (require) => { ... return module.exports; } });
//
// External packages resolve through the factory's `require` against DSH's
// shared PLATFORM_MODULES table. Host and CLI entries remain plain ESM for Node.
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

const external = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "zod",
  "@tanstack/react-virtual",
  "@deepseek-ai/dsh-client-store",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-primitives",
  "@deepseek-ai/dsh-client-ui-dockkit",
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
    js: 'window.__ModuleLoader__.load({ id: "@kolmopdf/dsh-kolmopdf", factory: (require) => {\n"use strict";\nvar module = { exports: {} };\nvar exports = module.exports;\nObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
  },
  footer: {
    js: "\nreturn module.exports;\n} });",
  },
});
