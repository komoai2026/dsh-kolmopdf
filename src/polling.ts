import { setTimeout as delay } from "node:timers/promises";
import type { KolmoPdfClient, StatusResult } from "./api-client.js";
import { KolmoPdfError } from "./errors.js";

const OK = new Set(["succeeded", "completed"]);
const FAILED = new Set(["failed", "cancelled"]);

function nextSseFrame(buf: string): { frame: string; rest: string } | null {
  const lf = buf.indexOf("\n\n");
  const crlf = buf.indexOf("\r\n\r\n");
  if (lf < 0 && crlf < 0) return null;
  if (crlf >= 0 && (lf < 0 || crlf < lf)) {
    return { frame: buf.slice(0, crlf), rest: buf.slice(crlf + 4) };
  }
  return { frame: buf.slice(0, lf), rest: buf.slice(lf + 2) };
}

function eventNameFromFrame(raw: string): string {
  let eventName = "message";
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
  }
  return eventName;
}

async function waitViaSse(
  client: KolmoPdfClient,
  taskId: string,
  deadline: number,
  signal?: AbortSignal,
): Promise<StatusResult | null> {
  const remaining = Math.max(1_000, deadline - Date.now());
  const timeout = AbortSignal.timeout(remaining);
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const res = await client.openEvents(taskId, combined);
    const body = res.body;
    if (body === null) return null;
    reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    const handleEvent = async (eventName: string): Promise<StatusResult | "continue"> => {
      if (eventName === "job.succeeded") {
        const status = await client.getStatus(taskId, signal);
        if (OK.has(status.status)) return status;
        return "continue";
      }
      if (eventName === "job.failed" || eventName === "job.cancelled") {
        const failed = await client.getStatus(taskId, signal);
        throw new KolmoPdfError(failed.error_code ?? eventName.slice("job.".length), {
          message: failed.message ?? `Task ${taskId} failed.`,
        });
      }
      return "continue";
    };

    while (!timeout.aborted) {
      if (signal?.aborted === true) throw new KolmoPdfError("client_aborted");
      const { done, value } = await reader.read();
      if (done) {
        buf += decoder.decode();
        const last = nextSseFrame(`${buf}\n\n`);
        if (last) {
          const result = await handleEvent(eventNameFromFrame(last.frame));
          if (result !== "continue") return result;
        }
        break;
      }
      buf += decoder.decode(value, { stream: true });
      let next = nextSseFrame(buf);
      while (next) {
        buf = next.rest;
        const result = await handleEvent(eventNameFromFrame(next.frame));
        if (result !== "continue") return result;
        next = nextSseFrame(buf);
      }
    }
    return null;
  } catch (error) {
    if (error instanceof KolmoPdfError && error.code !== "api_task_error" && error.code !== "client_polling_timeout") throw error;
    return null;
  } finally {
    try {
      await reader?.cancel();
    } catch {
      /* ignore */
    }
  }
}

export async function pollUntilComplete(
  client: KolmoPdfClient,
  taskId: string,
  options: { pollIntervalMs: number; maxPollMinutes: number; signal?: AbortSignal; onProgress?: (message: string) => void },
): Promise<StatusResult> {
  const deadline = Date.now() + options.maxPollMinutes * 60_000;
  const viaSse = await waitViaSse(client, taskId, deadline, options.signal);
  if (viaSse && OK.has(viaSse.status)) return viaSse;
  if (viaSse && FAILED.has(viaSse.status)) {
    throw new KolmoPdfError(viaSse.error_code ?? "api_task_error", { message: viaSse.message ?? `Task ${taskId} failed.` });
  }
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
