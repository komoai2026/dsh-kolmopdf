import { setTimeout as delay } from "node:timers/promises";
import type { KolmoPdfClient, StatusResult } from "./api-client.js";
import { KolmoPdfError } from "./errors.js";

const OK = new Set(["succeeded", "completed"]);
const FAILED = new Set(["failed", "cancelled"]);

async function waitViaSse(
  client: KolmoPdfClient,
  taskId: string,
  deadline: number,
  signal?: AbortSignal,
): Promise<StatusResult | null> {
  const remaining = Math.max(1_000, deadline - Date.now());
  const timeout = AbortSignal.timeout(remaining);
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  try {
    const res = await client.openEvents(taskId, combined);
    const body = res.body;
    if (body === null) return null;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (!timeout.aborted) {
      if (signal?.aborted === true) throw new KolmoPdfError("client_aborted");
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep = buf.indexOf("\n\n");
      while (sep >= 0) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        let eventName = "message";
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
        }
        if (eventName === "job.succeeded") return client.getStatus(taskId, signal);
        if (eventName === "job.failed" || eventName === "job.cancelled") {
          const failed = await client.getStatus(taskId, signal);
          throw new KolmoPdfError(failed.error_code ?? eventName.slice("job.".length), {
            message: failed.message ?? `Task ${taskId} failed.`,
          });
        }
        sep = buf.indexOf("\n\n");
      }
    }
    return null;
  } catch (error) {
    if (error instanceof KolmoPdfError && error.code !== "api_task_error" && error.code !== "client_polling_timeout") throw error;
    return null;
  }
}

export async function pollUntilComplete(
  client: KolmoPdfClient,
  taskId: string,
  options: { pollIntervalMs: number; maxPollMinutes: number; signal?: AbortSignal; onProgress?: (message: string) => void },
): Promise<StatusResult> {
  const deadline = Date.now() + options.maxPollMinutes * 60_000;
  const viaSse = await waitViaSse(client, taskId, deadline, options.signal);
  if (viaSse) return viaSse;
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
