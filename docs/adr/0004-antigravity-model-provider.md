# ADR-0004: Antigravity model provider through the installed agy CLI

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decision makers:** fikrilal
- **Consulted:**
- **Related:** [`docs/exec-plans/completed/2026-11-04_antigravity-model-provider.md`](../exec-plans/completed/2026-11-04_antigravity-model-provider.md), [`docs/dsh-plugin.md`](../dsh-plugin.md), [ADR-0003](0003-deepseek-harness-plugin.md)

## Context

The DeepSeek Harness plugin initially managed Antigravity accounts only. The installed official `agy` CLI exposes a print mode with `--output-format stream-json`, `--model`, `--effort`, `--conversation`, and tool permissions. A model provider can therefore use the CLI as an agent backend without reimplementing Google OAuth or the Code Assist API. An existing third-party plugin, `dsh-agy-link`, implements a much larger version of this idea with an account pool, proxies, direct quota endpoints, and a plaintext primary-credential store. We need a smaller provider that fits this plugin's single-account model and keeps the credential in the CLI.

## Decision drivers

- Put Antigravity models in the normal DSH model selector.
- Reuse the installed, signed-in `agy` CLI; no token handling in the plugin.
- Keep one account owner: `agy-auth` switches the live credential; the model provider consumes it.
- Support thinking, tool activity, usage, and conversation continuity.
- Keep the main path clean: no pool, no automatic rotation by default, no proxies unless configured.

## Considered options

- **Option A: Extend this plugin with a plain-object LLM adapter** — accepted. The adapter implements `providerInfo`, `listModels`, `resolveModel`, `prepareCall`, and `stream` without importing DSH runtime packages, so the absolute-path profile row keeps loading.
- **Option B: Depend on `dsh-agy-link`** — rejected for this repo. It is a capable but heavy third-party plugin that owns the Windows credential slot, writes a plaintext primary credential, defaults to skip permissions, and offers an account pool/proxies that conflict with this plugin's account switcher.
- **Option C: Forward DSH tool definitions to agy** — rejected. agy has its own tool loop; mapping its tool calls to DSH tool calls would execute the wrong tools and bypass the intended split.

## Decision

Adopt Option A:

1. Register provider route `antigravity` with `ctx.llm.registerAdapter`.
2. Advertise every model from `agy models` in the DSH selector.
3. Run one `agy -p --output-format stream-json` process per model turn with `--model`, `--print-timeout`, `--disable-slash-commands`, and `--conversation` when a binding exists.
4. Map text, thinking, tool activity, usage, and finish reasons to DSH `StreamChunk` values. Tool activity is a reasoning annotation; agy tools are not DSH tool calls.
5. Default to `--dangerously-skip-permissions` as an explicit product choice. `plan` and `accept-edits` remain configurable.
6. Keep one account: use the live `agy` credential managed by `agy-auth`. No pool. `autoRotate` is opt-in, default off, warns loudly, and rotates only after a failed run.
7. Persist DSH-session to agy-conversation bindings in a `0600` state file; never store prompts or credentials.

## Consequences

- **Good:** Antigravity models appear in the standard selector; no OAuth code; single credential owner; session continuity; usage/thinking/tool activity visible.
- **Neutral:** Each turn is a full agent run (about 14k input tokens; seconds to minutes), not a cheap completion. Text-only.
- **Bad:** agy's tools run outside DSH approvals and sandboxing; DSH tool calls are not available to the model. Automatic rotation is dangerous and must stay opt-in.

## Confirmation

- Unit tests for stream parsing, usage, prompt binding, sessions, and the adapter.
- Real `agy` run through the adapter (text, usage, conversation binding).
- Model picker and a full prompt through the DSH Web GUI on a temporary profile.
