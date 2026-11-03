# Antigravity model provider

| Field | Value |
|---|---|
| Status | completed |
| Owner | agent |
| Date | 2026-11-04 |
| Related | [ADR-0004](../../adr/0004-antigravity-model-provider.md), [plugin guide](../../dsh-plugin.md) |

## Objective

Register the installed `agy` CLI as the `antigravity` DSH model provider in the existing plugin, with stream-json mapping, session binding, default skip permissions, optional proxy, and opt-in auto-rotation.

## Context

The account page already wraps the `agy-auth` CLI. The official `agy` CLI exposes print mode with stream-json and model selection, so DSH can use Antigravity models without a new OAuth/token path. The provider must coexist with the account switcher: one live credential, no pool.

## Scope

### In scope

- `dsh-plugin/src/model/`: config, events, catalog, prompt, sessions, adapter.
- `ctx.llm.registerAdapter(['antigravity'])` in `src/index.js`.
- Model picker catalog from `agy models`.
- Stream mapping: text, thinking, tool annotations, usage, finish, conversation binding.
- Default `--dangerously-skip-permissions`; configurable `plan`/`accept-edits`.
- Optional proxy and opt-in `autoRotate` with a loud warning.
- `agy_model_status` tool, tests, docs, ADR.

### Out of scope

- Account pool, per-account HOME/keyring, automatic rotation by default.
- DSH tool forwarding into agy (agy uses its own tools).
- Image/file input, direct Google REST APIs, plugin marketplace.

## Acceptance criteria

- [x] Model selector shows Google Antigravity models from `agy models`.
- [x] A full DSH prompt through the provider returns the expected text and usage.
- [x] Thinking/tool activity/usage map into stream chunks.
- [x] Session binding uses `--conversation` across turns.
- [x] Default permission runs agy with `--dangerously-skip-permissions`.
- [x] Proxy config is optional; auto-rotation is off by default and warns when enabled.
- [x] Tests, typecheck, and build pass.

## Verification

- `npm --prefix dsh-plugin run typecheck`
- `npm --prefix dsh-plugin test` (56 tests)
- `npm --prefix dsh-plugin run build`
- Real adapter: text/usage/conversation binding against `agy` 1.4.12.
- Temporary DSH profile: model picker screenshot and a full prompt returning `AGY_DSH_OK`.
- Live Web profile after HMR reload: `agy_model_status` reports 13 models, permission `skip`, default `gemini-3.8-flash-medium`; the model picker is available to the user.

## Risks

- agy tools bypass DSH approvals by design in `skip` mode.
- Each call pays the agy agent context (~14k input tokens); High is slow.
- The adapter lives outside the DSH repo and must remain free of DSH runtime imports.
- Live profile hot reload depends on HMR source watching; a restart always loads the current source.

## Rollback

Set `model.enabled: false` or remove the model modules/registration. Account management is unaffected.

## Completion

- Commit/tag: not committed (user owns commits).
- Verification result: 44/44 tests passed at the first completion; the later UX wave raises the suite to 56/56. Real agy runs returned text/usage and continued the bound conversation; temporary DSH profile showed Google Antigravity models and completed a prompt in 7 s with 13K tokens; the live Web profile registered the provider.
- Residual risk: permission skip is intentional; tool activity is annotations, not DSH tool calls; live source reload needs HMR or restart.