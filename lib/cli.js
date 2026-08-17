#!/usr/bin/env node
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { stdout, stdin } from 'process';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { parseDocument } from 'yaml';
import z from '@deepseek-ai/schemastery';

// src/constants.ts
var SETTINGS_NAMESPACE = "kolmopdf";
var DEFAULT_API_KEY_ENV = "KOLMOPDF_API_KEY";
function validateApiKey(key) {
  const trimmed = key.trim();
  if (trimmed.length === 0) return "API key must not be empty";
  if (/[\u0000-\u0020\u007f]/u.test(trimmed)) return "API key contains whitespace or control characters";
  return void 0;
}
var DEFAULTS = Object.freeze({
  apiKeyEnv: DEFAULT_API_KEY_ENV,
  baseUrl: "https://www.kolmopdf.com",
  outputDir: "./kolmopdf-output",
  pollIntervalMs: 2e3,
  maxPollMinutes: 30,
  httpTimeoutMs: 6e4,
  uploadTimeoutMs: 6e5
});
z.object({
  apiKey: z.string().role("secret"),
  apiKeyEnv: z.string().role("credential-ref").default(DEFAULTS.apiKeyEnv),
  baseUrl: z.string().default(DEFAULTS.baseUrl),
  outputDir: z.string().default(DEFAULTS.outputDir),
  pollIntervalMs: z.number().step(1).min(100).default(DEFAULTS.pollIntervalMs),
  maxPollMinutes: z.number().min(1).default(DEFAULTS.maxPollMinutes),
  httpTimeoutMs: z.number().step(1).min(1e3).default(DEFAULTS.httpTimeoutMs),
  uploadTimeoutMs: z.number().step(1).min(1e3).default(DEFAULTS.uploadTimeoutMs)
});

// src/cli.ts
var VERSION = "0.1.0";
function settingsPath(args) {
  const index = args.indexOf("--file");
  if (index >= 0) {
    const value = args[index + 1];
    if (value === void 0 || value.startsWith("-")) throw new Error("--file requires a YAML settings path");
    args.splice(index, 2);
    return resolve(value);
  }
  return resolve(resolveDshHome(), "settings.yaml");
}
async function loadDocument(path) {
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const document = parseDocument(text, { prettyErrors: true });
  if (document.errors.length > 0) throw new Error(`Cannot update ${path}: ${document.errors.map((error) => error.message).join("; ")}`);
  const root = document.toJS();
  if (root !== null && (typeof root !== "object" || Array.isArray(root))) throw new Error(`Cannot update ${path}: the settings document root must be a map`);
  if (document.contents === null) document.contents = document.createNode({});
  return document;
}
async function saveDocument(path, document) {
  await writeFileAtomic(path, document.toString(), { mode: 384, dirMode: 448 });
}
async function updateDocument(path, mutate) {
  await withFileLock(path, async () => {
    const document = await loadDocument(path);
    mutate(document);
    await saveDocument(path, document);
  });
}
async function readSecret(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    const chunks = [];
    for await (const chunk of stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8").trim();
  }
  return new Promise((accept, reject) => {
    let value = "";
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (chunk) => {
      const text = chunk.toString();
      for (const character of text) {
        if (character === "") {
          cleanup();
          stdout.write("\n");
          reject(new Error("Cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          stdout.write("\n");
          accept(value.trim());
          return;
        }
        if (character === "\x7F" || character === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (character >= " ") {
          value += character;
          stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}
function help() {
  return `kolmopdf ${VERSION}

Usage (via DeepSeek Harness):
  dsh plugin --profile web exec kolmopdf -- config set-key [key] [--file <settings.yaml>]
  dsh plugin --profile web exec kolmopdf -- config clear-key [--file <settings.yaml>]
  dsh plugin --profile web exec kolmopdf -- config status [--file <settings.yaml>]
  dsh plugin --profile web exec kolmopdf -- config path [--file <settings.yaml>]

If this binary is already on PATH, the same subcommands work as \`kolmopdf config \u2026\`.
Omit [key] to enter it in a masked prompt. For scripts, pipe the key on stdin.
`;
}
async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    stdout.write(help());
    return;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    stdout.write(`${VERSION}
`);
    return;
  }
  const args = [...argv];
  const path = settingsPath(args);
  if (args[0] !== "config") throw new Error(`Unknown command: ${args.join(" ")}

${help()}`);
  const command = args[1];
  if (command === "path") {
    stdout.write(`${path}
`);
    return;
  }
  if (command === "status") {
    const document = await loadDocument(path);
    const value = document.getIn([SETTINGS_NAMESPACE, "apiKey"]);
    stdout.write(value === void 0 || String(value).trim().length === 0 ? `API key: not configured
Settings: ${path}
` : `API key: configured
Settings: ${path}
`);
    return;
  }
  if (command === "set-key") {
    const key = (args[2] ?? await readSecret("KolmoPDF API key: ")).trim();
    const invalid = validateApiKey(key);
    if (invalid !== void 0) throw new Error(invalid);
    await updateDocument(path, (document) => {
      document.setIn([SETTINGS_NAMESPACE, "apiKey"], key);
    });
    stdout.write(`KolmoPDF API key saved to ${path}
`);
    return;
  }
  if (command === "clear-key") {
    await updateDocument(path, (document) => {
      document.deleteIn([SETTINGS_NAMESPACE, "apiKey"]);
    });
    stdout.write(`KolmoPDF API key removed from ${path}
`);
    return;
  }
  throw new Error(`Unknown config command: ${command ?? "(missing)"}

${help()}`);
}
main().catch((error) => {
  process.stderr.write(`kolmopdf: ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map
//# sourceMappingURL=cli.js.map