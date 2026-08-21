import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";

/**
 * Local task ledger backing the settings-page "task overview". Tools append a
 * record when they submit a KolmoPDF job; the overview endpoint re-reads live
 * status from the service and merges it back. Best-effort by design: a ledger
 * write failure must never fail a tool call.
 */

export type TaskOperation = "parse" | "translate" | "convert" | "status";

export interface TaskRecord {
  /** KolmoPDF task id. */
  task_id: string;
  /** The plugin operation that submitted the task. */
  operation: TaskOperation;
  /** Source file path as given to the tool. */
  file: string;
  /** Epoch milliseconds of the submission. */
  created_at: number;
  /** Epoch milliseconds of the last known status refresh. */
  updated_at: number;
  /** Last known (normalized) status: queued / processing / succeeded / failed. */
  status: string;
  /** Points deducted per the submission response, when known. */
  points?: number;
  /** Last error message when the task failed or a refresh returned an error. */
  error?: string;
}

export interface LedgerFile {
  version: 1;
  tasks: TaskRecord[];
}

const LEDGER_CAP = 200;

export function ledgerPath(home: string = resolveDshHome()): string {
  return join(home, "kolmopdf", "tasks.json");
}

function emptyLedger(): LedgerFile {
  return { version: 1, tasks: [] };
}

function normalize(value: unknown): LedgerFile {
  if (typeof value !== "object" || value === null) return emptyLedger();
  const ledger = value as Partial<LedgerFile>;
  const tasks = Array.isArray(ledger.tasks)
    ? ledger.tasks.filter((task): task is TaskRecord =>
      typeof task === "object" && task !== null
      && typeof (task as TaskRecord).task_id === "string"
      && typeof (task as TaskRecord).created_at === "number")
    : [];
  return { version: 1, tasks };
}

/** Read the ledger; a missing or corrupt file reads as empty. */
export async function readLedger(path: string): Promise<LedgerFile> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyLedger();
    throw error;
  }
  try {
    return normalize(JSON.parse(text));
  } catch {
    return emptyLedger();
  }
}

async function writeLedger(path: string, ledger: LedgerFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFileAtomic(path, JSON.stringify(ledger, null, 2) + "\n", { mode: 0o600, dirMode: 0o700 });
}

/**
 * Mutate the ledger under the shared writer lock. The operation may throw;
 * callers decide whether a ledger failure is fatal (tools treat it as noise).
 */
export async function mutateLedger(path: string, mutate: (ledger: LedgerFile) => void): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await withFileLock(path, async () => {
    const ledger = await readLedger(path);
    mutate(ledger);
    await writeLedger(path, ledger);
  });
}

/** Upsert one task record (by id) and cap the list at {@link LEDGER_CAP} newest entries. */
export function upsertTask(ledger: LedgerFile, record: TaskRecord): void {
  const index = ledger.tasks.findIndex((task) => task.task_id === record.task_id);
  if (index >= 0) ledger.tasks.splice(index, 1);
  ledger.tasks.unshift(record);
  if (ledger.tasks.length > LEDGER_CAP) ledger.tasks.length = LEDGER_CAP;
}

/** Append a submission record, newest first, capped. */
export async function recordTask(path: string, record: TaskRecord): Promise<void> {
  await mutateLedger(path, (ledger) => upsertTask(ledger, record));
}

/** Update the status (and optional error / points) of one stored task. No-op on unknown id. */
export async function updateTaskStatus(path: string, taskId: string, patch: { status: string; error?: string; points?: number; updated_at: number }): Promise<void> {
  await mutateLedger(path, (ledger) => {
    const task = ledger.tasks.find((entry) => entry.task_id === taskId);
    if (task === undefined) return;
    task.status = patch.status;
    task.updated_at = patch.updated_at;
    if (patch.points !== undefined) task.points = patch.points;
    if (patch.error !== undefined) task.error = patch.error;
    else delete task.error;
  });
}

/** Drop every stored task. */
export async function clearLedger(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await withFileLock(path, async () => {
    await writeLedger(path, emptyLedger());
  });
}
