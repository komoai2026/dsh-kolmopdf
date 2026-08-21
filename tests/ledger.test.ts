import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearLedger, ledgerPath, mutateLedger, readLedger, recordTask, updateTaskStatus, upsertTask, type TaskRecord } from "../src/ledger.js";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "kolmopdf-ledger-"));
  file = join(dir, "tasks.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function record(taskId: string, created = Date.now() - 1): TaskRecord {
  return {
    task_id: taskId,
    operation: "parse",
    file: "C:/docs/sample.pdf",
    created_at: created,
    updated_at: created,
    status: "queued",
  };
}

describe("ledger", () => {
  it("reads as empty when the file is missing or corrupt", async () => {
    expect(await readLedger(file)).toEqual({ version: 1, tasks: [] });
    await recordTask(file, record("t1"));
    await mutateLedger(file, () => { throw new Error("boom") }).catch(() => undefined);
    // A corrupt ledger must not break a read.
    await import("node:fs/promises").then((fs) => fs.writeFile(file, "{ not json"));
    expect(await readLedger(file)).toEqual({ version: 1, tasks: [] });
  });

  it("records tasks newest-first and preserves them across reads", async () => {
    await recordTask(file, record("t1", 100));
    await recordTask(file, record("t2", 200));
    const ledger = await readLedger(file);
    expect(ledger.tasks.map((task) => task.task_id)).toEqual(["t2", "t1"]);
    expect(ledger.tasks[0]).toMatchObject({ operation: "parse", file: "C:/docs/sample.pdf", status: "queued" });
  });

  it("upserts by task id instead of duplicating", async () => {
    await recordTask(file, record("t1", 100));
    await recordTask(file, record("t1", 300));
    const ledger = await readLedger(file);
    expect(ledger.tasks).toHaveLength(1);
    expect(ledger.tasks[0]?.created_at).toBe(300);
  });

  it("caps stored tasks at the newest 200", async () => {
    await mutateLedger(file, (ledger) => {
      for (let i = 0; i < 205; i += 1) upsertTask(ledger, record(`t${i}`, i));
    });
    const ledger = await readLedger(file);
    expect(ledger.tasks).toHaveLength(200);
    expect(ledger.tasks[0]?.task_id).toBe("t204");
    expect(ledger.tasks[199]?.task_id).toBe("t5");
  });

  it("updates status and error of a stored task; unknown ids are a no-op", async () => {
    await recordTask(file, record("t1"));
    await updateTaskStatus(file, "t1", { status: "succeeded", updated_at: 999 });
    expect((await readLedger(file)).tasks[0]).toMatchObject({ status: "succeeded", updated_at: 999 });
    await updateTaskStatus(file, "t1", { status: "failed", error: "boom", updated_at: 1000 });
    expect((await readLedger(file)).tasks[0]).toMatchObject({ status: "failed", error: "boom" });
    await updateTaskStatus(file, "t1", { status: "succeeded", updated_at: 1001 });
    expect((await readLedger(file)).tasks[0]?.error).toBeUndefined();
    await updateTaskStatus(file, "missing", { status: "succeeded", updated_at: 1002 });
    expect((await readLedger(file)).tasks).toHaveLength(1);
  });

  it("clears the ledger", async () => {
    await recordTask(file, record("t1"));
    await clearLedger(file);
    expect(await readLedger(file)).toEqual({ version: 1, tasks: [] });
    expect(await readFile(file, "utf8")).toContain("version");
  });

  it("upsertTask enforces the cap without a write", () => {
    const ledger = { version: 1 as const, tasks: [] as TaskRecord[] };
    for (let i = 0; i < 205; i += 1) upsertTask(ledger, record(`t${i}`, i));
    expect(ledger.tasks).toHaveLength(200);
    expect(ledger.tasks[0]?.task_id).toBe("t204");
  });

  it("places the ledger under $DSH_HOME/kolmopdf", () => {
    const previous = process.env.DSH_HOME;
    const home = join(tmpdir(), "dsh-home-test");
    try {
      process.env.DSH_HOME = home;
      expect(ledgerPath()).toBe(join(home, "kolmopdf", "tasks.json"));
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previous;
    }
  });
});
