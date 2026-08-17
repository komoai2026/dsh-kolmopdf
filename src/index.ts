import type { Context } from "@deepseek-ai/cordis";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { Config, SETTINGS_NAMESPACE, type Config as PluginConfig } from "./config.js";
import { registerKolmoPdfTools } from "./tools.js";

export const name = "kolmopdf";
export const inject = ["tools", "systemPrompt"];

export function apply(ctx: Context, config: PluginConfig): void {
  let current = () => config;
  installSettingsSection(ctx, settingsNamespace(SETTINGS_NAMESPACE), Config, config, {
    setSource(source) {
      current = source;
    },
    onChange() {},
  });

  ctx.systemPrompt.section({
    name: "tool:kolmopdf",
    order: 115,
    text: "Use the KolmoPDF tools for high-fidelity PDF parsing, layout-preserving PDF translation, Markdown document conversion, cost estimates, and balance checks. When a tool says the API key is missing, tell the user to open Settings → KolmoPDF or run `dsh plugin --profile web exec kolmopdf -- config set-key`; never ask them to paste a secret into chat unless they explicitly choose to.",
  });

  registerKolmoPdfTools(ctx, () => current());
}

export { Config, SETTINGS_NAMESPACE } from "./config.js";
export type { Config as PluginConfig, ResolvedConfig } from "./config.js";
export { KolmoPdfClient } from "./api-client.js";
export { KolmoPdfError } from "./errors.js";
