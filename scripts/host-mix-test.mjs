// Reproduce the real profile composition WITHOUT touching the live profile:
// host DSH dependencies + the workspace plugin as separate module copies.
// Set DSH_ROOT to the installed @deepseek-ai/dsh package directory (optional;
// falls back to the workspace devDependencies).
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const dshRoot = process.env.DSH_ROOT;
const hostRequire = createRequire(dshRoot ? join(dshRoot, "package.json") : import.meta.url);
const hostImport = (id) => import(pathToFileURL(hostRequire.resolve(id)).href);

const [cordis, SystemPrompt, ToolRuntime, yaml] = await Promise.all([
  hostImport("@deepseek-ai/cordis"),
  hostImport("@deepseek-ai/dsh-system-prompt"),
  hostImport("@deepseek-ai/dsh-tools"),
  import("yaml"),
]);
const { Context } = cordis;

const plugin = await import(new URL("../lib/index.js", import.meta.url).href);
const ctx = new Context();
ctx.provide("credentials", {
  resolve: async () => ({ value: "sk-mock-credential" }),
});
let configuredAuto = null;
ctx.provide("settings", {
  configure: (presentation) => {
    configuredAuto = presentation.auto;
    return () => {};
  },
});
const fibers = [
  await ctx.plugin(SystemPrompt.default, {}),
  await ctx.plugin(ToolRuntime.default, {}),
  await ctx.plugin(plugin, {}),
];
const names = ctx.tools.schemas().map((t) => t.name);
const tool = ctx.tools.get("kolmopdf_check_balance");
if (!tool) throw new Error("kolmopdf_check_balance was not registered");
let resolvedFromCredentials = false;
try {
  await tool.execute({}, {
    callId: "mix-test-1",
    rootCallId: "mix-test-1",
    name: "kolmopdf_check_balance",
    arguments: {},
    token: Symbol("test"),
    signal: new AbortController().signal,
    deferContext() {},
    concludeTurn() {},
  });
} catch (err) {
  resolvedFromCredentials = !String(err instanceof Error ? err.message : err).includes("not configured");
}
if (!resolvedFromCredentials) throw new Error("Tool failed with missing credentials despite provider");
if (configuredAuto !== false) throw new Error(`Expected settings.configure({ auto: false }), got ${configuredAuto}`);

// Verify built CLI writes/reads/clears $DSH_HOME/.credentials.yaml format.
const temp = await mkdtemp(join(tmpdir(), "kolmopdf-cli-mix-"));
try {
  const credFile = join(temp, ".credentials.yaml");
  const cliPath = new URL("../lib/cli.js", import.meta.url);
  await execFileAsync(process.execPath, [cliPath.pathname.replace(/^\/([A-Za-z]:)/, "$1"), "config", "set-key", "sk-cli-test-123456", "--file", credFile]);
  const saved = yaml.parse(await readFile(credFile, "utf8"));
  if (saved?.version !== 1 || saved?.refs?.KOLMOPDF_API_KEY !== "sk-cli-test-123456") {
    throw new Error(`Unexpected .credentials.yaml content: ${JSON.stringify(saved)}`);
  }
  const statusOut = await execFileAsync(process.execPath, [cliPath.pathname.replace(/^\/([A-Za-z]:)/, "$1"), "config", "status", "--file", credFile]);
  if (!statusOut.stdout.includes("API key: configured")) throw new Error(`Unexpected CLI status: ${statusOut.stdout}`);
  await execFileAsync(process.execPath, [cliPath.pathname.replace(/^\/([A-Za-z]:)/, "$1"), "config", "clear-key", "--file", credFile]);
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, tools: names, resolvedFromCredentials, configuredAuto, cliVerified: true }));
for (const fiber of fibers.reverse()) await fiber.dispose();
