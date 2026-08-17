import { afterEach, describe, expect, it, vi } from "vitest";
import { KolmoPdfClient } from "../src/api-client.js";
import { KolmoPdfError } from "../src/errors.js";

const client = () => new KolmoPdfClient({ apiKey: "sk-secret", baseUrl: "https://example.test", httpTimeoutMs: 1_000, uploadTimeoutMs: 1_000 });

afterEach(() => vi.unstubAllGlobals());

describe("KolmoPdfClient", () => {
  it("sends both supported authentication headers", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("X-API-Key")).toBe("sk-secret");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-secret");
      return new Response(JSON.stringify({ success: true, points: 42, api_key: "masked" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(client().getBalance()).resolves.toEqual({ success: true, points: 42, api_key: "masked" });
  });

  it("maps API failures to a structured error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error_code: "insufficient_points", message: "No credits" }), { status: 402 })));
    await expect(client().getBalance()).rejects.toMatchObject({ code: "insufficient_points", httpStatus: 402 });
  });

  it("normalizes legacy task status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, status: "completed", result: { download_url: "https://example.test/result" } }), { status: 200 })));
    await expect(client().getStatus("task/1")).resolves.toMatchObject({ success: true, status: "succeeded", result: { task_id: "task/1" } });
  });
});
