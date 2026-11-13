import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-settings";
import { Config, type Config as PluginConfig } from "./config.js";
import { registerKolmoPdfHostApi } from "./host-api.js";
import { registerKolmoPdfTools } from "./tools.js";

export const name = "kolmopdf";
export const inject = ["tools", "systemPrompt"];

export function apply(ctx: Context, config: PluginConfig): void {
  // Suppress auto-generated config forms when DSH Settings is mounted;
  // KolmoPDF ships its own custom Web settings section (client.tsx).
  ctx.inject(["settings"], (settingsCtx) => {
    const settings = settingsCtx.settings as { configure?: (presentation: { auto?: boolean }, owner?: unknown) => () => void } | undefined;
    if (typeof settings?.configure === "function") {
      settingsCtx.effect(() => settings.configure!({ auto: false }, ctx.fiber));
    }
  });

  ctx.systemPrompt.section({
    name: "tool:kolmopdf",
    order: 115,
    text: "Use the KolmoPDF tools for high-fidelity PDF parsing, layout-preserving PDF translation, Markdown document conversion, cost estimates, and balance checks. When a tool says the API key is missing, tell the user to open Settings → KolmoPDF or run `dsh plugin --profile web exec kolmopdf -- config set-key`; never ask them to paste a secret into chat unless they explicitly choose to.",
  });

  registerKolmoPdfTools(ctx, () => config);
  registerKolmoPdfHostApi(ctx, () => config);
}

export { Config, SETTINGS_NAMESPACE } from "./config.js";
export type { Config as PluginConfig, ResolvedConfig } from "./config.js";
export { KolmoPdfClient } from "./api-client.js";
export { KolmoPdfError } from "./errors.js";
