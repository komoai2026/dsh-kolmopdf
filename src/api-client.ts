import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import { apiError, KolmoPdfError } from "./errors.js";

export interface ClientOptions {
  apiKey: string;
  baseUrl: string;
  httpTimeoutMs: number;
  uploadTimeoutMs: number;
}

/** Hard cap on one result download (2 GiB), enforced against headers and streamed bytes. */
export const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export interface SubmitResult {
  task_id: string;
  status: string;
  points_deducted: number;
  remaining_points: number;
  queue_info?: { position: number; ahead_tasks: number };
}

export interface StatusResult {
  success: boolean;
  status: string;
  message?: string;
  error_code?: string;
  queue_info?: { position: number; ahead_tasks: number };
  result?: { task_id: string; download_url: string };
}

export interface BalanceResult {
  success: boolean;
  points: number;
  api_key: string;
}

function timeoutSignal(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent === undefined ? timeout : AbortSignal.any([parent, timeout]);
}

function normalizeStatus(value: unknown): string {
  const status = typeof value === "string" && value.length > 0 ? value : "processing";
  if (status === "completed") return "succeeded";
  if (status === "pending" || status === "waiting") return "queued";
  return status;
}

export class KolmoPdfClient {
  constructor(private readonly options: ClientOptions) {}

  private headers(): Record<string, string> {
    return { "X-API-Key": this.options.apiKey, Authorization: `Bearer ${this.options.apiKey}` };
  }

  private async json(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      if (init.signal?.aborted === true) throw new KolmoPdfError("client_aborted", { cause: error });
      throw new KolmoPdfError("api_task_error", { message: error instanceof Error ? error.message : String(error), cause: error });
    }
    const text = await response.text();
    let body: Record<string, unknown> = {};
    if (text.length > 0) {
      try { body = JSON.parse(text) as Record<string, unknown>; }
      catch { if (!response.ok) throw new KolmoPdfError("api_task_error", { message: `HTTP ${response.status}: non-JSON response`, httpStatus: response.status }); }
    }
    if (!response.ok || body.success === false) throw apiError(body, response.status);
    return body;
  }

  private async uploadForm(filePath: string): Promise<FormData> {
    const bytes = await readFile(filePath);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)]), basename(filePath));
    return form;
  }

  private submit(body: Record<string, unknown>): SubmitResult {
    const id = String(body.id ?? body.task_id ?? body.legacy_task_id ?? "");
    if (id.length === 0) throw new KolmoPdfError("api_task_error", { message: "KolmoPDF response did not include a task id." });
    const queue = typeof body.queue === "object" && body.queue !== null ? body.queue as Record<string, unknown> : undefined;
    return {
      task_id: id,
      status: normalizeStatus(body.status),
      points_deducted: Number(body.points_deducted ?? 0),
      remaining_points: Number(body.remaining_points ?? 0),
      ...(typeof queue?.ahead === "number" ? { queue_info: { position: Number(queue.position ?? 0), ahead_tasks: queue.ahead } } : {}),
    };
  }

  async parse(filePath: string, options: Record<string, unknown>, signal?: AbortSignal): Promise<SubmitResult> {
    const form = await this.uploadForm(filePath);
    const names: Record<string, string> = {
      table_mode: "table_mode", formula_format: "formula_format", enable_translation: "enable_translation",
      target_language: "target_language", output_options: "output_options", images_as_url: "images_as_url",
      skip_rotation_detection: "skip_rotation_detection", enable_cross_page_merge: "enable_cross_page_merge", enrichment: "enrichment",
    };
    for (const [source, destination] of Object.entries(names)) {
      const value = options[source];
      if (value !== undefined) form.append(destination, Array.isArray(value) ? value.join(",") : String(value));
    }
    return this.submit(await this.json(`${this.options.baseUrl}/api/v1/jobs/parse`, {
      method: "POST", headers: { ...this.headers(), "Idempotency-Key": randomUUID() }, body: form,
      signal: timeoutSignal(signal, this.options.uploadTimeoutMs),
    }));
  }

  async translate(filePath: string, options: Record<string, unknown>, signal?: AbortSignal): Promise<SubmitResult> {
    const form = await this.uploadForm(filePath);
    const names: Record<string, string> = {
      source_language: "sourceLanguage", target_language: "targetLanguage", layout_modes: "layoutModes",
      enable_image_translation: "enableImageTranslation", enable_table_translation: "enableTableTranslation",
    };
    for (const [source, destination] of Object.entries(names)) {
      const value = options[source];
      if (value !== undefined) form.append(destination, Array.isArray(value) ? value.join(",") : String(value));
    }
    return this.submit(await this.json(`${this.options.baseUrl}/api/v1/jobs/translate-pdf`, {
      method: "POST", headers: { ...this.headers(), "Idempotency-Key": randomUUID() }, body: form,
      signal: timeoutSignal(signal, this.options.uploadTimeoutMs),
    }));
  }

  async convert(filePath: string, targetFormat: string, signal?: AbortSignal): Promise<SubmitResult> {
    const form = await this.uploadForm(filePath);
    form.append("targetFormat", targetFormat);
    return this.submit(await this.json(`${this.options.baseUrl}/api/v1/jobs/convert`, {
      method: "POST", headers: { ...this.headers(), "Idempotency-Key": randomUUID() }, body: form,
      signal: timeoutSignal(signal, this.options.uploadTimeoutMs),
    }));
  }

  async getStatus(taskId: string, signal?: AbortSignal): Promise<StatusResult> {
    const body = await this.json(`${this.options.baseUrl}/api/v1/jobs/${encodeURIComponent(taskId)}`, {
      method: "GET", headers: this.headers(), signal: timeoutSignal(signal, this.options.httpTimeoutMs),
    });
    const status = normalizeStatus(body.status);
    const error = typeof body.error === "object" && body.error !== null ? body.error as Record<string, unknown> : undefined;
    const queue = typeof body.queue === "object" && body.queue !== null ? body.queue as Record<string, unknown> : undefined;
    const result = typeof body.result === "object" && body.result !== null ? body.result as Record<string, unknown> : undefined;
    return {
      success: status === "succeeded",
      status,
      ...(typeof body.message === "string" ? { message: body.message } : typeof error?.message === "string" ? { message: error.message } : {}),
      ...(typeof error?.code === "string" ? { error_code: error.code } : {}),
      ...(typeof queue?.ahead === "number" ? { queue_info: { position: Number(queue.position ?? 0), ahead_tasks: queue.ahead } } : {}),
      ...(typeof result?.download_url === "string" ? { result: { task_id: taskId, download_url: result.download_url } } : {}),
    };
  }

  async download(taskId: string, destination: string, signal?: AbortSignal): Promise<{ contentType: string | null; bytesWritten: number }> {
    const response = await fetch(`${this.options.baseUrl}/api/v1/jobs/${encodeURIComponent(taskId)}/download`, {
      method: "GET", headers: this.headers(), signal: timeoutSignal(signal, this.options.uploadTimeoutMs),
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
        await new Promise<void>((accept) => output.end(() => accept()));
        throw new KolmoPdfError("client_aborted");
      }
      const { done, value } = await reader.read();
      if (done) break;
      written += value.byteLength;
      if (written > MAX_DOWNLOAD_BYTES) {
        await new Promise<void>((accept) => output.end(() => accept()));
        throw new KolmoPdfError("client_download_too_large");
      }
      const ok = output.write(Buffer.from(value));
      if (!ok) await new Promise<void>((accept) => output.once("drain", () => accept()));
    }
    await new Promise<void>((accept, reject) => output.end((error: Error | null | undefined) => error === undefined || error === null ? accept() : reject(error)));
    return { contentType: response.headers.get("content-type"), bytesWritten: written };
  }

  async getBalance(signal?: AbortSignal): Promise<BalanceResult> {
    const body = await this.json(`${this.options.baseUrl}/api/v1/balance`, {
      method: "GET", headers: this.headers(), signal: timeoutSignal(signal, this.options.httpTimeoutMs),
    });
    return { success: body.success !== false, points: Number(body.points ?? 0), api_key: String(body.api_key ?? "") };
  }
}
