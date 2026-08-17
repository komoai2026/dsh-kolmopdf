// Reproduce the real profile composition WITHOUT touching the live profile:
// host dsh dependencies (nvm install) + the workspace plugin (separate copies
// of cordis / schemastery / dsh-tools / dsh-settings, exactly like the
// profiles\web\node_modules\kolmopdf symlink resolves).
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const dshRoot = "C:/Users/dacon/AppData/Local/nvm/v25.2.1/node_modules/@deepseek-ai/dsh";
const hostRequire = createRequire(join(dshRoot, "package.json"));
const hostImport = (id) => import(pathToFileURL(hostRequire.resolve(id)).href);

const [cordis, SystemPrompt, ToolRuntime, SettingsFile] = await Promise.all([
  hostImport("@deepseek-ai/cordis"),
  hostImport("@deepseek-ai/dsh-system-prompt"),
  hostImport("@deepseek-ai/dsh-tools"),
  hostImport("@deepseek-ai/dsh-settings-file"),
]);
const { Context } = cordis;

const temp = await mkdtemp(join(tmpdir(), "komolpdf-host-mix-"));
const settingsPath = join(temp, "settings.yaml");
try {
  const plugin = await import("file:///D:/code/dsh-zhiyipdf/lib/index.js");
  const ctx = new Context();
  // Credential seam: GUI settings page writes through this reference. Verify
  // tools resolve the key from it (instead of failing with the missing-key
  // prompt). Real network fails afterwards, which still proves resolution.
  ctx.provide("credentials", {
    resolve: async () => ({ value: "sk-mock-credential" }),
  });
  const fibers = [
    await ctx.plugin(SystemPrompt.default, {}),
    await ctx.plugin(ToolRuntime.default, {}),
    await ctx.plugin(SettingsFile.default, { path: settingsPath, watch: false }),
    await ctx.plugin(plugin, {}),
  ];
  const names = ctx.tools.schemas().map((t) => t.name);
  const balance = await ctx.tools.execute({
    callId: "mix-test-1",
    name: "kolmopdf_check_balance",
    arguments: {},
    signal: new AbortController().signal,
  });
  const resolvedFromCredentials = balance.isError && !String(balance.error.message).includes("not configured");
  console.log(JSON.stringify({ ok: true, tools: names, resolvedFromCredentials }));
  for (const fiber of fibers.reverse()) await fiber.dispose();
} finally {
  await rm(temp, { recursive: true, force: true });
}
