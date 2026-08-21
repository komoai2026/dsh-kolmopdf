import { mkdir, readFile, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { defineTool, type ToolRunContext } from "@deepseek-ai/dsh-tools";
import { KolmoPdfClient, type SubmitResult } from "./api-client.js";
import type { Config, ResolvedConfig } from "./config.js";
import { maskApiKey, missingApiKeyMessage, resolveConfig } from "./config.js";
import { KolmoPdfError } from "./errors.js";
import { ledgerPath, recordTask, updateTaskStatus, type TaskOperation } from "./ledger.js";
import { extractZip, extensionForKind, isZipFile, MAX_FILE_BYTES, MAX_PAGES, moveFile, readFileSize, readPageCount, sniffFile } from "./files.js";
import { pollUntilComplete } from "./polling.js";

const jsonOutput = {
  schema: { type: "json" as const },
  render: (_args: unknown, value: unknown) => [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
};

function currentConfig(source: () => Config): ResolvedConfig {
  return resolveConfig(source());
}

/**
 * Resolve the API key at call time: explicit settings key (CLI) first, then
 * the credential reference (GUI writes / managed store / launch environment).
 */
export async function resolveApiKey(ctx: Context, config: ResolvedConfig): Promise<string> {
  if (config.apiKey !== undefined) return config.apiKey;
  const credentials = ctx.get("credentials") as { resolve(ref: ReturnType<typeof credentialRef>): Promise<{ value: string } | undefined> } | undefined;
  const resolved = credentials === undefined ? undefined : await credentials.resolve(credentialRef(config.apiKeyEnv));
  return resolved?.value ?? "";
}

export async function clientFrom(ctx: Context, source: () => Config): Promise<KolmoPdfClient> {
  const config = resolveConfig(source());
  const apiKey = await resolveApiKey(ctx, config);
  if (apiKey.length === 0) throw new KolmoPdfError("invalid_api_key", { message: missingApiKeyMessage(config.apiKeyEnv), remediation: "" });
  return new KolmoPdfClient({
    apiKey,
    baseUrl: config.baseUrl,
    httpTimeoutMs: config.httpTimeoutMs,
    uploadTimeoutMs: config.uploadTimeoutMs,
  });
}

async function outputRoot(config: ResolvedConfig, taskId: string, requested?: string, signal?: AbortSignal): Promise<string> {
  const base = resolve(config.outputDir);
  const subdir = requested?.trim() || taskId;
  if (isAbsolute(subdir)) throw new Error("output_subdir must be relative to the configured KolmoPDF output directory");
  const target = resolve(base, subdir);
  const rel = relative(base, target);
  if (rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("output_subdir must not escape the configured KolmoPDF output directory");
  await mkdir(target, { recursive: true });
  if (signal?.aborted === true) throw new KolmoPdfError("client_aborted");
  // Resolve symlinks so a pre-existing link cannot redirect writes outside the output directory.
  const [realBase, realTarget] = await Promise.all([realpath(base), realpath(target)]);
  const realRel = relative(realBase, realTarget);
  if (realRel === ".." || realRel.startsWith(`..${sep}`)) throw new Error("output_subdir must not escape the configured KolmoPDF output directory");
  return target;
}

async function validatePdf(data: Buffer, filePath: string, sizeCode: string, pageCode: string): Promise<number> {
  if (extname(filePath).toLowerCase() !== ".pdf") throw new Error(`Expected a PDF file: ${filePath}`);
  if (data.byteLength > MAX_FILE_BYTES) throw new KolmoPdfError(sizeCode);
  const pages = await readPageCount(data);
  if (pages > MAX_PAGES) throw new KolmoPdfError(pageCode);
  return pages;
}

async function waitForTask(client: KolmoPdfClient, taskId: string, config: ResolvedConfig, exec: ToolRunContext): Promise<void> {
  await pollUntilComplete(client, taskId, {
    pollIntervalMs: config.pollIntervalMs,
    maxPollMinutes: config.maxPollMinutes,
    signal: exec.signal,
  });
}

/** Record a submission in the settings-overview ledger. */
async function recordSubmission(operation: TaskOperation, filePath: string, submission: SubmitResult): Promise<void> {
  await recordTask(ledgerPath(), {
    task_id: submission.task_id,
    operation,
    file: filePath,
    created_at: Date.now(),
    updated_at: Date.now(),
    status: submission.status,
    ...(submission.points_deducted > 0 ? { points: submission.points_deducted } : {}),
  });
}

/** Ledger writes are best-effort: a failure must never fail a tool call. */
async function bestEffortLedger(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.warn(`[kolmopdf] task ledger update failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Track one submitted task through the settings-overview ledger: record, await, write the final status. */
async function trackTask(operation: TaskOperation, filePath: string, submission: SubmitResult, wait: () => Promise<void>): Promise<void> {
  await bestEffortLedger(() => recordSubmission(operation, filePath, submission));
  try {
    await wait();
    await bestEffortLedger(() => updateTaskStatus(ledgerPath(), submission.task_id, { status: "succeeded", updated_at: Date.now() }));
  } catch (error) {
    await bestEffortLedger(() => updateTaskStatus(ledgerPath(), submission.task_id, { status: "failed", error: error instanceof Error ? error.message : String(error), updated_at: Date.now() }));
    throw error;
  }
}

export function registerKolmoPdfTools(ctx: Context, source: () => Config): void {
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
      output_subdir: { type: "string", description: "Relative directory under the configured output directory." },
    },
    output: jsonOutput,
    async execute(args, exec) {
      const input = args as Record<string, unknown>;
      const config = currentConfig(source);
      const client = await clientFrom(ctx, source);
      const filePath = resolve(String(input.file_path));
      const data = await readFile(filePath);
      const pages = await validatePdf(data, filePath, "parse_file_too_large", "parse_page_limit_exceeded");
      const submission = await client.parse(filePath, input, exec.signal);
      await trackTask("parse", filePath, submission, () => waitForTask(client, submission.task_id, config, exec));
      const root = await outputRoot(config, submission.task_id, input.output_subdir as string | undefined, exec.signal);
      const temporary = resolve(root, "download.bin");
      await client.download(submission.task_id, temporary, exec.signal);
      let markdownPath: string;
      let imagesDir: string | null = null;
      let type: "zip_extracted" | "markdown_file";
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
        preview,
      };
    },
    presentCall: (args) => ({ card: "generic", title: `Parse ${basename(String((args as Record<string, unknown>).file_path ?? "PDF"))}`, kind: "read" }),
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
      output_subdir: { type: "string" },
    },
    output: jsonOutput,
    async execute(args, exec) {
      const input = args as Record<string, unknown>;
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
        enable_table_translation: input.enable_table_translation ?? false,
      }, exec.signal);
      await trackTask("translate", filePath, submission, () => waitForTask(client, submission.task_id, config, exec));
      const root = await outputRoot(config, submission.task_id, input.output_subdir as string | undefined, exec.signal);
      const temporary = resolve(root, "download.bin");
      await client.download(submission.task_id, temporary, exec.signal);
      const kind = await sniffFile(temporary);
      let translatedPath = resolve(root, `translated${extensionForKind(kind)}`);
      await moveFile(temporary, translatedPath);
      let archivePath: string | undefined;
      if (kind === "zip") {
        archivePath = translatedPath;
        const extracted = await extractZip(archivePath, root, exec.signal);
        const pdf = extracted.files.find((file) => file.toLowerCase().endsWith(".pdf"));
        if (pdf) translatedPath = pdf;
      }
      return {
        task_id: submission.task_id,
        pages_translated: pages,
        points_deducted: submission.points_deducted,
        remaining_points: submission.remaining_points,
        output: { kind, translated_pdf_path: translatedPath, ...(archivePath === undefined ? {} : { archive_path: archivePath }) },
      };
    },
    presentCall: (args) => ({ card: "generic", title: `Translate ${basename(String((args as Record<string, unknown>).file_path ?? "PDF"))}`, kind: "read" }),
  }));

  ctx.tools.register(defineTool({
    name: "kolmopdf_convert_markdown",
    description: "Convert a Markdown file, or a ZIP containing Markdown and images, into DOCX, HTML, PDF, or LaTeX with KolmoPDF.",
    parameters: {
      file_path: { type: "string", required: true },
      target_format: { type: "string", enum: ["word", "docx", "html", "pdf", "latex", "tex"] },
      output_subdir: { type: "string" },
    },
    output: jsonOutput,
    async execute(args, exec) {
      const input = args as Record<string, unknown>;
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
      const root = await outputRoot(config, submission.task_id, input.output_subdir as string | undefined, exec.signal);
      const temporary = resolve(root, "download.bin");
      await client.download(submission.task_id, temporary, exec.signal);
      const kind = await sniffFile(temporary);
      const destination = resolve(root, `result${extensionForKind(kind)}`);
      await moveFile(temporary, destination);
      return {
        task_id: submission.task_id,
        points_deducted: submission.points_deducted,
        remaining_points: submission.remaining_points,
        output: { output_path: destination, target_format: outputFormat, kind },
      };
    },
    presentCall: (args) => ({ card: "generic", title: `Convert ${basename(String((args as Record<string, unknown>).file_path ?? "Markdown"))}`, kind: "read" }),
  }));

  ctx.tools.register(defineTool({
    name: "kolmopdf_estimate_cost",
    description: "Estimate KolmoPDF credits before an operation and compare them with the current balance. Does not spend credits.",
    parameters: {
      file_path: { type: "string", required: true },
      operation: { type: "string", required: true, enum: ["parse", "parse_translate", "translate", "convert"] },
    },
    output: jsonOutput,
    async execute(args, exec) {
      const input = args as Record<string, unknown>;
      const operation = String(input.operation);
      let pages: number | null = null;
      if (operation !== "convert") {
        const filePath = resolve(String(input.file_path));
        const data = await readFile(filePath);
        pages = await validatePdf(data, filePath, "parse_file_too_large", "parse_page_limit_exceeded");
      }
      const estimated = operation === "convert" ? 1 : (pages ?? 0) * (operation === "parse_translate" ? 3 : 2);
      const config = currentConfig(source);
      const balance = await (await clientFrom(ctx, source)).getBalance(exec.signal);
      const shortfall = Math.max(0, estimated - balance.points);
      return {
        pages,
        estimated_credits: estimated,
        current_balance: balance.points,
        sufficient: shortfall === 0,
        shortfall,
        recommendation: shortfall === 0 ? "Sufficient" : `Top up at https://www.kolmopdf.com/subscription (short by ${shortfall} credits).`,
      };
    },
    isConcurrencySafe: () => true,
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
    isConcurrencySafe: () => true,
  }));

  ctx.tools.register(defineTool({
    name: "kolmopdf_get_task_status",
    description: "Inspect the status of an existing KolmoPDF task by id. Intended for troubleshooting or a timed-out task.",
    parameters: { task_id: { type: "string", required: true } },
    output: jsonOutput,
    async execute(args, exec) {
      const taskId = String((args as Record<string, unknown>).task_id);
      const status = await (await clientFrom(ctx, source)).getStatus(taskId, exec.signal);
      const result = status.result;
      return {
        success: status.success,
        status: status.status,
        ...(status.message === undefined ? {} : { message: status.message }),
        ...(status.error_code === undefined ? {} : { error_code: status.error_code }),
        ...(status.queue_info === undefined ? {} : { queue_info: { position: status.queue_info.position, ahead_tasks: status.queue_info.ahead_tasks } }),
        ...(result === undefined
          ? {}
          : {
              result: {
                task_id: result.task_id,
                ...(result.download_url === undefined ? {} : { download_url: result.download_url }),
                ...(result.filename == null ? {} : { filename: result.filename }),
                ...(result.kind == null ? {} : { kind: result.kind }),
                ...(result.content_type == null ? {} : { content_type: result.content_type }),
                ...(result.sha256 == null ? {} : { sha256: result.sha256 }),
                ...(result.bytes == null ? {} : { bytes: result.bytes }),
                ...(result.files == null ? {} : { files: result.files }),
              },
            }),
      };
    },
    isConcurrencySafe: () => true,
  }));
}
