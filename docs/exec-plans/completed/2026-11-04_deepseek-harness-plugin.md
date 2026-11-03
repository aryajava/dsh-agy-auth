# DeepSeek Harness plugin with Web UI

| Field | Value |
|---|---|
| Status | completed |
| Owner | agent |
| Date | 2026-11-04 |
| Related | [ADR-0003](../../adr/0003-deepseek-harness-plugin.md), [README](../../README.md) |

## Objective

Ship `agy-auth` as an installable DeepSeek Harness (DSH) plugin bundle: a Host half that exposes account and quota management as model tools and HTTP endpoints, and a browser half that renders an Antigravity accounts page (list, quota, switch, add, OAuth sign-in, alias, remove, rotate, storage health) inside the DSH Web GUI.

## Context

`agy-auth` is a Go CLI. DSH plugins are Cordis packages: a Node `apply(ctx)` that registers tools and routes, plus an optional browser bundle declared through `dsh.client`. The CLI already owns credential handling, OAuth, quota, and the JSON envelope (schema version 1), so the plugin wraps that contract instead of reimplementing credential code.

## Scope

### In scope

- `dsh-plugin/` npm package `@aryajava/dsh-agy-auth` with `dsh.bundle` + `dsh.client`.
- Host half: CLI runner (binary resolution, timeouts, JSON envelope), cached state service, tools, HTTP routes, OAuth login session.
- Browser half: sidebar panel entry and main page with account rows, quota, actions, dialogs.
- Build script, tests with a fake CLI, install/verification docs.
- Execution plan, ADR, README updates.

### Out of scope

- Changing the Go CLI, its storage, or its OAuth implementation.
- Desktop/Electron transport for the panel (the Web GUI is the target).
- Publishing to npm or the plugin market.

## Expected paths

Informational only; this is not enforced by a task controller.

- `dsh-plugin/package.json`, `dsh-plugin/cordis.patch.yml`, `dsh-plugin/build.mjs`
- `dsh-plugin/src/index.js` (Host)
- `dsh-plugin/src/client/**` (browser)
- `dsh-plugin/test/**`
- `docs/**, README.md`

## Risks

- DSH client-bundle format is not a published preset; the plugin reproduces the lazy-CJS factory itself. Mitigation: verify the served boot graph and the rendered page end to end.
- Windows npm shims cannot be spawned directly. Mitigation: resolve `.exe` first, unwrap `.cmd` launchers to their Node script, and never pass arguments through a shell.
- Quota lookups hit the network. Mitigation: cache `list --json` in the Host, force only on explicit refresh or mutations.
- OAuth login is interactive. Mitigation: keep the CLI process alive, capture its URL from stderr, accept the authorization code through the UI, and time the session out.

## Acceptance criteria

- [x] `dsh --profile <name> web` boots with the bundle installed and serves the panel.
- [x] Sidebar entry opens the Antigravity page; accounts, plan, 5-hour/weekly quota, resets, and active state render.
- [x] Switch, add, alias, remove, rotate, refresh, and clean work through the UI against a fake CLI.
- [x] Sign-in starts the CLI, shows the URL, accepts the code, and refreshes accounts.
- [x] Model tools return canonical JSON and readable text.
- [x] Host tests and client build/typecheck pass.

## Verification plan

```shell
cd dsh-plugin
npm install
npm run build
npm test
npm run typecheck
```

End-to-end: install the bundle into a temporary DSH profile (`DSH_HOME` beside the repo), boot `dsh --profile <name> web` on a spare port with a fake `agy-auth` executable, open the panel with a headless browser, and inspect the screenshot.

The Go harness (`make verify`) is not runnable in this environment because the Go toolchain is absent; record that as residual risk.

## Rollback

Remove the profile bundle or the `dsh-plugin/` directory. No credential or storage migration is performed by the plugin.

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-11-04 | Wrap the Go CLI subprocess instead of reimplementing credentials | Keeps the audited storage/OAuth path and the JSON contract as the single source of truth |
| 2026-11-04 | Use HTTP routes instead of generated Typert remotes | A package outside the DSH repository cannot run the Remote code generator; routes are the documented out-of-tree seam |
| 2026-11-04 | Reproduce the client bundle format with esbuild | The DSH `clientBundle` preset is repository-internal |

## Completion

- Commit/tag: not committed in this session (the user owns commits).
- Verification result:
  - `npm --prefix dsh-plugin run typecheck` passed.
  - `npm --prefix dsh-plugin test` passed 27/27 (command boundary, service, HTTP API, tools, Windows shim unwrap, OAuth session, `agyPath` validation).
  - `npm --prefix dsh-plugin run build` emitted `lib/client.js` and its source map.
  - `npm pack` produced a 10-file tarball; that tarball installed into a fresh Web profile, booted, served the client bundle, and rendered the page with three fake accounts.
  - Manual GUI checks against `test/fake-agy-auth.mjs`: load, switch, sign-in (URL + code), alias, remove, save current, clean preview, unavailable CLI state, and an 800px viewport.
  - Real installation: `agy-auth` 0.3.0 was installed, the running Web profile hot-loaded the plugin from a profile row, the client bundle route served the entry, the `agy_auth_*` tools registered live, and the page rendered the real stored account (Pro, 100% 5-hour/weekly) against the real keyring.
  - The Go harness (`make verify`) was not run because the Go toolchain is absent from this environment.
- Residual risk:
  - The live profile loads the plugin from an absolute checkout path, so moving or deleting `P:\\dsh-agy-auth\\dsh-plugin` breaks it until the row is repointed.
  - The authenticated page of the user's running GUI was not screenshotted (its launch token is process-local); the same row and real data were rendered on a second profile, and the live bundle route plus Host tools were verified.
  - The panel was verified in the Web GUI only; Desktop/Electron transport is out of scope.
  - The bundle build reproduces a DSH-internal preset; a future DSH bundle-format change requires a build update.