// Execute the shipped client bundle exactly the way the browser loader does:
// run the classic script (window.__ModuleLoader__.load registers the factory),
// then materialize with a synchronous require against PLATFORM_MODULES.
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const dshRoot = process.env.DSH_ROOT;
const hostRequire = createRequire(dshRoot ? join(dshRoot, "package.json") : import.meta.url);

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
