# Changelog

All notable changes to `@kolmopdf/dsh-kolmopdf` are documented here.

## [Unreleased]

## [1.1.0] - 2026-11-13

### Changed

- **DeepSeek Harness 0.2.x compatibility (`>=0.2.0-rc.1 <0.3.0`)**:
  - Removed the deprecated named import `installSettingsSection` / `settingsNamespace` from `@deepseek-ai/dsh-settings` and switched to optional `ctx.inject(["settings"], ...)` calling `settings.configure({ auto: false }, ctx.fiber)`.
  - Updated the browser settings bundle (`src/client.tsx` and `dsh.client`) to use `@deepseek-ai/dsh-api-remotes` (`ctx.remote.credentials.describe/set/unset` with `RemoteResult`), aligned externals with `PLATFORM_MODULES`, and removed the removed `@deepseek-ai/dsh-client-runtime` dependency.
  - Updated the CLI (`src/cli.ts`) to manage `KOLMOPDF_API_KEY` directly in `$DSH_HOME/.credentials.yaml` (`version: 1`, `refs`), matching `dsh-credentials-local` instead of the removed `settings.yaml`.
  - Updated account/top-up references from Plus/Pro-only & `/subscription` to all account tiers & `/credits`.
- **Plugin Marketplace & Store Discovery**:
  - Declared `engines.dsh` and `dsh.manifestVersion: 1` required by the DSH Format-1 plugin market index specification.
  - Added official plugin icon (`assets/icon.png`, exported at `./icon`) and 8-language `locale/*.json` metadata (`en`, `zh`, `ja`, `es`, `fr`, `de`, `ru`, `pt`).
  - Expanded package `description`, `keywords`, `homepage`, and English/Chinese documentation for marketplace search and SEO.

## [1.0.4] - 2026-09-16

### Changed

- Corrected repository-local development paths in the English and Chinese documentation.
- Made the host composition test portable through `DSH_ROOT` and repository-relative plugin loading.
- Added the changelog to the published package metadata.

### Content

- KolmoPDF tools and runtime behavior are unchanged.

Earlier releases are available in the [GitHub release history](https://github.com/komoai2026/dsh-kolmopdf/releases).
