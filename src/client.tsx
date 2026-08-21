import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { Button, Input, StateDot } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ClientRemote, IApiClient } from "@deepseek-ai/dsh-api-remotes/client";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type { LocaleRuntime } from "@deepseek-ai/dsh-client-locale/client";
import type { SettingsSectionOwnerProps } from "@deepseek-ai/dsh-client-ui-settings/client";
import { CREDENTIAL_REF, validateApiKey } from "./constants.js";

const LOCALE_NAMESPACE = "settings.kolmopdf";

const zh = {
  nav: "KolmoPDF",
  title: "KolmoPDF",
  intro: "配置 KolmoPDF API Key，即可在 DeepSeek Harness 中解析、翻译和转换文档。",
  configured: "API Key 已配置",
  missing: "尚未配置 API Key，请在下方输入。",
  keyLabel: "API Key",
  keyPlaceholder: "输入新的 API Key",
  keyStored: "密钥已安全保存；输入新值可替换。",
  save: "保存",
  saving: "保存中…",
  clear: "清除 Key",
  loading: "正在读取设置…",
  saved: "API Key 已保存。",
  cleared: "API Key 已清除。",
  empty: "请输入 API Key。",
  readOnly: "当前 Key 由环境变量提供，设置页无法修改。",
  cli: "也可通过 CLI 配置：dsh plugin --profile web exec kolmopdf -- config set-key",
  account: "可在 https://www.kolmopdf.com/api-keys 创建 API Key（需要 Plus/Pro 账户）。",
  failed: "设置操作失败",
  balanceTitle: "实时积分",
  balanceLoaded: "积分余额",
  balanceMissing: "配置 API Key 后显示积分余额。",
  balanceError: "积分查询失败",
  balanceKey: "当前 Key",
  balanceRefresh: "刷新",
  refreshing: "刷新中…",
  tasksTitle: "任务总览",
  tasksEmpty: "暂无任务。通过 KolmoPDF 工具提交任务后会在这里显示。",
  tasksRefresh: "刷新",
  tasksClear: "清除记录",
  tasksError: "任务列表加载失败",
  tasksUpdated: "更新于",
  statusQueued: "排队中",
  statusProcessing: "处理中",
  statusSucceeded: "成功",
  statusFailed: "失败",
  opParse: "PDF → Markdown",
  opTranslate: "PDF 翻译",
  opConvert: "Markdown 转换",
  justNow: "刚刚",
  minutesAgo: " 分钟前",
  hoursAgo: " 小时前",
  daysAgo: " 天前",
};

const en: typeof zh = {
  nav: "KolmoPDF",
  title: "KolmoPDF",
  intro: "Configure a KolmoPDF API key to parse, translate, and convert documents in DeepSeek Harness.",
  configured: "API key configured",
  missing: "No API key is configured. Enter one below.",
  keyLabel: "API key",
  keyPlaceholder: "Enter a new API key",
  keyStored: "A key is stored securely; enter a new value to replace it.",
  save: "Save",
  saving: "Saving…",
  clear: "Clear key",
  loading: "Loading settings…",
  saved: "API key saved.",
  cleared: "API key cleared.",
  empty: "Enter an API key.",
  readOnly: "The key is provided by the environment; it cannot be changed here.",
  cli: "You can also configure it from a terminal: dsh plugin --profile web exec kolmopdf -- config set-key",
  account: "Create a key at https://www.kolmopdf.com/api-keys (Plus/Pro account required).",
  failed: "Settings operation failed",
  balanceTitle: "Live credits",
  balanceLoaded: "Credit balance",
  balanceMissing: "Configure an API key to see the live credit balance.",
  balanceError: "Balance check failed",
  balanceKey: "Current key",
  balanceRefresh: "Refresh",
  refreshing: "Refreshing…",
  tasksTitle: "Task overview",
  tasksEmpty: "No tasks yet. Tasks submitted through the KolmoPDF tools appear here.",
  tasksRefresh: "Refresh",
  tasksClear: "Clear log",
  tasksError: "Task list failed to load",
  tasksUpdated: "Updated",
  statusQueued: "Queued",
  statusProcessing: "Processing",
  statusSucceeded: "Succeeded",
  statusFailed: "Failed",
  opParse: "PDF → Markdown",
  opTranslate: "PDF translation",
  opConvert: "Markdown conversion",
  justNow: "just now",
  minutesAgo: " min ago",
  hoursAgo: " h ago",
  daysAgo: " d ago",
} as const;

type Translate = (key: keyof typeof zh) => string;

interface State {
  status: "loading" | "ready" | "error";
  configured: boolean;
  writable: boolean;
  message?: string;
}

interface BalanceView {
  ok: boolean;
  configured: boolean;
  points?: number;
  api_key_masked?: string;
  refreshed_at?: number;
  error?: string;
}

interface TaskView {
  task_id: string;
  operation: string;
  file: string;
  file_name: string;
  created_at: number;
  updated_at: number;
  status: string;
  points?: number;
  error?: string;
}

interface TasksView {
  ok: boolean;
  configured: boolean;
  tasks: TaskView[];
  refreshed_at?: number;
  error?: string;
}

interface Injected {
  api: IApiClient;
  remote: ClientRemote;
  t: Translate;
}

type Props = SettingsSectionOwnerProps & Injected;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  return (await response.json()) as T;
}

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  queued: { background: "#fef3c7", color: "#92400e" },
  processing: { background: "#dbeafe", color: "#1e40af" },
  succeeded: { background: "#dcfce7", color: "#166534" },
  failed: { background: "#fee2e2", color: "#991b1b" },
};

function statusLabel(status: string, t: Translate): string {
  if (status === "queued") return t("statusQueued");
  if (status === "processing") return t("statusProcessing");
  if (status === "succeeded") return t("statusSucceeded");
  if (status === "failed") return t("statusFailed");
  return status;
}

function operationLabel(operation: string, t: Translate): string {
  if (operation === "parse") return t("opParse");
  if (operation === "translate") return t("opTranslate");
  if (operation === "convert") return t("opConvert");
  return operation;
}

function timeAgo(timestamp: number, t: Translate): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return t("justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${t("minutesAgo")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t("hoursAgo")}`;
  return `${Math.floor(hours / 24)}${t("daysAgo")}`;
}

function OverviewCard({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  const styles = {
    card: { border: "1px solid var(--dsw-color-border, #ddd)", borderRadius: 12, padding: 20, display: "grid", gap: 14 } as const,
    heading: { margin: 0, fontSize: 16 } as const,
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 } as const,
    actions: { display: "flex", gap: 8, flexWrap: "wrap" as const },
    body: { display: "grid", gap: 10 } as const,
  };
  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h3 style={styles.heading}>{title}</h3>
        <div style={styles.actions}>{actions}</div>
      </div>
      <div style={styles.body}>{children}</div>
    </div>
  );
}

export function KolmoPdfSettingsSection({ api, remote, t }: Props) {
  const [state, setState] = useState<State>({ status: "loading", configured: false, writable: false });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<BalanceView | null>(null);
  const [balanceBusy, setBalanceBusy] = useState(false);
  const [tasks, setTasks] = useState<TasksView | null>(null);
  const [tasksBusy, setTasksBusy] = useState(false);

  const load = useCallback(async () => {
    setState((current) => {
      const { message: _message, ...rest } = current;
      return { ...rest, status: "loading" };
    });
    try {
      const response = await api.credentials.describe({ refs: [CREDENTIAL_REF] });
      if (!response.result.ok) throw new Error(response.result.error.message);
      const view = response.result.value.credentials[CREDENTIAL_REF];
      if (view === undefined) throw new Error("The KolmoPDF credential reference is unavailable.");
      setState({ status: "ready", configured: view.configured, writable: view.writable });
    } catch (error) {
      setState({ status: "error", configured: false, writable: false, message: error instanceof Error ? error.message : String(error) });
    }
  }, [api.credentials]);

  const refreshBalance = useCallback(async () => {
    setBalanceBusy(true);
    try {
      setBalance(await getJson<BalanceView>("/plugins/kolmopdf/balance"));
    } catch (error) {
      setBalance({ ok: false, configured: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setBalanceBusy(false);
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    setTasksBusy(true);
    try {
      setTasks(await getJson<TasksView>("/plugins/kolmopdf/tasks?limit=20"));
    } catch (error) {
      setTasks({ ok: false, configured: false, tasks: [], error: error instanceof Error ? error.message : String(error) });
    } finally {
      setTasksBusy(false);
    }
  }, []);

  const clearTasks = useCallback(async () => {
    setTasksBusy(true);
    try {
      const response = await fetch("/plugins/kolmopdf/tasks", { method: "DELETE", cache: "no-store" });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (body.ok !== true) throw new Error(body.error ?? "clear failed");
      setTasks({ ok: true, configured: true, tasks: [] });
    } catch (error) {
      setTasks({ ok: false, configured: true, tasks: [], error: error instanceof Error ? error.message : String(error) });
    } finally {
      setTasksBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => remote.$on("credentials/reference-updated", () => { void load(); }), [load, remote]);
  useEffect(() => { void refreshBalance(); const id = setInterval(() => { void refreshBalance(); }, 30_000); return () => clearInterval(id); }, [refreshBalance]);
  useEffect(() => { void refreshTasks(); const id = setInterval(() => { void refreshTasks(); }, 10_000); return () => clearInterval(id); }, [refreshTasks]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const key = draft.trim();
    const invalid = validateApiKey(key);
    if (invalid !== undefined) {
      setState((current) => ({ ...current, message: invalid }));
      return;
    }
    setBusy(true);
    try {
      const response = await api.credentials.set({ ref: CREDENTIAL_REF, value: key });
      if (!response.result.ok) throw new Error(response.result.error.message);
      setDraft("");
      setState({ status: "ready", configured: true, writable: state.writable, message: t("saved") });
      void refreshBalance();
      void refreshTasks();
    } catch (error) {
      setState((current) => ({ ...current, message: `${t("failed")}: ${error instanceof Error ? error.message : String(error)}` }));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      const response = await api.credentials.unset({ ref: CREDENTIAL_REF });
      if (!response.result.ok) throw new Error(response.result.error.message);
      setDraft("");
      setState({ status: "ready", configured: false, writable: state.writable, message: t("cleared") });
      void refreshBalance();
      void refreshTasks();
    } catch (error) {
      setState((current) => ({ ...current, message: `${t("failed")}: ${error instanceof Error ? error.message : String(error)}` }));
    } finally {
      setBusy(false);
    }
  };

  const styles = {
    root: { maxWidth: 680, display: "grid", gap: 20 } as const,
    heading: { margin: 0, fontSize: 24 } as const,
    muted: { margin: 0, color: "var(--dsw-color-text-secondary, #666)", lineHeight: 1.6 } as const,
    card: { border: "1px solid var(--dsw-color-border, #ddd)", borderRadius: 12, padding: 20, display: "grid", gap: 14 } as const,
    status: { display: "flex", alignItems: "center", gap: 8, fontWeight: 600 } as const,
    label: { display: "grid", gap: 8, fontWeight: 600 } as const,
    actions: { display: "flex", gap: 10, flexWrap: "wrap" as const },
    message: { margin: 0, color: "var(--dsw-color-text-secondary, #666)" } as const,
    stats: { display: "flex", gap: 24, flexWrap: "wrap" as const } as const,
    stat: { display: "grid", gap: 4 } as const,
    statValue: { margin: 0, fontSize: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums" } as const,
    statLabel: { margin: 0, fontSize: 12, color: "var(--dsw-color-text-secondary, #666)" } as const,
    badge: { padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, display: "inline-block" } as const,
    row: { display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--dsw-color-border, #eee)" } as const,
    rowMain: { display: "grid", gap: 2, minWidth: 0 } as const,
    rowTitle: { margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" } as const,
    rowSub: { margin: 0, fontSize: 12, color: "var(--dsw-color-text-secondary, #666)" } as const,
    rowMeta: { display: "grid", gap: 4, justifyItems: "end" } as const,
    error: { margin: 0, color: "#b91c1c", lineHeight: 1.5 } as const,
  };

  if (state.status === "loading") return <p>{t("loading")}</p>;

  const balanceReady = balance?.ok === true && balance.configured === true;
  const tasksReady = tasks?.ok === true;

  return (
    <section style={styles.root}>
      <div>
        <h2 style={styles.heading}>{t("title")}</h2>
        <p style={styles.muted}>{t("intro")}</p>
      </div>
      <form style={styles.card} onSubmit={(event) => { void save(event); }}>
        <div style={styles.status}>
          <StateDot state={state.configured ? "done" : "warning"} />
          <span>{state.configured ? t("configured") : t("missing")}</span>
        </div>
        <label style={styles.label}>
          <span>{t("keyLabel")}</span>
          <Input
            type="password"
            autoComplete="off"
            value={draft}
            placeholder={t("keyPlaceholder")}
            disabled={!state.writable || busy}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
        </label>
        {state.configured ? <p style={styles.muted}>{t("keyStored")}</p> : null}
        {!state.writable ? <p style={styles.muted}>{t("readOnly")}</p> : null}
        <div style={styles.actions}>
          <Button type="submit" variant="primary" disabled={!state.writable || busy}>{busy ? t("saving") : t("save")}</Button>
          {state.configured ? <Button type="button" variant="outline" disabled={!state.writable || busy} onClick={() => { void clear(); }}>{t("clear")}</Button> : null}
        </div>
        {state.message === undefined ? null : <p role={state.status === "error" ? "alert" : "status"} style={styles.message}>{state.message}</p>}
      </form>

      <OverviewCard
        title={t("balanceTitle")}
        actions={(
          <Button type="button" variant="outline" disabled={balanceBusy} onClick={() => { void refreshBalance(); }}>
            {balanceBusy ? t("refreshing") : t("balanceRefresh")}
          </Button>
        )}
      >
        {balanceReady ? (
          <div style={styles.stats}>
            <div style={styles.stat}>
              <p style={styles.statValue}>{(balance.points ?? 0).toLocaleString()}</p>
              <p style={styles.statLabel}>{t("balanceLoaded")}</p>
            </div>
            <div style={styles.stat}>
              <p style={styles.statValue}><code>{balance.api_key_masked ?? "—"}</code></p>
              <p style={styles.statLabel}>{t("balanceKey")}</p>
            </div>
          </div>
        ) : balance?.configured === false ? (
          <p style={styles.muted}>{t("balanceMissing")}</p>
        ) : (
          <p style={styles.error}>{t("balanceError")}: {balance?.error ?? "Unknown"}</p>
        )}
        {balanceReady && balance.refreshed_at !== undefined ? (
          <p style={styles.muted}>{t("tasksUpdated")}: {timeAgo(balance.refreshed_at, t)}</p>
        ) : null}
      </OverviewCard>

      <OverviewCard
        title={t("tasksTitle")}
        actions={(
          <>
            <Button type="button" variant="outline" disabled={tasksBusy} onClick={() => { void refreshTasks(); }}>
              {tasksBusy ? t("refreshing") : t("tasksRefresh")}
            </Button>
            <Button type="button" variant="outline" disabled={tasksBusy} onClick={() => { void clearTasks(); }}>
              {t("tasksClear")}
            </Button>
          </>
        )}
      >
        {!tasksReady ? (
          <p style={styles.error}>{t("tasksError")}: {tasks?.error ?? t("loading")}</p>
        ) : tasks.tasks.length === 0 ? (
          <p style={styles.muted}>{t("tasksEmpty")}</p>
        ) : tasks.tasks.map((task) => {
          const badge = STATUS_STYLE[task.status] ?? { background: "#e5e7eb", color: "#374151" };
          return (
            <div key={task.task_id} style={styles.row}>
              <span style={{ ...styles.badge, ...badge }}>{statusLabel(task.status, t)}</span>
              <div style={styles.rowMain}>
                <span style={styles.rowTitle} title={task.file}>{operationLabel(task.operation, t)} · {task.file_name}</span>
                <span style={styles.rowSub}>{task.task_id}{task.points !== undefined ? ` · ${task.points} pts` : ""}</span>
                {task.error === undefined ? null : <span style={styles.rowSub}>{task.error}</span>}
              </div>
              <div style={styles.rowMeta}>
                <span style={styles.rowSub}>{timeAgo(task.created_at, t)}</span>
                <span style={styles.rowSub}>{t("tasksUpdated")} {timeAgo(task.updated_at, t)}</span>
              </div>
            </div>
          );
        })}
        <p style={styles.muted}>{t("tasksUpdated")}: {tasks?.refreshed_at === undefined ? "—" : timeAgo(tasks.refreshed_at, t)}</p>
      </OverviewCard>

      <div>
        <p style={styles.muted}><code>{t("cli")}</code></p>
        <p style={styles.muted}>{t("account")}</p>
      </div>
    </section>
  );
}

export const inject = ["slots", "locale", "connection", "remote"];

export function apply(ctx: ClientContext): void {
  const locale = ctx.get("locale") as LocaleRuntime;
  const connection = ctx.get("connection") as ConnectionHandle;
  const remote = ctx.get("remote") as ClientRemote;
  const slots = ctx.get("slots") as ClientContext["slots"];
  ctx.effect(() => {
    const disposeZh = locale.register(LOCALE_NAMESPACE, "zh", zh);
    const disposeEn = locale.register(LOCALE_NAMESPACE, "en", en);
    return () => { disposeEn(); disposeZh(); };
  }, "kolmopdf: settings dictionaries");
  const t = locale.bind(LOCALE_NAMESPACE) as Translate;
  slots.inject("settings.section", () => slots.register({
    name: "settings.section",
    id: "kolmopdf",
    order: 35,
    label: () => t("nav"),
    inject: () => ({ api: connection.api, remote, t }),
  }, KolmoPdfSettingsSection));
}
