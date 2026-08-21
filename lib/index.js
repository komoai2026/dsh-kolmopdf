import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
import { readFile, mkdir, realpath, open, rename, stat } from 'fs/promises';
import { basename, resolve, extname, isAbsolute, relative, sep, dirname, join } from 'path';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createWriteStream } from 'fs';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { PDFDocument } from 'pdf-lib';
import { open as open$1 } from 'yauzl';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { setTimeout } from 'timers/promises';

// src/index.ts

// src/constants.ts
var SETTINGS_NAMESPACE = "kolmopdf";
var DEFAULT_API_KEY_ENV = "KOLMOPDF_API_KEY";

// src/config.ts
var DEFAULTS = Object.freeze({
  apiKeyEnv: DEFAULT_API_KEY_ENV,
  baseUrl: "https://www.kolmopdf.com",
  outputDir: "./kolmopdf-output",
  pollIntervalMs: 2e3,
  maxPollMinutes: 30,
  httpTimeoutMs: 6e4,
  uploadTimeoutMs: 6e5
});
var Config = z.object({
  apiKey: z.string().role("secret"),
  apiKeyEnv: z.string().role("credential-ref").default(DEFAULTS.apiKeyEnv),
  baseUrl: z.string().default(DEFAULTS.baseUrl),
  outputDir: z.string().default(DEFAULTS.outputDir),
  pollIntervalMs: z.number().step(1).min(100).default(DEFAULTS.pollIntervalMs),
  maxPollMinutes: z.number().min(1).default(DEFAULTS.maxPollMinutes),
  httpTimeoutMs: z.number().step(1).min(1e3).default(DEFAULTS.httpTimeoutMs),
  uploadTimeoutMs: z.number().step(1).min(1e3).default(DEFAULTS.uploadTimeoutMs)
});
function trimTrailingSlash(value) {
  return value.replace(/\/+$/u, "");
}
function resolveConfig(config, env = process.env) {
  const literalKey = config.apiKey?.trim();
  const apiKeyEnv = config.apiKeyEnv?.trim() || DEFAULTS.apiKeyEnv;
  const environmentKey = env[apiKeyEnv]?.trim();
  const apiKey = literalKey || environmentKey || void 0;
  return {
    ...apiKey === void 0 ? {} : { apiKey },
    apiKeyEnv,
    baseUrl: trimTrailingSlash(config.baseUrl?.trim() || DEFAULTS.baseUrl),
    outputDir: config.outputDir?.trim() || DEFAULTS.outputDir,
    pollIntervalMs: config.pollIntervalMs ?? DEFAULTS.pollIntervalMs,
    maxPollMinutes: config.maxPollMinutes ?? DEFAULTS.maxPollMinutes,
    httpTimeoutMs: config.httpTimeoutMs ?? DEFAULTS.httpTimeoutMs,
    uploadTimeoutMs: config.uploadTimeoutMs ?? DEFAULTS.uploadTimeoutMs
  };
}
function maskApiKey(apiKey) {
  if (apiKey.length <= 10) return "***";
  return `${apiKey.slice(0, 6)}***${apiKey.slice(-4)}`;
}
function missingApiKeyMessage(apiKeyEnv = DEFAULT_API_KEY_ENV) {
  return [
    "KolmoPDF API key is not configured.",
    "Open DeepSeek Harness Settings \u2192 KolmoPDF and enter the key,",
    "or run `dsh plugin --profile web exec kolmopdf -- config set-key` in a terminal.",
    `You can also set the ${apiKeyEnv} environment variable.`,
    "Create a key at https://www.kolmopdf.com/api-keys (Plus/Pro account required)."
  ].join(" ");
}

// src/errors.ts
var SPECS = {
  invalid_api_key: {
    message: "API key is missing or invalid.",
    remediation: "Configure it in Settings \u2192 KolmoPDF or run `dsh plugin --profile web exec kolmopdf -- config set-key`.",
    httpStatus: 401
  },
  insufficient_points: {
    message: "Not enough KolmoPDF credits.",
    remediation: "Top up at https://www.kolmopdf.com/subscription.",
    httpStatus: 402
  },
  parse_file_too_large: { message: "PDF exceeds 300 MB.", remediation: "Split the PDF locally.", httpStatus: 400 },
  parse_page_limit_exceeded: { message: "PDF exceeds 800 pages.", remediation: "Split the PDF locally.", httpStatus: 400 },
  translate_pdf_file_too_large: { message: "PDF exceeds 300 MB.", remediation: "Split the PDF locally.", httpStatus: 400 },
  translate_pdf_page_limit_exceeded: { message: "PDF exceeds 800 pages.", remediation: "Split the PDF locally.", httpStatus: 400 },
  convert_file_too_large: { message: "File exceeds 300 MB.", remediation: "Reduce the file size.", httpStatus: 400 },
  convert_file_type_unsupported: { message: "File must be .md, .markdown, or .zip.", remediation: "Convert the source to Markdown first.", httpStatus: 400 },
  client_polling_timeout: { message: "KolmoPDF polling timed out locally.", remediation: "The task may still be running; inspect it with kolmopdf_get_task_status.", httpStatus: null },
  client_download_too_large: { message: "KolmoPDF result download exceeds the plugin size limit.", remediation: "Choose a smaller document or download the result manually.", httpStatus: null },
  client_extract_failed: { message: "The downloaded ZIP could not be extracted.", remediation: "Check the output directory and available disk space.", httpStatus: null },
  client_aborted: { message: "KolmoPDF operation was cancelled.", remediation: "Run the operation again if needed.", httpStatus: null },
  api_task_error: { message: "KolmoPDF task failed.", remediation: "Retry; if it persists, contact KolmoPDF support.", httpStatus: 500 }
};
var FALLBACK = { message: "KolmoPDF request failed.", remediation: "Retry; if it persists, contact KolmoPDF support.", httpStatus: null };
var KolmoPdfError = class extends Error {
  code;
  httpStatus;
  remediation;
  pointsRequired;
  currentPoints;
  constructor(code, options = {}) {
    const spec = SPECS[code] ?? FALLBACK;
    const message = options.message ?? spec.message;
    const remediation = options.remediation ?? spec.remediation;
    super(remediation.length === 0 ? message : `${message} ${remediation}`, options.cause === void 0 ? void 0 : { cause: options.cause });
    this.name = "KolmoPdfError";
    this.code = code;
    this.httpStatus = options.httpStatus === void 0 ? spec.httpStatus : options.httpStatus;
    this.remediation = remediation;
    this.pointsRequired = options.pointsRequired;
    this.currentPoints = options.currentPoints;
  }
};
function apiError(body, status) {
  const nested = typeof body.error === "object" && body.error !== null ? body.error : void 0;
  const code = String(body.error_code ?? nested?.code ?? (status === 401 ? "invalid_api_key" : "api_task_error"));
  const message = typeof body.message === "string" ? body.message : typeof nested?.message === "string" ? nested.message : void 0;
  return new KolmoPdfError(code, {
    ...message === void 0 ? {} : { message },
    httpStatus: status,
    ...typeof body.points_required === "number" ? { pointsRequired: body.points_required } : {},
    ...typeof body.current_points === "number" ? { currentPoints: body.current_points } : {}
  });
}

// src/api-client.ts
var MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;
function timeoutSignal(parent, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent === void 0 ? timeout : AbortSignal.any([parent, timeout]);
}
function normalizeStatus(value) {
  const status = typeof value === "string" && value.length > 0 ? value : "processing";
  if (status === "completed") return "succeeded";
  if (status === "pending" || status === "waiting") return "queued";
  return status;
}
var KolmoPdfClient = class {
  constructor(options) {
    this.options = options;
  }
  options;
  headers() {
    return { "X-API-Key": this.options.apiKey, Authorization: `Bearer ${this.options.apiKey}` };
  }
  async json(url, init) {
    let response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      if (init.signal?.aborted === true) throw new KolmoPdfError("client_aborted", { cause: error });
      throw new KolmoPdfError("api_task_error", { message: error instanceof Error ? error.message : String(error), cause: error });
    }
    const text = await response.text();
    let body = {};
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        if (!response.ok) throw new KolmoPdfError("api_task_error", { message: `HTTP ${response.status}: non-JSON response`, httpStatus: response.status });
      }
    }
    if (!response.ok || body.success === false) throw apiError(body, response.status);
    return body;
  }
  async uploadForm(filePath) {
    const bytes = await readFile(filePath);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)]), basename(filePath));
    return form;
  }
  submit(body) {
    const id = String(body.id ?? body.task_id ?? body.legacy_task_id ?? "");
    if (id.length === 0) throw new KolmoPdfError("api_task_error", { message: "KolmoPDF response did not include a task id." });
    const queue = typeof body.queue === "object" && body.queue !== null ? body.queue : void 0;
    return {
      task_id: id,
      status: normalizeStatus(body.status),
      points_deducted: Number(body.points_deducted ?? 0),
      remaining_points: Number(body.remaining_points ?? 0),
      ...typeof queue?.ahead === "number" ? { queue_info: { position: Number(queue.position ?? 0), ahead_tasks: queue.ahead } } : {}
    };
  }
  async parse(filePath, options, signal) {
    const form = await this.uploadForm(filePath);
    const names = {
      table_mode: "table_mode",
      formula_format: "formula_format",
      enable_translation: "enable_translation",
      target_language: "target_language",
      output_options: "output_options",
      images_as_url: "images_as_url",
      skip_rotation_detection: "skip_rotation_detection",
      enable_cross_page_merge: "enable_cross_page_merge",
      enrichment: "enrichment"
    };
    for (const [source, destination] of Object.entries(names)) {
      const value = options[source];
      if (value !== void 0) form.append(destination, Array.isArray(value) ? value.join(",") : String(value));
    }
    return this.submit(await this.json(`${this.options.baseUrl}/api/v1/jobs/parse`, {
      method: "POST",
      headers: { ...this.headers(), "Idempotency-Key": randomUUID() },
      body: form,
      signal: timeoutSignal(signal, this.options.uploadTimeoutMs)
    }));
  }
  async translate(filePath, options, signal) {
    const form = await this.uploadForm(filePath);
    const names = {
      source_language: "sourceLanguage",
      target_language: "targetLanguage",
      layout_modes: "layoutModes",
      enable_image_translation: "enableImageTranslation",
      enable_table_translation: "enableTableTranslation"
    };
    for (const [source, destination] of Object.entries(names)) {
      const value = options[source];
      if (value !== void 0) form.append(destination, Array.isArray(value) ? value.join(",") : String(value));
    }
    return this.submit(await this.json(`${this.options.baseUrl}/api/v1/jobs/translate-pdf`, {
      method: "POST",
      headers: { ...this.headers(), "Idempotency-Key": randomUUID() },
      body: form,
      signal: timeoutSignal(signal, this.options.uploadTimeoutMs)
    }));
  }
  async convert(filePath, targetFormat, signal) {
    const form = await this.uploadForm(filePath);
    form.append("targetFormat", targetFormat);
    return this.submit(await this.json(`${this.options.baseUrl}/api/v1/jobs/convert`, {
      method: "POST",
      headers: { ...this.headers(), "Idempotency-Key": randomUUID() },
      body: form,
      signal: timeoutSignal(signal, this.options.uploadTimeoutMs)
    }));
  }
  async getStatus(taskId, signal) {
    const body = await this.json(`${this.options.baseUrl}/api/v1/jobs/${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: this.headers(),
      signal: timeoutSignal(signal, this.options.httpTimeoutMs)
    });
    const status = normalizeStatus(body.status);
    const error = typeof body.error === "object" && body.error !== null ? body.error : void 0;
    const queue = typeof body.queue === "object" && body.queue !== null ? body.queue : void 0;
    const result = typeof body.result === "object" && body.result !== null ? body.result : void 0;
    return {
      success: status === "succeeded",
      status,
      ...typeof body.message === "string" ? { message: body.message } : typeof error?.message === "string" ? { message: error.message } : {},
      ...typeof error?.code === "string" ? { error_code: error.code } : {},
      ...typeof queue?.ahead === "number" ? { queue_info: { position: Number(queue.position ?? 0), ahead_tasks: queue.ahead } } : {},
      ...typeof result?.download_url === "string" ? { result: { task_id: taskId, download_url: result.download_url } } : {}
    };
  }
  async download(taskId, destination, signal) {
    const response = await fetch(`${this.options.baseUrl}/api/v1/jobs/${encodeURIComponent(taskId)}/download`, {
      method: "GET",
      headers: this.headers(),
      signal: timeoutSignal(signal, this.options.uploadTimeoutMs)
    });
    if (!response.ok) throw new KolmoPdfError("api_task_error", { message: `Download failed with HTTP ${response.status}.`, httpStatus: response.status });
    if (response.body === null) throw new KolmoPdfError("api_task_error", { message: "Download response was empty." });
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
      throw new KolmoPdfError("client_download_too_large", { message: `Download is ${declaredLength} bytes; the plugin limit is ${MAX_DOWNLOAD_BYTES}.` });
    }
    let written = 0;
    const reader = response.body.getReader();
    const output = createWriteStream(destination);
    while (true) {
      if (signal?.aborted === true) {
        await new Promise((accept) => output.end(() => accept()));
        throw new KolmoPdfError("client_aborted");
      }
      const { done, value } = await reader.read();
      if (done) break;
      written += value.byteLength;
      if (written > MAX_DOWNLOAD_BYTES) {
        await new Promise((accept) => output.end(() => accept()));
        throw new KolmoPdfError("client_download_too_large");
      }
      const ok = output.write(Buffer.from(value));
      if (!ok) await new Promise((accept) => output.once("drain", () => accept()));
    }
    await new Promise((accept, reject) => output.end((error) => error === void 0 || error === null ? accept() : reject(error)));
    return { contentType: response.headers.get("content-type"), bytesWritten: written };
  }
  async getBalance(signal) {
    const body = await this.json(`${this.options.baseUrl}/api/v1/balance`, {
      method: "GET",
      headers: this.headers(),
      signal: timeoutSignal(signal, this.options.httpTimeoutMs)
    });
    return { success: body.success !== false, points: Number(body.points ?? 0), api_key: String(body.api_key ?? "") };
  }
};
var MAX_FILE_BYTES = 300 * 1024 * 1024;
var MAX_PAGES = 800;
var MAX_ZIP_ENTRIES = 1e4;
var MAX_ZIP_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;
async function readFileSize(filePath) {
  return (await stat(filePath)).size;
}
async function readPageCount(data) {
  let document;
  try {
    document = await PDFDocument.load(data, { ignoreEncryption: true });
  } catch (error) {
    throw new KolmoPdfError("parse_file_not_pdf", { message: error instanceof Error ? error.message : String(error) });
  }
  return document.getPageCount();
}
async function isZipFile(filePath) {
  const handle = await open(filePath, "r");
  try {
    const bytes = Buffer.alloc(4);
    const { bytesRead } = await handle.read(bytes, 0, 4, 0);
    return bytesRead >= 4 && bytes[0] === 80 && bytes[1] === 75 && [3, 5, 7].includes(bytes[2] ?? -1);
  } finally {
    await handle.close();
  }
}
function openArchive(path) {
  return new Promise((accept, reject) => {
    open$1(path, { lazyEntries: true }, (error, archive) => {
      if (error !== null || archive === void 0) reject(error ?? new Error("Failed to open ZIP"));
      else accept(archive);
    });
  });
}
function openEntry(archive, entry) {
  return new Promise((accept, reject) => {
    archive.openReadStream(entry, (error, stream) => {
      if (error !== null || stream === void 0) reject(error ?? new Error("Failed to open ZIP entry"));
      else accept(stream);
    });
  });
}
async function* entries(archive) {
  const queue = [];
  let wake;
  const push = (value) => {
    queue.push(value);
    wake?.();
    wake = void 0;
  };
  archive.on("entry", (entry) => push(entry));
  archive.on("end", () => push(null));
  archive.on("error", (error) => push(error));
  archive.readEntry();
  while (true) {
    if (queue.length === 0) await new Promise((accept) => {
      wake = accept;
    });
    const value = queue.shift();
    if (value === null) return;
    if (value instanceof Error) throw value;
    if (value === void 0) continue;
    yield value;
    archive.readEntry();
  }
}
function safeEntryPath(root, name2) {
  const normalized = name2.replace(/\\/gu, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) throw new Error(`Unsafe absolute ZIP entry: ${name2}`);
  const target = resolve(root, normalized);
  const rel = relative(resolve(root), target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || resolve(rel) === resolve("..")) throw new Error(`Unsafe parent ZIP entry: ${name2}`);
  return target;
}
async function extractZip(zipPath, outputRoot2, signal) {
  await mkdir(outputRoot2, { recursive: true });
  const archive = await openArchive(zipPath);
  const files = [];
  const markdown = [];
  let imagesDir = null;
  let totalUncompressed = 0;
  let entryCount = 0;
  try {
    for await (const entry of entries(archive)) {
      if (signal?.aborted === true) throw new KolmoPdfError("client_aborted");
      entryCount += 1;
      if (entryCount > MAX_ZIP_ENTRIES) throw new KolmoPdfError("client_extract_failed", { message: `ZIP contains more than ${MAX_ZIP_ENTRIES} entries.` });
      if (!entry.fileName.endsWith("/")) {
        totalUncompressed += entry.uncompressedSize;
        if (totalUncompressed > MAX_ZIP_TOTAL_BYTES) throw new KolmoPdfError("client_extract_failed", { message: "ZIP total uncompressed size exceeds the plugin limit." });
      }
      const target = safeEntryPath(outputRoot2, entry.fileName);
      if (entry.fileName.endsWith("/")) {
        await mkdir(target, { recursive: true });
        if (/(^|\/)images\/$/iu.test(entry.fileName)) imagesDir = target;
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      await pipeline(await openEntry(archive, entry), createWriteStream(target));
      files.push(target);
      if (/\.md$/iu.test(entry.fileName)) markdown.push({ path: target, name: entry.fileName, size: entry.uncompressedSize });
      if (imagesDir === null && /(^|\/)images\//iu.test(entry.fileName)) imagesDir = join(outputRoot2, entry.fileName.slice(0, entry.fileName.toLowerCase().indexOf("images/") + 6));
    }
  } catch (error) {
    archive.close();
    throw new KolmoPdfError("client_extract_failed", { message: error instanceof Error ? error.message : String(error), cause: error });
  }
  const sidecar = /(^|\/)(outline|summary|verification_report|enrichment_meta|tables_changelog|tables_normalized)(\.|$)/iu;
  markdown.sort((a, b) => {
    const score = (item) => item.size - (sidecar.test(item.name) ? 1e12 : 0) - (/readme\.md$/iu.test(item.name) ? 1e9 : 0);
    return score(b) - score(a);
  });
  return { markdownPath: markdown[0]?.path ?? null, imagesDir, files };
}
async function moveFile(from, to) {
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
}
var LEDGER_CAP = 200;
function ledgerPath(home = resolveDshHome()) {
  return join(home, "kolmopdf", "tasks.json");
}
function emptyLedger() {
  return { version: 1, tasks: [] };
}
function normalize(value) {
  if (typeof value !== "object" || value === null) return emptyLedger();
  const ledger = value;
  const tasks = Array.isArray(ledger.tasks) ? ledger.tasks.filter((task) => typeof task === "object" && task !== null && typeof task.task_id === "string" && typeof task.created_at === "number") : [];
  return { version: 1, tasks };
}
async function readLedger(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return emptyLedger();
    throw error;
  }
  try {
    return normalize(JSON.parse(text));
  } catch {
    return emptyLedger();
  }
}
async function writeLedger(path, ledger) {
  await mkdir(dirname(path), { recursive: true });
  await writeFileAtomic(path, JSON.stringify(ledger, null, 2) + "\n", { mode: 384, dirMode: 448 });
}
async function mutateLedger(path, mutate) {
  await mkdir(dirname(path), { recursive: true });
  await withFileLock(path, async () => {
    const ledger = await readLedger(path);
    mutate(ledger);
    await writeLedger(path, ledger);
  });
}
function upsertTask(ledger, record) {
  const index = ledger.tasks.findIndex((task) => task.task_id === record.task_id);
  if (index >= 0) ledger.tasks.splice(index, 1);
  ledger.tasks.unshift(record);
  if (ledger.tasks.length > LEDGER_CAP) ledger.tasks.length = LEDGER_CAP;
}
async function recordTask(path, record) {
  await mutateLedger(path, (ledger) => upsertTask(ledger, record));
}
async function updateTaskStatus(path, taskId, patch) {
  await mutateLedger(path, (ledger) => {
    const task = ledger.tasks.find((entry) => entry.task_id === taskId);
    if (task === void 0) return;
    task.status = patch.status;
    task.updated_at = patch.updated_at;
    if (patch.points !== void 0) task.points = patch.points;
    if (patch.error !== void 0) task.error = patch.error;
    else delete task.error;
  });
}
async function clearLedger(path) {
  await mkdir(dirname(path), { recursive: true });
  await withFileLock(path, async () => {
    await writeLedger(path, emptyLedger());
  });
}
var OK = /* @__PURE__ */ new Set(["succeeded", "completed"]);
var FAILED = /* @__PURE__ */ new Set(["failed", "cancelled"]);
async function pollUntilComplete(client, taskId, options) {
  const deadline = Date.now() + options.maxPollMinutes * 6e4;
  while (true) {
    if (options.signal?.aborted === true) throw new KolmoPdfError("client_aborted");
    if (Date.now() > deadline) throw new KolmoPdfError("client_polling_timeout");
    const result = await client.getStatus(taskId, options.signal);
    if (OK.has(result.status)) return result;
    if (FAILED.has(result.status)) throw new KolmoPdfError(result.error_code ?? "api_task_error", { message: result.message ?? `Task ${taskId} failed.` });
    const ahead = result.queue_info?.ahead_tasks;
    options.onProgress?.(ahead === void 0 ? `Task ${taskId}: ${result.status}` : `Task ${taskId}: ${result.status} (${ahead} ahead)`);
    await setTimeout(options.pollIntervalMs, void 0, { signal: options.signal }).catch((error) => {
      throw new KolmoPdfError("client_aborted", { cause: error });
    });
  }
}

// src/tools.ts
var jsonOutput = {
  schema: { type: "json" },
  render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }]
};
function currentConfig(source) {
  return resolveConfig(source());
}
async function resolveApiKey(ctx, config) {
  if (config.apiKey !== void 0) return config.apiKey;
  const credentials = ctx.get("credentials");
  const resolved = credentials === void 0 ? void 0 : await credentials.resolve(credentialRef(config.apiKeyEnv));
  return resolved?.value ?? "";
}
async function clientFrom(ctx, source) {
  const config = resolveConfig(source());
  const apiKey = await resolveApiKey(ctx, config);
  if (apiKey.length === 0) throw new KolmoPdfError("invalid_api_key", { message: missingApiKeyMessage(config.apiKeyEnv), remediation: "" });
  return new KolmoPdfClient({
    apiKey,
    baseUrl: config.baseUrl,
    httpTimeoutMs: config.httpTimeoutMs,
    uploadTimeoutMs: config.uploadTimeoutMs
  });
}
async function outputRoot(config, taskId, requested, signal) {
  const base = resolve(config.outputDir);
  const subdir = requested?.trim() || taskId;
  if (isAbsolute(subdir)) throw new Error("output_subdir must be relative to the configured KolmoPDF output directory");
  const target = resolve(base, subdir);
  const rel = relative(base, target);
  if (rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("output_subdir must not escape the configured KolmoPDF output directory");
  await mkdir(target, { recursive: true });
  if (signal?.aborted === true) throw new KolmoPdfError("client_aborted");
  const [realBase, realTarget] = await Promise.all([realpath(base), realpath(target)]);
  const realRel = relative(realBase, realTarget);
  if (realRel === ".." || realRel.startsWith(`..${sep}`)) throw new Error("output_subdir must not escape the configured KolmoPDF output directory");
  return target;
}
async function validatePdf(data, filePath, sizeCode, pageCode) {
  if (extname(filePath).toLowerCase() !== ".pdf") throw new Error(`Expected a PDF file: ${filePath}`);
  if (data.byteLength > MAX_FILE_BYTES) throw new KolmoPdfError(sizeCode);
  const pages = await readPageCount(data);
  if (pages > MAX_PAGES) throw new KolmoPdfError(pageCode);
  return pages;
}
async function waitForTask(client, taskId, config, exec) {
  await pollUntilComplete(client, taskId, {
    pollIntervalMs: config.pollIntervalMs,
    maxPollMinutes: config.maxPollMinutes,
    signal: exec.signal
  });
}
async function recordSubmission(operation, filePath, submission) {
  await recordTask(ledgerPath(), {
    task_id: submission.task_id,
    operation,
    file: filePath,
    created_at: Date.now(),
    updated_at: Date.now(),
    status: submission.status,
    ...submission.points_deducted > 0 ? { points: submission.points_deducted } : {}
  });
}
async function bestEffortLedger(work) {
  try {
    await work();
  } catch (error) {
    console.warn(`[kolmopdf] task ledger update failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function trackTask(operation, filePath, submission, wait) {
  await bestEffortLedger(() => recordSubmission(operation, filePath, submission));
  try {
    await wait();
    await bestEffortLedger(() => updateTaskStatus(ledgerPath(), submission.task_id, { status: "succeeded", updated_at: Date.now() }));
  } catch (error) {
    await bestEffortLedger(() => updateTaskStatus(ledgerPath(), submission.task_id, { status: "failed", error: error instanceof Error ? error.message : String(error), updated_at: Date.now() }));
    throw error;
  }
}
function registerKolmoPdfTools(ctx, source) {
  ctx.tools.register(defineTool({
    name: "kolmopdf_parse_pdf",
    description: "Parse a local PDF into Markdown with KolmoPDF, preserving formulas, tables, columns, and images; optionally translate while parsing.",
    parameters: {
      file_path: { type: "string", required: true, description: "Absolute or cwd-relative path to a local PDF." },
      table_mode: { type: "string", enum: ["markdown", "image"] },
      formula_format: { type: "string", enum: ["dollar", "bracket"] },
      enable_translation: { type: "boolean" },
      target_language: { type: "string", enum: ["zh", "en", "ja", "ko", "fr", "de", "es", "ru"] },
      output_options: { type: "array", items: { type: "string", enum: ["original", "translated", "bilingual"] } },
      images_as_url: { type: "boolean" },
      skip_rotation_detection: { type: "boolean" },
      enable_cross_page_merge: { type: "boolean" },
      enrichment: { type: "string", description: "Comma-separated sidecars such as outline,summary; use none to disable." },
      output_subdir: { type: "string", description: "Relative directory under the configured output directory." }
    },
    output: jsonOutput,
    async execute(args, exec) {
      const input = args;
      const config = currentConfig(source);
      const client = await clientFrom(ctx, source);
      const filePath = resolve(String(input.file_path));
      const data = await readFile(filePath);
      const pages = await validatePdf(data, filePath, "parse_file_too_large", "parse_page_limit_exceeded");
      const submission = await client.parse(filePath, input, exec.signal);
      await trackTask("parse", filePath, submission, () => waitForTask(client, submission.task_id, config, exec));
      const root = await outputRoot(config, submission.task_id, input.output_subdir, exec.signal);
      const temporary = resolve(root, "download.bin");
      await client.download(submission.task_id, temporary, exec.signal);
      let markdownPath;
      let imagesDir = null;
      let type;
      if (await isZipFile(temporary)) {
        const archive = resolve(root, "result.zip");
        await moveFile(temporary, archive);
        const extracted = await extractZip(archive, root, exec.signal);
        if (extracted.markdownPath === null) throw new KolmoPdfError("client_extract_failed", { message: "Downloaded ZIP contains no Markdown file." });
        markdownPath = extracted.markdownPath;
        imagesDir = extracted.imagesDir;
        type = "zip_extracted";
      } else {
        markdownPath = resolve(root, "result.md");
        await moveFile(temporary, markdownPath);
        type = "markdown_file";
      }
      const preview = (await readFile(markdownPath, "utf8")).slice(0, 500);
      return {
        task_id: submission.task_id,
        pages_parsed: pages,
        points_deducted: submission.points_deducted,
        remaining_points: submission.remaining_points,
        output: { type, markdown_path: markdownPath, images_dir: imagesDir, output_root: root },
        preview
      };
    },
    presentCall: (args) => ({ card: "generic", title: `Parse ${basename(String(args.file_path ?? "PDF"))}`, kind: "read" })
  }));
  ctx.tools.register(defineTool({
    name: "kolmopdf_translate_pdf",
    description: "Translate a local PDF while preserving its layout. Produces a translated or side-by-side bilingual PDF.",
    parameters: {
      file_path: { type: "string", required: true },
      source_language: { type: "string", description: "Source language; defaults to en." },
      target_language: { type: "string", description: "Target language; defaults to zh." },
      layout_modes: { type: "array", items: { type: "string", enum: ["translated_only", "side_by_side"] } },
      enable_image_translation: { type: "boolean" },
      enable_table_translation: { type: "boolean" },
      output_subdir: { type: "string" }
    },
    output: jsonOutput,
    async execute(args, exec) {
      const input = args;
      const config = currentConfig(source);
      const client = await clientFrom(ctx, source);
      const filePath = resolve(String(input.file_path));
      const data = await readFile(filePath);
      const pages = await validatePdf(data, filePath, "translate_pdf_file_too_large", "translate_pdf_page_limit_exceeded");
      const submission = await client.translate(filePath, {
        source_language: input.source_language ?? "en",
        target_language: input.target_language ?? "zh",
        layout_modes: input.layout_modes ?? ["translated_only"],
        enable_image_translation: input.enable_image_translation ?? false,
        enable_table_translation: input.enable_table_translation ?? false
      }, exec.signal);
      await trackTask("translate", filePath, submission, () => waitForTask(client, submission.task_id, config, exec));
      const root = await outputRoot(config, submission.task_id, input.output_subdir, exec.signal);
      const destination = resolve(root, "translated.pdf");
      await client.download(submission.task_id, destination, exec.signal);
      return {
        task_id: submission.task_id,
        pages_translated: pages,
        points_deducted: submission.points_deducted,
        remaining_points: submission.remaining_points,
        output: { translated_pdf_path: destination }
      };
    },
    presentCall: (args) => ({ card: "generic", title: `Translate ${basename(String(args.file_path ?? "PDF"))}`, kind: "read" })
  }));
  ctx.tools.register(defineTool({
    name: "kolmopdf_convert_markdown",
    description: "Convert a Markdown file, or a ZIP containing Markdown and images, into DOCX, HTML, PDF, or LaTeX with KolmoPDF.",
    parameters: {
      file_path: { type: "string", required: true },
      target_format: { type: "string", enum: ["word", "docx", "html", "pdf", "latex", "tex"] },
      output_subdir: { type: "string" }
    },
    output: jsonOutput,
    async execute(args, exec) {
      const input = args;
      const config = currentConfig(source);
      const client = await clientFrom(ctx, source);
      const filePath = resolve(String(input.file_path));
      if (await readFileSize(filePath) > MAX_FILE_BYTES) throw new KolmoPdfError("convert_file_too_large");
      if (![".md", ".markdown", ".zip"].includes(extname(filePath).toLowerCase())) throw new KolmoPdfError("convert_file_type_unsupported");
      const requested = String(input.target_format ?? "word");
      const apiFormat = requested === "docx" ? "word" : requested === "tex" ? "latex" : requested;
      const outputFormat = apiFormat === "word" ? "docx" : apiFormat === "latex" ? "tex" : apiFormat;
      const submission = await client.convert(filePath, apiFormat, exec.signal);
      await trackTask("convert", filePath, submission, () => waitForTask(client, submission.task_id, config, exec));
      const root = await outputRoot(config, submission.task_id, input.output_subdir, exec.signal);
      const destination = resolve(root, `result.${outputFormat}`);
      await client.download(submission.task_id, destination, exec.signal);
      return {
        task_id: submission.task_id,
        points_deducted: submission.points_deducted,
        remaining_points: submission.remaining_points,
        output: { output_path: destination, target_format: outputFormat }
      };
    },
    presentCall: (args) => ({ card: "generic", title: `Convert ${basename(String(args.file_path ?? "Markdown"))}`, kind: "read" })
  }));
  ctx.tools.register(defineTool({
    name: "kolmopdf_estimate_cost",
    description: "Estimate KolmoPDF credits before an operation and compare them with the current balance. Does not spend credits.",
    parameters: {
      file_path: { type: "string", required: true },
      operation: { type: "string", required: true, enum: ["parse", "parse_translate", "translate", "convert"] }
    },
    output: jsonOutput,
    async execute(args, exec) {
      const input = args;
      const operation = String(input.operation);
      let pages = null;
      if (operation !== "convert") {
        const filePath = resolve(String(input.file_path));
        const data = await readFile(filePath);
        pages = await validatePdf(data, filePath, "parse_file_too_large", "parse_page_limit_exceeded");
      }
      const estimated = operation === "convert" ? 1 : (pages ?? 0) * (operation === "parse_translate" ? 3 : 2);
      currentConfig(source);
      const balance = await (await clientFrom(ctx, source)).getBalance(exec.signal);
      const shortfall = Math.max(0, estimated - balance.points);
      return {
        pages,
        estimated_credits: estimated,
        current_balance: balance.points,
        sufficient: shortfall === 0,
        shortfall,
        recommendation: shortfall === 0 ? "Sufficient" : `Top up at https://www.kolmopdf.com/subscription (short by ${shortfall} credits).`
      };
    },
    isConcurrencySafe: () => true
  }));
  ctx.tools.register(defineTool({
    name: "kolmopdf_check_balance",
    description: "Show the current KolmoPDF credit balance for the configured API key.",
    parameters: {},
    output: jsonOutput,
    async execute(_args, exec) {
      const client = await clientFrom(ctx, source);
      const balance = await client.getBalance(exec.signal);
      return { points: balance.points, api_key_masked: maskApiKey(balance.api_key || "") };
    },
    isConcurrencySafe: () => true
  }));
  ctx.tools.register(defineTool({
    name: "kolmopdf_get_task_status",
    description: "Inspect the status of an existing KolmoPDF task by id. Intended for troubleshooting or a timed-out task.",
    parameters: { task_id: { type: "string", required: true } },
    output: jsonOutput,
    async execute(args, exec) {
      const taskId = String(args.task_id);
      const status = await (await clientFrom(ctx, source)).getStatus(taskId, exec.signal);
      return {
        success: status.success,
        status: status.status,
        ...status.message === void 0 ? {} : { message: status.message },
        ...status.error_code === void 0 ? {} : { error_code: status.error_code },
        ...status.queue_info === void 0 ? {} : { queue_info: { position: status.queue_info.position, ahead_tasks: status.queue_info.ahead_tasks } },
        ...status.result === void 0 ? {} : { result: { task_id: status.result.task_id, download_url: status.result.download_url } }
      };
    },
    isConcurrencySafe: () => true
  }));
}

// src/host-api.ts
var BALANCE_PATH = "/plugins/kolmopdf/balance";
var TASKS_PATH = "/plugins/kolmopdf/tasks";
var REFRESH_CAP = 20;
function json(res, body, status = 200) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
function errorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}
function finiteInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
function taskView(task) {
  return {
    task_id: task.task_id,
    operation: task.operation,
    file: task.file,
    file_name: task.file.split(/[\\/]/u).pop() ?? task.file,
    created_at: task.created_at,
    updated_at: task.updated_at,
    status: task.status,
    ...task.points === void 0 ? {} : { points: task.points },
    ...task.error === void 0 ? {} : { error: task.error }
  };
}
function registerKolmoPdfHostApi(ctx, source) {
  ctx.effect(() => {
    const disposers = [];
    const attached = /* @__PURE__ */ new Set();
    const attachRoutes = (webServer) => {
      if (attached.has(webServer)) return;
      attached.add(webServer);
      const balanceHandler = async (_req, res) => {
        try {
          const balance = await (await clientFrom(ctx, source)).getBalance();
          json(res, {
            ok: true,
            configured: true,
            points: balance.points,
            api_key_masked: maskApiKey(balance.api_key || ""),
            refreshed_at: Date.now()
          });
        } catch (error) {
          if (error instanceof KolmoPdfError && error.code === "invalid_api_key") {
            json(res, { ok: true, configured: false });
            return;
          }
          json(res, {
            ok: false,
            configured: false,
            error: errorMessage(error, "Balance check failed."),
            code: error instanceof KolmoPdfError ? error.code : void 0
          });
        }
      };
      const tasksHandler = async (req, res) => {
        if (req.method === "DELETE") {
          try {
            await clearLedger(ledgerPath());
            json(res, { ok: true, cleared: true });
          } catch (error) {
            json(res, { ok: false, error: errorMessage(error, "Clearing the task log failed.") });
          }
          return;
        }
        if (req.method !== "GET") {
          json(res, { ok: false, error: "Use GET (list) or DELETE (clear)." }, 405);
          return;
        }
        const url = new URL(req.url ?? "/", "http://localhost");
        const limit = finiteInt(url.searchParams.get("limit"), 20, 1, 50);
        const path = ledgerPath();
        let ledger;
        try {
          ledger = await readLedger(path);
        } catch (error) {
          json(res, { ok: false, error: errorMessage(error, "Reading the task log failed.") });
          return;
        }
        const tasks = ledger.tasks.slice(0, limit);
        let configured = true;
        try {
          const client = await clientFrom(ctx, source);
          const refreshed = await Promise.allSettled(tasks.slice(0, REFRESH_CAP).map((task) => client.getStatus(task.task_id)));
          const persists = [];
          refreshed.forEach((settled, index) => {
            const task = tasks[index];
            if (task === void 0 || settled.status !== "fulfilled") return;
            const status = settled.value;
            const nextStatus = status.status;
            const nextError = status.status === "failed" ? status.message : void 0;
            if (task.status !== nextStatus || task.error !== nextError) {
              task.status = nextStatus;
              if (nextError !== void 0) task.error = nextError;
              else delete task.error;
              task.updated_at = Date.now();
              persists.push(updateTaskStatus(path, task.task_id, {
                status: task.status,
                ...task.error === void 0 ? {} : { error: task.error },
                updated_at: task.updated_at
              }));
            }
          });
          await Promise.allSettled(persists);
        } catch (error) {
          if (error instanceof KolmoPdfError && error.code === "invalid_api_key") configured = false;
        }
        json(res, { ok: true, configured, tasks: tasks.map(taskView), refreshed_at: Date.now() });
      };
      disposers.push(webServer.register({ kind: "exact", path: BALANCE_PATH, handler: balanceHandler }));
      disposers.push(webServer.register({ kind: "exact", path: TASKS_PATH, handler: tasksHandler }));
    };
    const existing = ctx.get("webServer");
    if (existing !== void 0) attachRoutes(existing);
    const off = ctx.root.on("internal/service", (name2, value) => {
      if (name2 === "webServer" && value !== void 0) attachRoutes(value);
    });
    disposers.push(off);
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, "kolmopdf: settings overview host API");
}

// src/index.ts
var name = "kolmopdf";
var inject = ["tools", "systemPrompt"];
function apply(ctx, config) {
  let current = () => config;
  installSettingsSection(ctx, settingsNamespace(SETTINGS_NAMESPACE), Config, config, {
    setSource(source) {
      current = source;
    },
    onChange() {
    }
  });
  ctx.systemPrompt.section({
    name: "tool:kolmopdf",
    order: 115,
    text: "Use the KolmoPDF tools for high-fidelity PDF parsing, layout-preserving PDF translation, Markdown document conversion, cost estimates, and balance checks. When a tool says the API key is missing, tell the user to open Settings \u2192 KolmoPDF or run `dsh plugin --profile web exec kolmopdf -- config set-key`; never ask them to paste a secret into chat unless they explicitly choose to."
  });
  registerKolmoPdfTools(ctx, () => current());
  registerKolmoPdfHostApi(ctx, () => current());
}

export { Config, KolmoPdfClient, KolmoPdfError, SETTINGS_NAMESPACE, apply, inject, name };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map