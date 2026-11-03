# ADR-0003: DeepSeek Harness plugin bundle

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decision makers:** fikrilal
- **Consulted:**
- **Related:** [`docs/exec-plans/completed/2026-11-04_deepseek-harness-plugin.md`](../exec-plans/completed/2026-11-04_deepseek-harness-plugin.md)

## Context

`agy-auth` is a Go CLI that owns credential storage, the OS keyring, OAuth sign-in, quota lookups, and the versioned JSON envelope. DeepSeek Harness (DSH) exposes a Cordis plugin system with a browser half for the Web GUI. Users want to manage Antigravity accounts without leaving the Harness GUI.

## Decision drivers

- Reuse the audited credential path instead of duplicating keyring and OAuth code in JavaScript.
- Keep the Go CLI usable and unchanged.
- Ship a first-class Harness experience: model tools plus a real GUI page.
- Keep the plugin installable outside the DSH repository.

## Considered options

- **Option A: Reimplement credential handling in TypeScript** — rejected: duplicates the security-critical path, splits the storage contract, and multiplies platform keyring code.
- **Option B: Wrap the CLI with a DSH plugin bundle** — accepted: the Host half spawns `agy-auth --json`, the browser half calls Host HTTP routes, and the JSON envelope stays the only contract.
- **Option C: Generate Typert Remote bindings for the Host service** — rejected for an out-of-tree package: the generator and the `clientBundle` preset are repository-internal, so a third-party package must reproduce the build and would depend on unpublished codegen.

## Decision

Adopt **Option B**:
1. The plugin lives in `dsh-plugin/` as npm package `@aryajava/dsh-agy-auth` and declares both `dsh.bundle` and `dsh.client`.
2. The Host half owns a `AgyAuthService` that resolves the CLI binary, runs `agy-auth --json` with timeouts, validates the envelope, caches list state, and manages one interactive OAuth login session.
3. The browser half registers `sidebar.panellist` and `main` slots and talks to the Host over same-origin `/agy-auth/api` routes guarded by the connection trust fence.
4. The browser bundle is produced by `build.mjs` in the DSH lazy-CJS factory format, with React and `@deepseek-ai/dsh-client-ui-primitives` as platform externals.

## Consequences

- **Good:** No credential code duplication; the CLI remains the single source of truth; the plugin only needs Node.
- **Neutral:** The panel requires the Web GUI and a reachable CLI binary; the Host process must be able to run the same user's keyring context.
- **Bad:** The bundle build is maintained by this repository rather than by the DSH preset; a DSH bundle-format change requires a build update.

## Confirmation

- Host unit tests against a fake CLI process.
- Client build and typecheck in `dsh-plugin/`.
- End-to-end boot of a temporary DSH profile with the panel rendered in a headless browser.
