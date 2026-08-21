// Execute the shipped client bundle exactly the way the browser loader does:
// run the classic script (window.__ModuleLoader__.load registers the factory),
// then materialize with a synchronous require. The bundle imports only react,
// react/jsx-runtime, and @deepseek-ai/dsh-client-ui-primitives; since 0.1.1-rc.2
// the primitives package ships inside the web frontend's static module table
// (its source imports CSS, which only a real browser build handles), so we
// stub it here and resolve react from the host install.
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const dshRoot = "C:/Users/dacon/AppData/Local/nvm/v25.2.1/node_modules/@deepseek-ai/dsh";
const hostRequire = createRequire(join(dshRoot, "package.json"));

const react = hostRequire("react");
const primitivesStub = { Button: () => null, Input: () => null, StateDot: () => null };
const moduleTable = {
  react,
  "react/jsx-runtime": hostRequire("react/jsx-runtime"),
  "@deepseek-ai/dsh-client-ui-primitives": primitivesStub,
};
const simulateRequire = (id) => {
  const resolved = moduleTable[id];
  if (resolved === undefined) throw new Error(`unexpected require in client bundle: ${id}`);
  return resolved;
};

let captured;
globalThis.window = {
  __ModuleLoader__: {
    load: (entry) => {
      captured = entry;
    },
  },
};

const code = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
if (/^\s*(import|export)\s/m.test(code)) throw new Error("client bundle contains top-level ESM statements");
new Function(code)();
if (captured === undefined) throw new Error("client bundle did not register with __ModuleLoader__");

const exports_ = captured.factory(simulateRequire);
console.log(JSON.stringify({
  ok: true,
  id: captured.id,
  hasApply: typeof exports_.apply === "function",
  inject: exports_.inject,
  hasSectionComponent: typeof exports_.KolmoPdfSettingsSection === "function",
}));

