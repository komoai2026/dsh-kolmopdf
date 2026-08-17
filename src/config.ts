import z from "@deepseek-ai/schemastery";
import { DEFAULT_API_KEY_ENV, validateApiKey } from "./constants.js";

export { DEFAULT_API_KEY_ENV, SETTINGS_NAMESPACE, validateApiKey } from "./constants.js";

export interface Config {
  apiKey?: string;
  apiKeyEnv?: string;
  baseUrl?: string;
  outputDir?: string;
  pollIntervalMs?: number;
  maxPollMinutes?: number;
  httpTimeoutMs?: number;
  uploadTimeoutMs?: number;
}

export interface ResolvedConfig {
  apiKey?: string;
  apiKeyEnv: string;
  baseUrl: string;
  outputDir: string;
  pollIntervalMs: number;
  maxPollMinutes: number;
  httpTimeoutMs: number;
  uploadTimeoutMs: number;
}

export const DEFAULTS = Object.freeze({
  apiKeyEnv: DEFAULT_API_KEY_ENV,
  baseUrl: "https://www.kolmopdf.com",
  outputDir: "./kolmopdf-output",
  pollIntervalMs: 2_000,
  maxPollMinutes: 30,
  httpTimeoutMs: 60_000,
  uploadTimeoutMs: 600_000,
});

export const Config: z<Config> = z.object({
  apiKey: z.string().role("secret"),
  apiKeyEnv: z.string().role("credential-ref").default(DEFAULTS.apiKeyEnv),
  baseUrl: z.string().default(DEFAULTS.baseUrl),
  outputDir: z.string().default(DEFAULTS.outputDir),
  pollIntervalMs: z.number().step(1).min(100).default(DEFAULTS.pollIntervalMs),
  maxPollMinutes: z.number().min(1).default(DEFAULTS.maxPollMinutes),
  httpTimeoutMs: z.number().step(1).min(1_000).default(DEFAULTS.httpTimeoutMs),
  uploadTimeoutMs: z.number().step(1).min(1_000).default(DEFAULTS.uploadTimeoutMs),
});

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

export function resolveConfig(config: Config, env: NodeJS.ProcessEnv = process.env): ResolvedConfig {
  const literalKey = config.apiKey?.trim();
  const apiKeyEnv = config.apiKeyEnv?.trim() || DEFAULTS.apiKeyEnv;
  const environmentKey = env[apiKeyEnv]?.trim();
  const apiKey = literalKey || environmentKey || undefined;
  return {
    ...(apiKey === undefined ? {} : { apiKey }),
    apiKeyEnv,
    baseUrl: trimTrailingSlash(config.baseUrl?.trim() || DEFAULTS.baseUrl),
    outputDir: config.outputDir?.trim() || DEFAULTS.outputDir,
    pollIntervalMs: config.pollIntervalMs ?? DEFAULTS.pollIntervalMs,
    maxPollMinutes: config.maxPollMinutes ?? DEFAULTS.maxPollMinutes,
    httpTimeoutMs: config.httpTimeoutMs ?? DEFAULTS.httpTimeoutMs,
    uploadTimeoutMs: config.uploadTimeoutMs ?? DEFAULTS.uploadTimeoutMs,
  };
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 10) return "***";
  return `${apiKey.slice(0, 6)}***${apiKey.slice(-4)}`;
}

export function missingApiKeyMessage(apiKeyEnv = DEFAULT_API_KEY_ENV): string {
  return [
    "KolmoPDF API key is not configured.",
    "Open DeepSeek Harness Settings → KolmoPDF and enter the key,",
    "or run `kolmopdf config set-key` in a terminal.",
    `You can also set the ${apiKeyEnv} environment variable.`,
    "Create a key at https://www.kolmopdf.com/api-keys (Plus/Pro account required).",
  ].join(" ");
}
