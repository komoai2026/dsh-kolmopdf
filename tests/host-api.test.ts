import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import { registerKolmoPdfHostApi } from "../src/host-api.js";
import { recordTask } from "../src/ledger.js";

interface FakeRoute {
  path: string;
  handler: (req: unknown, res: FakeResponse) => void | Promise<void>;
}

interface FakeResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  setHeader(key: string, value: string): void;
  end(body?: string): void;
}

interface FakeWebServer {
  registered: Map<string, FakeRoute>;
  register(route: { kind: "exact" | "prefix"; path: string; handler: FakeRoute["handler"] }): () => void;
}

function makeWebServer(): FakeWebServer {
  const registered = new Map<string, FakeRoute>();
  return {
    registered,
    register(route) {
      registered.set(route.path, { path: route.path, handler: route.handler });
      return () => registered.delete(route.path);
    },
  };
}

function makeResponse(): FakeResponse {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(key, value) { this.headers[key] = value; },
    end(body) { this.body = body ?? ""; },
  };
}

async function call(server: FakeWebServer, url: string, method = "GET"): Promise<FakeResponse> {
  const pathname = url.split("?")[0] ?? url;
  const route = server.registered.get(pathname);
  if (route === undefined) throw new Error(`no route for ${pathname}`);
  const response = makeResponse();
  await route.handler({ method, url }, response);
  return response;
}

function jsonOf(response: FakeResponse): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

let home: string;
let previousHome: string | undefined;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "kolmopdf-host-api-"));
  previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
  await rm(home, { recursive: true, force: true });
});

function makeContext(server?: FakeWebServer): Context {
  const ctx = new Context();
  ctx.provide("credentials", {
    resolve: async () => ({ value: "sk-test-key-1234567890" }),
  });
  if (server !== undefined) ctx.provide("webServer", server);
  return ctx;
}

describe("host API", () => {
  it("registers the balance and tasks routes when webServer is already provided", async () => {
    const server = makeWebServer();
    const ctx = makeContext(server);
    registerKolmoPdfHostApi(ctx, () => ({}));
    expect(server.registered.has("/plugins/kolmopdf/balance")).toBe(true);
    expect(server.registered.has("/plugins/kolmopdf/tasks")).toBe(true);
  });

  it("attaches later when webServer is provided after activation", async () => {
    const server = makeWebServer();
    const ctx = new Context();
    ctx.provide("credentials", { resolve: async () => ({ value: "sk-test" }) });
    registerKolmoPdfHostApi(ctx, () => ({}));
    expect(server.registered.size).toBe(0);
    ctx.provide("webServer", server);
    expect(server.registered.has("/plugins/kolmopdf/balance")).toBe(true);
  });

  it("reports not-configured without a key", async () => {
    const server = makeWebServer();
    const ctx = new Context();
    ctx.provide("credentials", { resolve: async () => undefined });
    ctx.provide("webServer", server);
    registerKolmoPdfHostApi(ctx, () => ({}));
    const response = await call(server, "/plugins/kolmopdf/balance");
    expect(jsonOf(response)).toEqual({ ok: true, configured: false });
  });

  it("returns the live balance with a masked key", async () => {
    const server = makeWebServer();
    const ctx = makeContext(server);
    registerKolmoPdfHostApi(ctx, () => ({}));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ success: true, points: 1234, api_key: "sk-test-key-1234567890" }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    const response = await call(server, "/plugins/kolmopdf/balance");
    const body = jsonOf(response);
    expect(body.ok).toBe(true);
    expect(body.configured).toBe(true);
    expect(body.points).toBe(1234);
    expect(body.api_key_masked).toBe("sk-tes***7890");
    expect(body.refreshed_at).toBeTypeOf("number");
  });

  it("fails loudly when the service errors", async () => {
    const server = makeWebServer();
    const ctx = makeContext(server);
    registerKolmoPdfHostApi(ctx, () => ({}));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ success: false, error: { code: "api_task_error", message: "boom" } }),
      { status: 500, headers: { "content-type": "application/json" } },
    )));
    const response = await call(server, "/plugins/kolmopdf/balance");
    expect(jsonOf(response)).toMatchObject({ ok: false, configured: false, code: "api_task_error" });
  });

  it("lists stored tasks and refreshes their status", async () => {
    const server = makeWebServer();
    const ctx = makeContext(server);
    registerKolmoPdfHostApi(ctx, () => ({}));
    await recordTask(join(home, "kolmopdf", "tasks.json"), {
      task_id: "task-1",
      operation: "parse",
      file: "C:/docs/a.pdf",
      created_at: 1000,
      updated_at: 1000,
      status: "queued",
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ status: "processing", queue: { ahead: 2 } }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    const response = await call(server, "/plugins/kolmopdf/tasks?limit=20");
    const body = jsonOf(response);
    expect(body.ok).toBe(true);
    expect(body.configured).toBe(true);
    const tasks = body.tasks as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      task_id: "task-1",
      operation: "parse",
      status: "processing",
      file_name: "a.pdf",
    });
    // The refreshed status was merged back into the ledger.
    const { readLedger } = await import("../src/ledger.js");
    const ledger = await readLedger(join(home, "kolmopdf", "tasks.json"));
    expect(ledger.tasks[0]?.status).toBe("processing");
  });

  it("keeps stored status when the service refresh fails", async () => {
    const server = makeWebServer();
    const ctx = makeContext(server);
    registerKolmoPdfHostApi(ctx, () => ({}));
    await recordTask(join(home, "kolmopdf", "tasks.json"), {
      task_id: "task-1",
      operation: "convert",
      file: "C:/docs/a.md",
      created_at: 1000,
      updated_at: 1000,
      status: "succeeded",
    });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const response = await call(server, "/plugins/kolmopdf/tasks");
    const body = jsonOf(response);
    expect(body.ok).toBe(true);
    expect((body.tasks as Array<Record<string, unknown>>)[0]?.status).toBe("succeeded");
  });

  it("clears the ledger through DELETE", async () => {
    const server = makeWebServer();
    const ctx = makeContext(server);
    registerKolmoPdfHostApi(ctx, () => ({}));
    await recordTask(join(home, "kolmopdf", "tasks.json"), {
      task_id: "task-1",
      operation: "parse",
      file: "C:/docs/a.pdf",
      created_at: 1000,
      updated_at: 1000,
      status: "queued",
    });
    const response = await call(server, "/plugins/kolmopdf/tasks", "DELETE");
    expect(jsonOf(response)).toEqual({ ok: true, cleared: true });
    const { readLedger } = await import("../src/ledger.js");
    expect((await readLedger(join(home, "kolmopdf", "tasks.json"))).tasks).toEqual([]);
  });
});
