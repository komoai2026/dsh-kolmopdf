import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import type { Config } from "./config.js";
import { maskApiKey } from "./config.js";
import { clientFrom } from "./tools.js";
import { clearLedger, ledgerPath, readLedger, updateTaskStatus, type TaskRecord } from "./ledger.js";
import { KolmoPdfError } from "./errors.js";

/**
 * Host half of the settings-page overview: two same-origin HTTP routes served
 * through the optional `webServer` service (web profiles), plus a subscription
 * that attaches them when webServer becomes available. Without webServer
 * (headless) the tools still work; the overview simply has no carrier.
 */

interface WebRouteHandler {
  (req: IncomingMessage, res: ServerResponse): void | Promise<void>;
}

interface WebServerLike {
  register(route: { kind: "exact" | "prefix"; path: string; handler: WebRouteHandler }): () => void;
}

const BALANCE_PATH = "/plugins/kolmopdf/balance";
const TASKS_PATH = "/plugins/kolmopdf/tasks";
const REFRESH_CAP = 20;

function json(res: ServerResponse, body: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function finiteInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function taskView(task: TaskRecord): Record<string, unknown> {
  return {
    task_id: task.task_id,
    operation: task.operation,
    file: task.file,
    file_name: task.file.split(/[\\/]/u).pop() ?? task.file,
    created_at: task.created_at,
    updated_at: task.updated_at,
    status: task.status,
    ...(task.points === undefined ? {} : { points: task.points }),
    ...(task.error === undefined ? {} : { error: task.error }),
  };
}

export function registerKolmoPdfHostApi(ctx: Context, source: () => Config): void {
  ctx.effect(() => {
    const disposers: Array<() => unknown> = [];
    const attached = new Set<WebServerLike>();

    const attachRoutes = (webServer: WebServerLike): void => {
      if (attached.has(webServer)) return;
      attached.add(webServer);

      const balanceHandler: WebRouteHandler = async (_req, res) => {
        try {
          const balance = await (await clientFrom(ctx, source)).getBalance();
          json(res, {
            ok: true,
            configured: true,
            points: balance.points,
            api_key_masked: maskApiKey(balance.api_key || ""),
            refreshed_at: Date.now(),
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
            code: error instanceof KolmoPdfError ? error.code : undefined,
          });
        }
      };

      const tasksHandler: WebRouteHandler = async (req, res) => {
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
        let ledger: { tasks: TaskRecord[] };
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
          const persists: Array<Promise<void>> = [];
          refreshed.forEach((settled, index) => {
            const task = tasks[index];
            if (task === undefined || settled.status !== "fulfilled") return;
            const status = settled.value;
            const nextStatus = status.status;
            const nextError = status.status === "failed" ? status.message : undefined;
            if (task.status !== nextStatus || task.error !== nextError) {
              task.status = nextStatus;
              if (nextError !== undefined) task.error = nextError;
              else delete task.error;
              task.updated_at = Date.now();
              persists.push(updateTaskStatus(path, task.task_id, {
                status: task.status,
                ...(task.error === undefined ? {} : { error: task.error }),
                updated_at: task.updated_at,
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
    if (existing !== undefined) attachRoutes(existing as WebServerLike);
    const off = ctx.root.on("internal/service", (name: string, value: unknown) => {
      if (name === "webServer" && value !== undefined) attachRoutes(value as WebServerLike);
    });
    disposers.push(off as () => unknown);

    return () => {
      for (const dispose of disposers) dispose();
    };
  }, "kolmopdf: settings overview host API");
}
