# KolmoPDF for DeepSeek Harness (`@kolmopdf/dsh-kolmopdf`)

<p align="left">
  <img src="assets/icon.png" width="64" height="64" alt="KolmoPDF icon" />
</p>

English | [中文](README.zh.md)

[![npm](https://img.shields.io/npm/v/@kolmopdf/dsh-kolmopdf)](https://www.npmjs.com/package/@kolmopdf/dsh-kolmopdf)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Official **KolmoPDF** plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`): high-fidelity **PDF → Markdown / OCR** (preserving formulas, tables, columns, and images), **layout-preserving PDF translation** (translated-only or side-by-side bilingual PDF), **Markdown export to Word (DOCX), PDF, HTML, and LaTeX**, credit cost estimation, and balance checks.

- Website: <https://www.kolmopdf.com>
- API Keys: <https://www.kolmopdf.com/api-keys>
- Repository: <https://github.com/komoai2026/dsh-kolmopdf>

## Tools

| Tool | Capability |
| --- | --- |
| `kolmopdf_parse_pdf` | PDF → Markdown / OCR with formulas, tables, multi-column layout, images, optional translation, and enrichment sidecars (`outline`, `summary`) |
| `kolmopdf_translate_pdf` | Layout-preserving PDF translation (`translated_only` or `side_by_side` bilingual PDF, with optional image/table translation) |
| `kolmopdf_convert_markdown` | Convert `.md` / `.markdown` / `.zip` (with images) → DOCX, HTML, PDF, or LaTeX |
| `kolmopdf_estimate_cost` | Local PDF page-count + balance estimate before running a job (does not spend credits) |
| `kolmopdf_check_balance` | Query current credit balance for the configured API key |
| `kolmopdf_get_task_status` | Inspect an existing KolmoPDF task by `task_id` |

### Built-in Web GUI Integration

- Dedicated **Settings → KolmoPDF** page with secure API key management (stored in `$DSH_HOME/.credentials.yaml` under `KOLMOPDF_API_KEY`; never exposed in settings describe payloads).
- **Live credits** card and **Task overview** list (auto-refreshes every 30 s / 10 s, manual refresh & clear log; local history stored in `$DSH_HOME/kolmopdf/tasks.json`, newest 200 tasks).
- Lazy credential checks: missing keys never crash startup; tool calls return actionable setup instructions.
- `KOLMOPDF_API_KEY` in the process environment is also supported (read-only on the Settings page when present).
- Upload, polling, download, and ZIP extraction all respect tool abort signals.

## Requirements

- Node.js >= 20
- DeepSeek Harness `>=0.2.0-rc.1 <0.3.0` (`dsh.bundle` + `dsh.client` lazy-CJS format)
- A KolmoPDF API key from <https://www.kolmopdf.com/api-keys> (Free, PAYG, Go, Plus, and Pro accounts all supported; Web, API, and DSH share the same credits)

## Install

### Option 1: npm / CLI (Recommended)

```bash
dsh plugin --profile web add @kolmopdf/dsh-kolmopdf
```

Restart the profile (`dsh web`) or let HMR apply if enabled.

### Option 2: DSH Desktop / Plugin Market

- **DSH Desktop** / **dsh-market**: Search for `kolmopdf` or `@kolmopdf/dsh-kolmopdf` in **Plugins** and click **Install**.
- **DSH Built-in Discover (`0.2.1+`)**: Enable **Custom plugin indexes** under Experimental plugins, add an index source (such as `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`), search `kolmopdf`, and install.

### Option 3: From GitHub

```bash
dsh plugin --profile web add github:komoai2026/dsh-kolmopdf
```

This repository ships prebuilt `lib/` artifacts and declares `dsh.bundle`, so `dsh plugin add` appends `@kolmopdf/dsh-kolmopdf` to `dsh.profile.bundles` automatically without running build scripts. Host packages (`@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-settings`, etc.) are declared as optional `peerDependencies` so they always resolve to the running Harness instance.

## Configure the API Key

### Option 1: Web Settings (Recommended)

1. Open DeepSeek Harness Web / Desktop GUI.
2. Go to **Settings → KolmoPDF**.
3. Enter your API key from <https://www.kolmopdf.com/api-keys> and click **Save**.

### Option 2: CLI

```bash
dsh plugin --profile web exec kolmopdf -- config set-key
```

This stores `KOLMOPDF_API_KEY` inside `$DSH_HOME/.credentials.yaml` (`version: 1`, `refs.KOLMOPDF_API_KEY`) using DSH's file lock and atomic write (`0600`), so a running DSH picks up the change automatically.

```bash
# Pipe from stdin in scripts/CI
printf '%s' "$KOLMOPDF_API_KEY" | dsh plugin --profile web exec kolmopdf -- config set-key

# Check status (never prints the secret)
dsh plugin --profile web exec kolmopdf -- config status

# Print the credentials file path
dsh plugin --profile web exec kolmopdf -- config path

# Remove the stored key
dsh plugin --profile web exec kolmopdf -- config clear-key
```

### Option 3: Environment Variable

```bash
export KOLMOPDF_API_KEY=sk-xxxxxxxxxxxxxxxx
dsh web
```

PowerShell:

```powershell
$env:KOLMOPDF_API_KEY = 'sk-xxxxxxxxxxxxxxxx'
dsh web
```

## Optional Composition Config

```yaml
- insert:
    - id: kolmopdf
      name: '@kolmopdf/dsh-kolmopdf'
      config:
        outputDir: ./kolmopdf-output
        pollIntervalMs: 2000
        maxPollMinutes: 30
        httpTimeoutMs: 60000
        uploadTimeoutMs: 600000
```

| Field | Default | Notes |
| --- | --- | --- |
| `apiKey` | unset | Secret override; prefer Settings GUI or CLI `.credentials.yaml` |
| `apiKeyEnv` | `KOLMOPDF_API_KEY` | Credential reference / environment variable name |
| `baseUrl` | `https://www.kolmopdf.com` | KolmoPDF API origin |
| `outputDir` | `./kolmopdf-output` | Result output directory (relative to DSH cwd) |
| `pollIntervalMs` | `2000` | Task status polling interval |
| `maxPollMinutes` | `30` | Maximum polling duration |
| `httpTimeoutMs` | `60000` | Standard HTTP timeout |
| `uploadTimeoutMs` | `600000` | File upload / result download timeout |

## Development

```bash
corepack enable pnpm
pnpm install
pnpm check
pnpm test:host
pnpm test:client
```

## Security

- Never commit real API keys into repositories, configs, or issues.
- The credentials API only reports `configured` / `writable` state, never the secret value.
- Output paths are validated with `realpath` so `output_subdir` and symlinks cannot escape `outputDir`.
- ZIP extraction rejects absolute paths and `../` entries (capped at 10,000 entries, 4 GiB uncompressed, 2 GiB download).
- Inputs are capped at 300 MB and 800 pages and validated locally before upload.

## License

MIT
