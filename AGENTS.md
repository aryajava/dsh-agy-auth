# AGENTS.md

`agy-auth` is a Go CLI that manages multiple Google Antigravity CLI (`agy`) accounts by snapshotting the single credential agy stores in the OS keyring/file and swapping it. It also ships as an npm package with prebuilt binaries and as a DeepSeek Harness plugin (`dsh-plugin/`) with a Web GUI page and model tools.

## Read order

1. `README.md` — user-facing behavior.
2. `docs/README.md` — documentation index.
3. `docs/harness.md` — repository guardrails, profiles, contracts, hooks.
4. `docs/engineering/agent-workflow.md` — planning, verification, and commit workflow.
5. `docs/internals.md` — credential storage, registry, switching, OAuth.
6. `internal/agy` — credential JSON and keyring/file backend.
7. `internal/registry` — snapshots, IDs, aliases, queries.
8. `internal/oauth` — PKCE login and client discovery.
9. `internal/cli` — commands, picker, rendering.
10. `dsh-plugin/README.md` and `docs/dsh-plugin.md` — Harness bundle, Host/browser split, UI, tools.

## Harness

- Default local gate: `make verify` (`harness verify --profile fast`).
- Non-trivial changes: `make verify-full`.
- CI runs `make verify-ci`; do not duplicate its step list.
- No skip flags. Do not claim a check passed unless it ran.
- If the same failure or review comment repeats, add a lint/contract/regression test and update `docs/harness.md`.
- `make hooks` installs the pre-commit and commit-msg hooks.
- Production packages must not import `internal/harness`.
- For non-trivial work, write an execution plan under `docs/exec-plans/active/` using the template; move it to `completed/` when done.
- Execution plans are review artifacts, not loop-engineering authority. There is no task controller, path enforcement, repair loop, or handoff automation.

## Decisions

- Add an ADR under `docs/adr/` when a decision changes architecture, credential handling, public CLI behavior, CI, or release.
- Do not rewrite accepted ADRs; add a new one and mark the old one superseded.

## Invariants

- agy keyring item: service `gemini`, account `antigravity`.
- File fallback: `~/.gemini/antigravity-cli/antigravity-oauth-token`.
- Credential JSON: `token{access_token,token_type,refresh_token,expiry}`, `auth_method`, `id_token`. Preserve unknown fields by writing snapshots raw.
- Registry: `~/.config/agy-auth/registry.json` plus `accounts/<id>.json`; directories `0700`, files `0600`.
- Backups: `~/.config/agy-auth/backups/active-<timestamp>.json` and `registry-<timestamp>.json`; `0600` files in a `0700` directory, keep 5 of each.
- Back up the live credential before replacing or deleting it and the registry before changing it. `clean` only removes managed backup names or orphan snapshots; it must preserve snapshots when `registry.json` is missing.
- Account IDs are a stable hash of the Google `sub` claim; fall back to the refresh-token fingerprint.
- Never commit the Antigravity OAuth client ID or secret. Only SHA-256 fingerprints live in `internal/oauth/oauth.go`.
- Never log or print tokens or the OAuth client secret.
- Writes must be atomic (temp file + rename). Tests must never touch the real keyring.
- The Harness plugin never reads, logs, or returns credential values; it passes argv arrays to the CLI and exposes only account metadata and the OAuth URL to the page.

## Build and test

```shell
make build
make verify
make verify-full
make verify-ci
AGY_AUTH_KEYRING_TEST=1 go test ./internal/agy -run TestKeyringRoundTrip -v
make npm-build
make npm-pack
```

Use a temporary `AGY_AUTH_HOME` and `AGY_AUTH_STORAGE=file` for manual CLI testing.

The Go harness does not cover the Harness plugin. Its own gate:

```shell
npm --prefix dsh-plugin install
npm --prefix dsh-plugin run typecheck
npm --prefix dsh-plugin test
npm --prefix dsh-plugin run build
```

Run both when the CLI JSON contract and the plugin change together.

## Adding or changing commands

1. Add the command in `internal/cli/cmd_*.go`.
2. Register it in `Run` in `internal/cli/app.go`.
3. Add a `CommandSpec` in `internal/cli/spec.go` (help is generated from it).
4. Support `--json` when the output is machine-readable.
5. Add tests in the same package (see `internal/cli/cli_test.go`).

## Storage changes

`internal/agy/storage.go` is the only place that talks to the keyring/file backend. Keep the current behavior: reads try the keyring first, then the file; writes go to both when available.

## OAuth changes

- Direct login uses PKCE `S256` and the public Antigravity client discovered from the installed `agy` binary.
- If Google rotates the client, update the fingerprint constants. See `docs/internals.md` → "Updating OAuth client fingerprints".
- `--via-agy` is the fallback that drives agy's own sign-in.

## DeepSeek Harness plugin

`dsh-plugin/` is the npm package `@aryajava/dsh-agy-auth` that exposes the CLI in the DeepSeek Harness Web GUI. Read [the plugin guide](docs/dsh-plugin.md) and [the package README](dsh-plugin/README.md) before changing it.

- The Host half (`dsh-plugin/src/index.js`, `command.js`, `service.js`, `tools.js`) is the only place that spawns `agy-auth`; it uses argv arrays, never a shell, keeps one login process, and bounds every capture.
- The model provider (`dsh-plugin/src/model/`) registers the `antigravity` route through `ctx.llm.registerAdapter` and spawns `agy -p --output-format stream-json` directly. It must stay import-free of DSH runtime packages (a plain adapter object) so the out-of-tree row keeps loading.
- Model permission defaults to `--dangerously-skip-permissions` by explicit product decision. agy tools are not DSH tool calls and cannot be gated by DSH approvals; keep the warning in docs/status and never present the provider as a DSH tool-calling model.
- agy tool activity is mapped to reasoning annotations, never to DSH `tool-call` chunks (DSH would try to execute them). DSH tool definitions are not forwarded to agy.
- The model provider is single-account and uses the live agy credential. Do not add account pooling or automatic rotation to the main path; `model.autoRotate` stays opt-in, default off, with a loud warning.
- Session bindings live in a `0600` JSON state file and contain only DSH-session to agy-conversation ids. Never write prompts, tokens, or credentials there.
- Model tests live in `test/model-*.test.mjs` and use `test/fake-agy-stream.mjs`; keep them covering stream-json parsing, usage, tool annotations, session binding, and the adapter contract.
- Gemini effort selection must run the exact suffixed agy slug (`gemini-3.8-flash-low`), not a base slug plus `--effort`; the measured base+effort path was much slower. Claude/GPT slugs stay verbatim.
- Tool activity for the chat cards is stored in `activity.json` beside the model state file (`0600`). It may contain tool arguments/outputs, never OAuth tokens or the prompt; do not widen it to credentials.
- Images are staged as files and authorized with repeatable `--add-dir`; the provider advertises image input but does not send a native image wire block.
- The model page UI is English/Indonesian with English as the default; new strings go through the page i18n dictionary, not hard-coded English.
- Idle is a five-minute configurable watchdog; auxiliary calls use plan mode and must not bind the main conversation.
- Capacity 503 (`AGY_CAPACITY`) must downgrade the same Gemini family (high → medium → low) before failing and must not enter the DSH retry loop. Tool-output truncation must instruct agy to read the spilled file and expose its path in the card.
- The browser half (`dsh-plugin/src/client/`) talks to the Host only through same-origin `/agy-auth/api` routes and never receives a token.
- Never reimplement credential storage, OAuth, or quota in the plugin; extend the CLI and its JSON envelope instead.
- Routes must call `ctx.connection.requestRejection` first, cap request bodies, and require `application/json` for writes.
- Rebuild the browser bundle (`npm run build` in `dsh-plugin`) after changing `src/client/`; the Host serves `lib/client.js`, not sources. `lib/` is generated and not committed.
- Tests and manual GUI checks use `test/fake-agy-auth.mjs`; keep it speaking the real versioned JSON envelope.
- The plugin is Web-GUI only (`dsh.client.platform: "web"`) and must not assume a Desktop/Electron transport.

## Versioning and release

- `package.json` is the version source. `scripts/build-npm.mjs` injects it into the Go binary with ldflags.
- See `docs/release.md`.
- The release workflow runs `harness verify --profile ci`.
- A `vX.Y.Z` tag builds all six binaries, publishes npm when `NPM_TOKEN` is set, and creates a GitHub release.

## Git

- Use Conventional Commits: `type(scope): summary`, for example `feat(harness): add verification profiles`. Scopes are lowercase. The `commit-msg` hook enforces this.
- The user is the only author. Never add `Co-authored-by` trailers, bot attributions, or `CommandCodeBot` lines to commits.
- Only commit when asked.