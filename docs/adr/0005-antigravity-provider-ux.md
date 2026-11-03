# ADR-0005: Antigravity provider UX and reliability decisions

- **Status:** Accepted
- **Date:** 2026-11-04
- **Related:** [ADR-0004](0004-antigravity-model-provider.md), [UX plan](../exec-plans/completed/2026-11-04_antigravity-provider-ux.md)

## Context

The first provider release proved text, usage, and conversation binding. Daily use exposed missing model-family quota, an opaque effort mapping, no image path, no DSH goal/plan context, a fixed hard timeout, Windows updater console flashes, generic errors, an empty model picker when `agy models` failed, unhardened auxiliary calls, and an English-only page. The account page also showed only aggregate 5-hour/weekly bars even though `agy-auth usage --all` already reports the exact Gemini, Claude+GPT, and Argon buckets.

## Decisions

1. **Quota comes from `agy-auth usage --all`**, cached for 60 seconds in the Host. The page renders one section per model family; the aggregate `list` bars remain the fallback.
2. **Gemini efforts use exact suffixed slugs.** The picker groups `gemini-3.8-flash-low/medium/high` into `gemini-3.8-flash` with an effort selector, then runs the matching exact slug. Base slug plus `--effort` measured 82 seconds versus 8 seconds and is rejected.
3. **Images are staged as files**, referenced by absolute path, and authorized with repeatable `--add-dir`. The provider advertises image input but does not claim a native image wire block.
4. **Tool activity is a plugin-rendered card surface.** agy still owns its tools; the model stream keeps reasoning annotations; activity is recorded in a 0600 `activity.json` and rendered under the completed turn. It is deliberately not a DSH tool-call block because DSH would try to execute it.
5. **DSH goal and plan-mode state are prepended to the agy prompt.** Runtime-context and system-reminder user messages are filtered out; they are harness metadata, not the human request.
6. **The idle watchdog is separate from the hard run timeout.** Default five minutes of stream silence; configurable.
7. **Windows updater suppression refreshes agy's timestamp before each spawn.** The visible updater child is prevented; manual `agy update` still works.
8. **Capacity errors downgrade effort; other errors are classified and only transient classes are retried.** Network, timeout, empty, and server failures use bounded backoff; auth, eligibility, tool, and rate-limit failures do not. Auto-rotation stays opt-in.
9. **Auxiliary calls run in plan mode**, use an 800K digest, and never touch the main conversation binding.
10. **The page is English/Indonesian with English default.** The toggle is page-local and persisted; host error text may remain in its source language.

## Consequences

- Better daily usability and diagnosability without taking over credentials or adding an account pool.
- Effort grouping changes the model picker entries and keeps the exact fast slugs.
- Activity cards are visually native but not DSH tool-call records; this limitation is documented.
- Image support is file-based vision, not a provider image block.
- A tool-heavy agy run can still take minutes; the idle watchdog may need tuning.