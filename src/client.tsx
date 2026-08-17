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
};

type Translate = (key: keyof typeof zh) => string;

interface State {
  status: "loading" | "ready" | "error";
  configured: boolean;
  writable: boolean;
  message?: string;
}

interface Injected {
  api: IApiClient;
  remote: ClientRemote;
  t: Translate;
}

type Props = SettingsSectionOwnerProps & Injected;

export function KolmoPdfSettingsSection({ api, remote, t }: Props) {
  const [state, setState] = useState<State>({ status: "loading", configured: false, writable: false });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

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

  useEffect(() => { void load(); }, [load]);
  useEffect(() => remote.$on("credentials/updated", () => { void load(); }), [load, remote]);

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
    actions: { display: "flex", gap: 10, flexWrap: "wrap" as const } as const,
    message: { margin: 0, color: "var(--dsw-color-text-secondary, #666)" } as const,
  };

  if (state.status === "loading") return <p>{t("loading")}</p>;

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
