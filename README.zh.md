# KolmoPDF for DeepSeek Harness（`@kolmopdf/dsh-kolmopdf`）

<p align="left">
  <img src="assets/icon.png" width="64" height="64" alt="KolmoPDF 图标" />
</p>

[English](README.md) | 中文

[![npm](https://img.shields.io/npm/v/@kolmopdf/dsh-kolmopdf)](https://www.npmjs.com/package/@kolmopdf/dsh-kolmopdf)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）官方 **KolmoPDF** 插件：提供高保真 **PDF → Markdown / OCR**（保留数学公式、表格、多栏排版与图片）、**保留原版式的 PDF 翻译**（纯译文或双栏对照 PDF）、**Markdown 导出为 Word (DOCX)、PDF、HTML 和 LaTeX**、费用预估及余额查询。

- 官网：<https://www.kolmopdf.com>
- 创建 API Key：<https://www.kolmopdf.com/api-keys>
- 仓库：<https://github.com/komoai2026/dsh-kolmopdf>

## 功能列表

| Tool | 能力 |
| --- | --- |
| `kolmopdf_parse_pdf` | PDF → Markdown / OCR（保留公式、表格、分栏与图片），支持边解析边翻译及 `outline`/`summary` 侧边增强 |
| `kolmopdf_translate_pdf` | 保留原版式 PDF 翻译（纯译文或双栏对照 PDF，可选图片/表格内文字翻译） |
| `kolmopdf_convert_markdown` | 将 `.md` / `.markdown` / `.zip`（含图片）转换为 DOCX、HTML、PDF 或 LaTeX |
| `kolmopdf_estimate_cost` | 本地统计页数并结合账户余额估算 credits（不扣费） |
| `kolmopdf_check_balance` | 查询当前 API Key 对应的积分余额 |
| `kolmopdf_get_task_status` | 根据 `task_id` 查询任务状态与结果元数据 |

### 内置 Web GUI 集成

- 独立 **Settings → KolmoPDF** 设置页：安全保存/清除 API Key（写入 `$DSH_HOME/.credentials.yaml` 的 `KOLMOPDF_API_KEY`，不会明文出现在设置 describe 响应中）。
- **实时积分**卡片与**任务总览**列表（每 30 秒 / 10 秒自动刷新，支持手动刷新与清除记录；任务历史保存在 `$DSH_HOME/kolmopdf/tasks.json`，最多保留最近 200 条）。
- 惰性鉴权检查：未配置 Key 不会阻碍插件启动，调用 Tool 时给出明确配置指引。
- 支持通过进程环境变量 `KOLMOPDF_API_KEY` 覆盖。
- 文件上传、状态轮询、结果下载与 ZIP 解压均完整响应 Tool 取消信号。

## 环境要求

- Node.js >= 20
- DeepSeek Harness `>=0.2.0-rc.1 <0.3.0`（支持 `dsh.bundle` 与 `dsh.client`）
- 在 <https://www.kolmopdf.com/api-keys> 创建 API Key（支持 Free / PAYG / Go / Plus / Pro 全类型账户；Web、API 与 DSH 共用账户积分）

## 安装

### 方式一：npm / CLI 安装（推荐）

```bash
dsh plugin --profile web add @kolmopdf/dsh-kolmopdf
```

重启 profile（`dsh web`）或等待 HMR 热重载即可生效。

### 方式二：桌面端 / 插件市场一键安装

- **DSH Desktop / dsh-market**：在插件市场搜索 `kolmopdf` 或 `@kolmopdf/dsh-kolmopdf` 一键安装。
- **DSH 原生 Discover（`0.2.1+`）**：在实验插件中开启 **自定义插件索引（Custom plugin indexes）**，添加索引源（例如 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`），搜索 `kolmopdf` 即可安装。

### 方式三：从 GitHub 安装

```bash
dsh plugin --profile web add github:komoai2026/dsh-kolmopdf
```

仓库内置已构建好的 `lib/` 产物并声明了 `dsh.bundle`，安装时无需执行额外构建脚本即可自动挂载；`@deepseek-ai/dsh-tools` 等宿主包均声明为可选 `peerDependencies`，复用宿主实例不冲突。

## 配置 API Key

### 方法一：Web 设置页（推荐）

1. 打开 DeepSeek Harness Web / 桌面端界面。
2. 进入 **Settings → KolmoPDF**。
3. 填入从 <https://www.kolmopdf.com/api-keys> 获取的 API Key 并点击 **保存**。

### 方法二：CLI（与设置页共享 `.credentials.yaml`）

```bash
dsh plugin --profile web exec kolmopdf -- config set-key
```

命令通过 DSH 文件锁与原子写入（`0600`）将 `KOLMOPDF_API_KEY` 保存到 `$DSH_HOME/.credentials.yaml`（`version: 1` / `refs.KOLMOPDF_API_KEY`），运行中的 DSH 会自动热感知变更。

```bash
# 脚本 / CI 通过 stdin 写入
printf '%s' "$KOLMOPDF_API_KEY" | dsh plugin --profile web exec kolmopdf -- config set-key

# 查看配置状态（不会打印密钥）
dsh plugin --profile web exec kolmopdf -- config status

# 查看凭据文件路径
dsh plugin --profile web exec kolmopdf -- config path

# 清除已保存 Key
dsh plugin --profile web exec kolmopdf -- config clear-key
```

### 方法三：环境变量

```bash
export KOLMOPDF_API_KEY=sk-xxxxxxxxxxxxxxxx
dsh web
```

PowerShell：

```powershell
$env:KOLMOPDF_API_KEY = 'sk-xxxxxxxxxxxxxxxx'
dsh web
```

## 可选配置

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

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `apiKey` | 未设置 | Secret 覆盖项；推荐通过设置页或 CLI `.credentials.yaml` 管理 |
| `apiKeyEnv` | `KOLMOPDF_API_KEY` | 环境变量 / 凭据引用名 |
| `baseUrl` | `https://www.kolmopdf.com` | KolmoPDF API 地址 |
| `outputDir` | `./kolmopdf-output` | 结果输出目录（相对 DSH 工作目录） |
| `pollIntervalMs` | `2000` | 状态轮询间隔（毫秒） |
| `maxPollMinutes` | `30` | 最大轮询分钟数 |
| `httpTimeoutMs` | `60000` | 普通 HTTP 请求超时（毫秒） |
| `uploadTimeoutMs` | `600000` | 文件上传/结果下载超时（毫秒） |

## 开发与测试

```bash
corepack enable pnpm
pnpm install
pnpm check
pnpm test:host
pnpm test:client
```

## 安全说明

- 请勿将真实 API Key 提交至代码仓库、配置文件或 Issue。
- 凭据接口只返回是否已配置和是否可写，绝不回传密钥值。
- 输出路径通过 `realpath` 校验，`output_subdir` 及符号链接无法逃逸 `outputDir`。
- ZIP 解压严格拦截绝对路径与 `../` 路径穿越（上限 10,000 个条目、4 GiB 解压大小、2 GiB 下载大小）。
- 输入文件限制 300 MB 与 800 页，在本地预检后再上传。

## License

MIT
