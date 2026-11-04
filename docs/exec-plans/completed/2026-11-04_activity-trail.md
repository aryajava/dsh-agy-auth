# Antigravity activity trail: replace the nested cards with native chat rows

| Field | Value |
|---|---|
| Status | completed |
| Owner | agent |
| Date | 2026-11-04 |
| Related | [plugin guide](../../dsh-plugin.md), [activity store](../../../dsh-plugin/src/model/activity.js) |

## Objective

Make the per-turn Antigravity activity tail read as part of the chat transcript:
one quiet, collapsible disclosure trail of 24px rows that matches the Host's own
tool rows, with the real command output, file path, and memory text one click
away instead of always wrapped in three nested boxes.

## Context

`ActivityCards.tsx` rendered one bordered card per agy tool step inside the
Host's already-bordered turn frame, each with its own header strip, kind pill,
raw tool name, and always-visible body. Four defects drove the "looks weird"
report:

1. The file card reads `AbsolutePath`/`TargetFile`/`path`, but agy sends `Path`,
   so every file card rendered header-only.
2. agy's command envelope (`Command exited with code 0.\n\nCommand output:\n…`)
   was printed verbatim: leading blank lines produced a gap, and the card
   repeated its own chrome inside the body.
3. Every body used the code font, including prose memory results, at 12/18 with
   no hierarchy; three labels (`Command`, `run_command`, `$ …`) named one step.
4. Nested boxes plus always-expanded output make a 45-step turn unreadable and
   put a nested scroll area inside the chat scroll.

## Scope

### In scope

- `dsh-plugin/src/client/ActivityCards.tsx` — rewrite as a disclosure trail.
- `dsh-plugin/src/client/styles.ts` — replace the `.agy-activity*` block.
- `dsh-plugin/src/client/platform.d.ts` — declare the primitives now consumed.
- `dsh-plugin/src/client/i18n.tsx` — new English/Indonesian copy.
- `docs/dsh-plugin.md`, `dsh-plugin/README.md` — wording: cards → activity trail.

### Out of scope

- The `activity.json` store, the `/activity` route, and the model adapter.
- The accounts page (`page.tsx`, `AccountCard.tsx`).
- Regenerating the committed `demo-activity.png` screenshots.

## Expected paths

- `dsh-plugin/src/client/*`
- `docs/exec-plans/active/2026-11-04_activity-trail.md`

## Risks

- Host primitives (`DisclosureRow`, `TerminalBlock`) are declared locally in
  `platform.d.ts`; a signature drift would only show at runtime.
- Collapsing bodies by default hides text that was previously always visible.
- Recorded activity can predate this change, so old entries must not crash the
  new parsers (missing args, null output).

## Acceptance criteria

- [x] Each step is one 24px row: icon, verb, separator, summary, optional measure.
- [x] Rows expand on click and keyboard; failed steps show their failure.
- [x] Command rows parse agy's envelope into a native terminal card with the
      real exit code; output never starts with blank lines or "Command output:".
- [x] File rows show the path from `Path`, the full path and measure when expanded.
- [x] Memory/recall results render as prose, not code.
- [x] The whole group collapses from its header and reports step count and span.
- [x] English and Indonesian copy both exist for every new string.
- [x] Typecheck, tests, and build pass; the detector reports no new findings.

## Verification plan

```shell
npm --prefix dsh-plugin run typecheck
npm --prefix dsh-plugin test
npm --prefix dsh-plugin run build
```

Additional checks:

- Standalone render fixture at 744px and 358px column widths with recorded
  activity data (`_WIP/activity-fixture`, gitignored): collapsed rows, expanded
  terminal card, prose panel, failed edit, truncated command, and a collapsed
  12-step group.
- `impeccable detect --json` over the changed client files.

## Rollback

Single revert of the client files; the store and API are untouched.

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-11-04 | Rows, not cards | The Host already renders agy-free tool rows in the same transcript; a second card language reads as foreign. |
| 2026-11-04 | Collapsed by default, group open | Keeps a 45-step turn scannable without hiding evidence. |
| 2026-11-04 | No left accent, no per-row box | Border-left accents and nested cards are the category defaults the old design reached for. |
| 2026-11-04 | Host primitives, not local chrome | `DisclosureRow` and `TerminalBlock` are the same components the Host's own tool rows use, so hover, focus, ellipsis, and the expanded surfaces cannot drift from the transcript. |
| 2026-11-04 | Prose results are sans, not mono | A memory recall is reading material; the code font made eight lines of Indonesian prose a wall. |
| 2026-11-04 | Truncated commands drop the terminal body | The card's own empty state said "No output" directly above the notice naming the spilled file. |

## Completion

- Commit/tag: not committed (working tree only; awaiting review).
- Verification result: `typecheck`, `test` (57 passing), and `build` pass. The
  detector's single finding is the pre-existing quota-bar `transition: width`
  in `styles.ts`, untouched by this change.
- Residual risk: the browser half has no unit-test harness, so the envelope
  parser and row classification are covered by the render fixture and type
  check only. `dsh-plugin/demo-activity.png` still shows the previous card
  layout and needs one capture from a live, authenticated GUI.
