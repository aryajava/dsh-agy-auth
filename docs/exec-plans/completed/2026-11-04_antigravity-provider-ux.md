# Antigravity provider UX and reliability wave

| Field | Value |
|---|---|
| Status | completed |
| Owner | agent |
| Date | 2026-11-04 |
| Related | [ADR-0005](../../adr/0005-antigravity-provider-ux.md), [plugin guide](../../dsh-plugin.md) |

## Objective

Turn the working Antigravity model provider into a usable daily driver: family-grouped quota, model effort selection, tool activity cards, images, DSH goal/plan context, a configurable idle watchdog, Windows updater suppression, classified retries, a fallback catalog, hardened auxiliary calls, and English/Indonesian UI.

## Scope delivered

- Account page reads `agy-auth usage --all`, caches it for 60 seconds, and renders Gemini / Claude+GPT / Argon groups instead of hiding them behind two aggregate bars.
- Gemini effort entries are grouped into base models with a DSH reasoning selector. The selected effort runs the exact agy slug (`gemini-3.8-flash-low`); the base-slug + `--effort` path was measured at 82 s versus 8 s and is not used.
- Hidden-model config, bundled fallback catalog when `agy models` fails, and image input staging with repeatable `--add-dir`.
- DSH goal objective and plan-mode state are added to the agy prompt; runtime-context and system-reminder user messages are filtered out so they cannot replace the human request.
- Five-minute configurable idle watchdog; hard run timeout remains separate.
- Windows agy update timestamp refresh before spawn, with a unit test.
- Failure classification and a bounded DSH retry policy for network, timeout, empty, and server failures. Rate limits and auth failures are not silently retried.
- Auxiliary calls run in plan mode, use an 800K digest, and never bind the main conversation.
- Tool activity is recorded in `activity.json` and shown as native-style cards under the completed turn. The cards are plugin-rendered, not DSH tool-call blocks.
- English/Indonesian page copy with English as the default and an `EN/ID` header toggle persisted in `localStorage`.

## Acceptance

- [x] Quota groups visible per account (Gemini, Claude+GPT, Argon when present).
- [x] Gemini effort picker works; exact slug runs at normal speed.
- [x] Images are staged and authorized with `--add-dir`.
- [x] Goal/plan context is forwarded; runtime context is not treated as the user prompt.
- [x] Idle watchdog defaults to five minutes and is configurable.
- [x] Windows update timestamp refresh tested.
- [x] Error classification and retry policy tested.
- [x] Fallback catalog and effort grouping tested.
- [x] Auxiliary calls use plan mode and leave the main binding alone.
- [x] Activity cards render under a completed turn.
- [x] English default; Indonesian toggle verified.
- [x] Tests, typecheck, build, and package contents pass.

## Verification

- `npm --prefix dsh-plugin run typecheck`
- `npm --prefix dsh-plugin test` (57 tests)
- `npm --prefix dsh-plugin run build`
- `npm --prefix dsh-plugin pack --dry-run`
- Temporary DSH profile: grouped quota screenshot, EN/ID toggle, grouped effort picker, and a completed tool turn with activity cards (6m30s, 25.3K tokens, `AGY_CARD_OK`).
- Live Web profile: `agy_model_status` reports grouped models, idle 300000 ms, Windows suppression on, default effort medium.

## Follow-up bug fix

- The retry policy was initially returned as a raw config object with nested `backoff`; DSH stores the adapter value as an already-resolved policy. Its top-level delay fields were undefined, so the retry plugin produced a `NaN` `delayMs` and the durable `llm/retry` event failed JSON validation. The policy now carries top-level finite delay fields, and a regression test fails on the old shape.
- Capacity 503 is classified as `AGY_CAPACITY` (not retryable by DSH) and the adapter tries the next lower Gemini effort before failing. A fake-capacity integration test verifies high → medium fallback.
- Tool-output truncation now gets a prompt instruction to read agy's spilled file and a card note naming the full path.

## Residual risks

- Activity cards are a plugin activity surface, not DSH tool-call cards; they cannot be approved/denied as DSH tools.
- Image input is file-based; agy reads staged paths with its own tools.
- A tool-heavy agy turn can take several minutes even at Low; the idle watchdog is the safety valve.
- Base-slug effort is intentionally unused.
- Go repository gate was not run in this shell because `go`/`make` are unavailable; no Go files changed.