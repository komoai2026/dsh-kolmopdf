#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { stdin, stdout } from "node:process";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { Document, parseDocument } from "yaml";
import { SETTINGS_NAMESPACE } from "./constants.js";
import { validateApiKey } from "./config.js";

const VERSION = "0.1.0";

function settingsPath(args: string[]): string {
  const index = args.indexOf("--file");
  if (index >= 0) {
    const value = args[index + 1];
    if (value === undefined || value.startsWith("-")) throw new Error("--file requires a YAML settings path");
    args.splice(index, 2);
    return resolve(value);
  }
  return resolve(resolveDshHome(), "settings.yaml");
}

async function loadDocument(path: string): Promise<Document.Parsed> {
  let text = "";
  try { text = await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const document = parseDocument(text, { prettyErrors: true });
  if (document.errors.length > 0) throw new Error(`Cannot update ${path}: ${document.errors.map((error) => error.message).join("; ")}`);
  const root = document.toJS();
  if (root !== null && (typeof root !== "object" || Array.isArray(root))) throw new Error(`Cannot update ${path}: the settings document root must be a map`);
  if (document.contents === null) document.contents = document.createNode({}) as Document.Parsed["contents"];
  return document;
}

async function saveDocument(path: string, document: Document.Parsed): Promise<void> {
  await writeFileAtomic(path, document.toString(), { mode: 0o600, dirMode: 0o700 });
}

/** Serialize one read-modify-write cycle with DSH's own settings writer lock. */
async function updateDocument(path: string, mutate: (document: Document.Parsed) => void): Promise<void> {
  await withFileLock(path, async () => {
    const document = await loadDocument(path);
    mutate(document);
    await saveDocument(path, document);
  });
}

async function readSecret(prompt: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8").trim();
  }
  return new Promise<string>((accept, reject) => {
    let value = "";
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (chunk: Buffer | string) => {
      const text = chunk.toString();
      for (const character of text) {
        if (character === "\u0003") {
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
        if (character === "\u007f" || character === "\b") {
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

function help(): string {
  return `kolmopdf ${VERSION}\n\nUsage (via DeepSeek Harness):\n  dsh plugin --profile web exec kolmopdf -- config set-key [key] [--file <settings.yaml>]\n  dsh plugin --profile web exec kolmopdf -- config clear-key [--file <settings.yaml>]\n  dsh plugin --profile web exec kolmopdf -- config status [--file <settings.yaml>]\n  dsh plugin --profile web exec kolmopdf -- config path [--file <settings.yaml>]\n\nIf this binary is already on PATH, the same subcommands work as \`kolmopdf config …\`.\nOmit [key] to enter it in a masked prompt. For scripts, pipe the key on stdin.\n`;
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) { stdout.write(help()); return; }
  if (argv.includes("--version") || argv.includes("-v")) { stdout.write(`${VERSION}\n`); return; }
  const args = [...argv];
  const path = settingsPath(args);
  if (args[0] !== "config") throw new Error(`Unknown command: ${args.join(" ")}\n\n${help()}`);
  const command = args[1];
  if (command === "path") { stdout.write(`${path}\n`); return; }
  if (command === "status") {
    const document = await loadDocument(path);
    const value = document.getIn([SETTINGS_NAMESPACE, "apiKey"]);
    stdout.write(value === undefined || String(value).trim().length === 0 ? `API key: not configured\nSettings: ${path}\n` : `API key: configured\nSettings: ${path}\n`);
    return;
  }
  if (command === "set-key") {
    const key = (args[2] ?? await readSecret("KolmoPDF API key: ")).trim();
    const invalid = validateApiKey(key);
    if (invalid !== undefined) throw new Error(invalid);
    await updateDocument(path, (document) => {
      document.setIn([SETTINGS_NAMESPACE, "apiKey"], key);
    });
    stdout.write(`KolmoPDF API key saved to ${path}\n`);
    return;
  }
  if (command === "clear-key") {
    await updateDocument(path, (document) => {
      document.deleteIn([SETTINGS_NAMESPACE, "apiKey"]);
    });
    stdout.write(`KolmoPDF API key removed from ${path}\n`);
    return;
  }
  throw new Error(`Unknown config command: ${command ?? "(missing)"}\n\n${help()}`);
}

main().catch((error) => {
  process.stderr.write(`kolmopdf: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
