window.__ModuleLoader__.load({ id: "@kolmopdf/dsh-kolmopdf", factory: (require) => {
"use strict";
var module = { exports: {} };
var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  KolmoPdfSettingsSection: () => KolmoPdfSettingsSection,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/constants.ts
var DEFAULT_API_KEY_ENV = "KOLMOPDF_API_KEY";
var CREDENTIAL_REF = DEFAULT_API_KEY_ENV;
function validateApiKey(key) {
  const trimmed = key.trim();
  if (trimmed.length === 0) return "API key must not be empty";
  if (/[\u0000-\u0020\u007f]/u.test(trimmed)) return "API key contains whitespace or control characters";
  return void 0;
}

// src/client.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var LOCALE_NAMESPACE = "settings.kolmopdf";
var zh = {
  nav: "KolmoPDF",
  title: "KolmoPDF",
  intro: "\u914D\u7F6E KolmoPDF API Key\uFF0C\u5373\u53EF\u5728 DeepSeek Harness \u4E2D\u89E3\u6790\u3001\u7FFB\u8BD1\u548C\u8F6C\u6362\u6587\u6863\u3002",
  configured: "API Key \u5DF2\u914D\u7F6E",
  missing: "\u5C1A\u672A\u914D\u7F6E API Key\uFF0C\u8BF7\u5728\u4E0B\u65B9\u8F93\u5165\u3002",
  keyLabel: "API Key",
  keyPlaceholder: "\u8F93\u5165\u65B0\u7684 API Key",
  keyStored: "\u5BC6\u94A5\u5DF2\u5B89\u5168\u4FDD\u5B58\uFF1B\u8F93\u5165\u65B0\u503C\u53EF\u66FF\u6362\u3002",
  save: "\u4FDD\u5B58",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  clear: "\u6E05\u9664 Key",
  loading: "\u6B63\u5728\u8BFB\u53D6\u8BBE\u7F6E\u2026",
  saved: "API Key \u5DF2\u4FDD\u5B58\u3002",
  cleared: "API Key \u5DF2\u6E05\u9664\u3002",
  empty: "\u8BF7\u8F93\u5165 API Key\u3002",
  readOnly: "\u5F53\u524D Key \u7531\u73AF\u5883\u53D8\u91CF\u63D0\u4F9B\uFF0C\u8BBE\u7F6E\u9875\u65E0\u6CD5\u4FEE\u6539\u3002",
  cli: "\u4E5F\u53EF\u901A\u8FC7 CLI \u914D\u7F6E\uFF1Adsh plugin --profile web exec kolmopdf -- config set-key",
  account: "\u53EF\u5728 https://www.kolmopdf.com/api-keys \u521B\u5EFA API Key\uFF08\u9700\u8981 Plus/Pro \u8D26\u6237\uFF09\u3002",
  failed: "\u8BBE\u7F6E\u64CD\u4F5C\u5931\u8D25",
  balanceTitle: "\u5B9E\u65F6\u79EF\u5206",
  balanceLoaded: "\u79EF\u5206\u4F59\u989D",
  balanceMissing: "\u914D\u7F6E API Key \u540E\u663E\u793A\u79EF\u5206\u4F59\u989D\u3002",
  balanceError: "\u79EF\u5206\u67E5\u8BE2\u5931\u8D25",
  balanceKey: "\u5F53\u524D Key",
  balanceRefresh: "\u5237\u65B0",
  refreshing: "\u5237\u65B0\u4E2D\u2026",
  tasksTitle: "\u4EFB\u52A1\u603B\u89C8",
  tasksEmpty: "\u6682\u65E0\u4EFB\u52A1\u3002\u901A\u8FC7 KolmoPDF \u5DE5\u5177\u63D0\u4EA4\u4EFB\u52A1\u540E\u4F1A\u5728\u8FD9\u91CC\u663E\u793A\u3002",
  tasksRefresh: "\u5237\u65B0",
  tasksClear: "\u6E05\u9664\u8BB0\u5F55",
  tasksError: "\u4EFB\u52A1\u5217\u8868\u52A0\u8F7D\u5931\u8D25",
  tasksUpdated: "\u66F4\u65B0\u4E8E",
  statusQueued: "\u6392\u961F\u4E2D",
  statusProcessing: "\u5904\u7406\u4E2D",
  statusSucceeded: "\u6210\u529F",
  statusFailed: "\u5931\u8D25",
  opParse: "PDF \u2192 Markdown",
  opTranslate: "PDF \u7FFB\u8BD1",
  opConvert: "Markdown \u8F6C\u6362",
  justNow: "\u521A\u521A",
  minutesAgo: " \u5206\u949F\u524D",
  hoursAgo: " \u5C0F\u65F6\u524D",
  daysAgo: " \u5929\u524D"
};
var en = {
  nav: "KolmoPDF",
  title: "KolmoPDF",
  intro: "Configure a KolmoPDF API key to parse, translate, and convert documents in DeepSeek Harness.",
  configured: "API key configured",
  missing: "No API key is configured. Enter one below.",
  keyLabel: "API key",
  keyPlaceholder: "Enter a new API key",
  keyStored: "A key is stored securely; enter a new value to replace it.",
  save: "Save",
  saving: "Saving\u2026",
  clear: "Clear key",
  loading: "Loading settings\u2026",
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
  refreshing: "Refreshing\u2026",
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
  opParse: "PDF \u2192 Markdown",
  opTranslate: "PDF translation",
  opConvert: "Markdown conversion",
  justNow: "just now",
  minutesAgo: " min ago",
  hoursAgo: " h ago",
  daysAgo: " d ago"
};
async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  return await response.json();
}
var STATUS_STYLE = {
  queued: { background: "#fef3c7", color: "#92400e" },
  processing: { background: "#dbeafe", color: "#1e40af" },
  succeeded: { background: "#dcfce7", color: "#166534" },
  failed: { background: "#fee2e2", color: "#991b1b" }
};
function statusLabel(status, t) {
  if (status === "queued") return t("statusQueued");
  if (status === "processing") return t("statusProcessing");
  if (status === "succeeded") return t("statusSucceeded");
  if (status === "failed") return t("statusFailed");
  return status;
}
function operationLabel(operation, t) {
  if (operation === "parse") return t("opParse");
  if (operation === "translate") return t("opTranslate");
  if (operation === "convert") return t("opConvert");
  return operation;
}
function timeAgo(timestamp, t) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1e3));
  if (seconds < 60) return t("justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${t("minutesAgo")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t("hoursAgo")}`;
  return `${Math.floor(hours / 24)}${t("daysAgo")}`;
}
function OverviewCard({ title, children, actions }) {
  const styles = {
    card: { border: "1px solid var(--dsw-color-border, #ddd)", borderRadius: 12, padding: 20, display: "grid", gap: 14 },
    heading: { margin: 0, fontSize: 16 },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
    actions: { display: "flex", gap: 8, flexWrap: "wrap" },
    body: { display: "grid", gap: 10 }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.card, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: styles.heading, children: title }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: styles.actions, children: actions })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: styles.body, children })
  ] });
}
function KolmoPdfSettingsSection({ api, remote, t }) {
  const [state, setState] = (0, import_react.useState)({ status: "loading", configured: false, writable: false });
  const [draft, setDraft] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [balance, setBalance] = (0, import_react.useState)(null);
  const [balanceBusy, setBalanceBusy] = (0, import_react.useState)(false);
  const [tasks, setTasks] = (0, import_react.useState)(null);
  const [tasksBusy, setTasksBusy] = (0, import_react.useState)(false);
  const load = (0, import_react.useCallback)(async () => {
    setState((current) => {
      const { message: _message, ...rest } = current;
      return { ...rest, status: "loading" };
    });
    try {
      const response = await api.credentials.describe({ refs: [CREDENTIAL_REF] });
      if (!response.result.ok) throw new Error(response.result.error.message);
      const view = response.result.value.credentials[CREDENTIAL_REF];
      if (view === void 0) throw new Error("The KolmoPDF credential reference is unavailable.");
      setState({ status: "ready", configured: view.configured, writable: view.writable });
    } catch (error) {
      setState({ status: "error", configured: false, writable: false, message: error instanceof Error ? error.message : String(error) });
    }
  }, [api.credentials]);
  const refreshBalance = (0, import_react.useCallback)(async () => {
    setBalanceBusy(true);
    try {
      setBalance(await getJson("/plugins/kolmopdf/balance"));
    } catch (error) {
      setBalance({ ok: false, configured: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setBalanceBusy(false);
    }
  }, []);
  const refreshTasks = (0, import_react.useCallback)(async () => {
    setTasksBusy(true);
    try {
      setTasks(await getJson("/plugins/kolmopdf/tasks?limit=20"));
    } catch (error) {
      setTasks({ ok: false, configured: false, tasks: [], error: error instanceof Error ? error.message : String(error) });
    } finally {
      setTasksBusy(false);
    }
  }, []);
  const clearTasks = (0, import_react.useCallback)(async () => {
    setTasksBusy(true);
    try {
      const response = await fetch("/plugins/kolmopdf/tasks", { method: "DELETE", cache: "no-store" });
      const body = await response.json();
      if (body.ok !== true) throw new Error(body.error ?? "clear failed");
      setTasks({ ok: true, configured: true, tasks: [] });
    } catch (error) {
      setTasks({ ok: false, configured: true, tasks: [], error: error instanceof Error ? error.message : String(error) });
    } finally {
      setTasksBusy(false);
    }
  }, []);
  (0, import_react.useEffect)(() => {
    void load();
  }, [load]);
  (0, import_react.useEffect)(() => remote.$on("credentials/reference-updated", () => {
    void load();
  }), [load, remote]);
  (0, import_react.useEffect)(() => {
    void refreshBalance();
    const id = setInterval(() => {
      void refreshBalance();
    }, 3e4);
    return () => clearInterval(id);
  }, [refreshBalance]);
  (0, import_react.useEffect)(() => {
    void refreshTasks();
    const id = setInterval(() => {
      void refreshTasks();
    }, 1e4);
    return () => clearInterval(id);
  }, [refreshTasks]);
  const save = async (event) => {
    event.preventDefault();
    const key = draft.trim();
    const invalid = validateApiKey(key);
    if (invalid !== void 0) {
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
    root: { maxWidth: 680, display: "grid", gap: 20 },
    heading: { margin: 0, fontSize: 24 },
    muted: { margin: 0, color: "var(--dsw-color-text-secondary, #666)", lineHeight: 1.6 },
    card: { border: "1px solid var(--dsw-color-border, #ddd)", borderRadius: 12, padding: 20, display: "grid", gap: 14 },
    status: { display: "flex", alignItems: "center", gap: 8, fontWeight: 600 },
    label: { display: "grid", gap: 8, fontWeight: 600 },
    actions: { display: "flex", gap: 10, flexWrap: "wrap" },
    message: { margin: 0, color: "var(--dsw-color-text-secondary, #666)" },
    stats: { display: "flex", gap: 24, flexWrap: "wrap" },
    stat: { display: "grid", gap: 4 },
    statValue: { margin: 0, fontSize: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
    statLabel: { margin: 0, fontSize: 12, color: "var(--dsw-color-text-secondary, #666)" },
    badge: { padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, display: "inline-block" },
    row: { display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--dsw-color-border, #eee)" },
    rowMain: { display: "grid", gap: 2, minWidth: 0 },
    rowTitle: { margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" },
    rowSub: { margin: 0, fontSize: 12, color: "var(--dsw-color-text-secondary, #666)" },
    rowMeta: { display: "grid", gap: 4, justifyItems: "end" },
    error: { margin: 0, color: "#b91c1c", lineHeight: 1.5 }
  };
  if (state.status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("loading") });
  const balanceReady = balance?.ok === true && balance.configured === true;
  const tasksReady = tasks?.ok === true;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: styles.root, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { style: styles.heading, children: t("title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.muted, children: t("intro") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", { style: styles.card, onSubmit: (event) => {
      void save(event);
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.status, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: state.configured ? "done" : "warning" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: state.configured ? t("configured") : t("missing") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: styles.label, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("keyLabel") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.Input,
          {
            type: "password",
            autoComplete: "off",
            value: draft,
            placeholder: t("keyPlaceholder"),
            disabled: !state.writable || busy,
            onChange: (event) => setDraft(event.currentTarget.value)
          }
        )
      ] }),
      state.configured ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.muted, children: t("keyStored") }) : null,
      !state.writable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.muted, children: t("readOnly") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.actions, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "submit", variant: "primary", disabled: !state.writable || busy, children: busy ? t("saving") : t("save") }),
        state.configured ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled: !state.writable || busy, onClick: () => {
          void clear();
        }, children: t("clear") }) : null
      ] }),
      state.message === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: state.status === "error" ? "alert" : "status", style: styles.message, children: state.message })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      OverviewCard,
      {
        title: t("balanceTitle"),
        actions: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled: balanceBusy, onClick: () => {
          void refreshBalance();
        }, children: balanceBusy ? t("refreshing") : t("balanceRefresh") }),
        children: [
          balanceReady ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.stats, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.stat, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.statValue, children: (balance.points ?? 0).toLocaleString() }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.statLabel, children: t("balanceLoaded") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.stat, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.statValue, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: balance.api_key_masked ?? "\u2014" }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.statLabel, children: t("balanceKey") })
            ] })
          ] }) : balance?.configured === false ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.muted, children: t("balanceMissing") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: styles.error, children: [
            t("balanceError"),
            ": ",
            balance?.error ?? "Unknown"
          ] }),
          balanceReady && balance.refreshed_at !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: styles.muted, children: [
            t("tasksUpdated"),
            ": ",
            timeAgo(balance.refreshed_at, t)
          ] }) : null
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      OverviewCard,
      {
        title: t("tasksTitle"),
        actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled: tasksBusy, onClick: () => {
            void refreshTasks();
          }, children: tasksBusy ? t("refreshing") : t("tasksRefresh") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled: tasksBusy, onClick: () => {
            void clearTasks();
          }, children: t("tasksClear") })
        ] }),
        children: [
          !tasksReady ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: styles.error, children: [
            t("tasksError"),
            ": ",
            tasks?.error ?? t("loading")
          ] }) : tasks.tasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.muted, children: t("tasksEmpty") }) : tasks.tasks.map((task) => {
            const badge = STATUS_STYLE[task.status] ?? { background: "#e5e7eb", color: "#374151" };
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.row, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...styles.badge, ...badge }, children: statusLabel(task.status, t) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.rowMain, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: styles.rowTitle, title: task.file, children: [
                  operationLabel(task.operation, t),
                  " \xB7 ",
                  task.file_name
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: styles.rowSub, children: [
                  task.task_id,
                  task.points !== void 0 ? ` \xB7 ${task.points} pts` : ""
                ] }),
                task.error === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: styles.rowSub, children: task.error })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.rowMeta, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: styles.rowSub, children: timeAgo(task.created_at, t) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: styles.rowSub, children: [
                  t("tasksUpdated"),
                  " ",
                  timeAgo(task.updated_at, t)
                ] })
              ] })
            ] }, task.task_id);
          }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: styles.muted, children: [
            t("tasksUpdated"),
            ": ",
            tasks?.refreshed_at === void 0 ? "\u2014" : timeAgo(tasks.refreshed_at, t)
          ] })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.muted, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: t("cli") }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.muted, children: t("account") })
    ] })
  ] });
}
var inject = ["slots", "locale", "connection", "remote"];
function apply(ctx) {
  const locale = ctx.get("locale");
  const connection = ctx.get("connection");
  const remote = ctx.get("remote");
  const slots = ctx.get("slots");
  ctx.effect(() => {
    const disposeZh = locale.register(LOCALE_NAMESPACE, "zh", zh);
    const disposeEn = locale.register(LOCALE_NAMESPACE, "en", en);
    return () => {
      disposeEn();
      disposeZh();
    };
  }, "kolmopdf: settings dictionaries");
  const t = locale.bind(LOCALE_NAMESPACE);
  slots.inject("settings.section", () => slots.register({
    name: "settings.section",
    id: "kolmopdf",
    order: 35,
    label: () => t("nav"),
    inject: () => ({ api: connection.api, remote, t })
  }, KolmoPdfSettingsSection));
}

return module.exports;
} });
//# sourceMappingURL=client.js.map
