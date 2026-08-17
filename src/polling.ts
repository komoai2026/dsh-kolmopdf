import { setTimeout as delay } from "node:timers/promises";
import type { KolmoPdfClient, StatusResult } from "./api-client.js";
import { KolmoPdfError } from "./errors.js";

const OK = new Set(["succeeded", "completed"]);
const FAILED = new Set(["failed", "cancelled"]);

export async function pollUntilComplete(
  client: KolmoPdfClient,
  taskId: string,
  options: { pollIntervalMs: number; maxPollMinutes: number; signal?: AbortSignal; onProgress?: (message: string) => void },
): Promise<StatusResult> {
  const deadline = Date.now() + options.maxPollMinutes * 60_000;
  while (true) {
    if (options.signal?.aborted === true) throw new KolmoPdfError("client_aborted");
    if (Date.now() > deadline) throw new KolmoPdfError("client_polling_timeout");
    const result = await client.getStatus(taskId, options.signal);
    if (OK.has(result.status)) return result;
    if (FAILED.has(result.status)) throw new KolmoPdfError(result.error_code ?? "api_task_error", { message: result.message ?? `Task ${taskId} failed.` });
    const ahead = result.queue_info?.ahead_tasks;
    options.onProgress?.(ahead === undefined ? `Task ${taskId}: ${result.status}` : `Task ${taskId}: ${result.status} (${ahead} ahead)`);
    await delay(options.pollIntervalMs, undefined, { signal: options.signal }).catch((error) => { throw new KolmoPdfError("client_aborted", { cause: error }); });
  }
}
