# Architecture decision records

ADRs capture decisions that outlive a single change: architecture, security, public behavior, or a durable process. They explain **why**, not just what.

## When to add one

- The decision changes a baseline architecture or dependency direction.
- The decision changes credential handling, storage, public CLI behavior, CI, or release.
- A future maintainer would otherwise ask "why is it done this way?"
- An execution plan reveals a decision worth preserving.

Do not rewrite accepted ADRs. Add a new ADR and mark the old one superseded.

## Naming

```text
NNNN-short-title.md
```

Use the next number. Statuses: `Proposed`, `Accepted`, `Superseded`, `Deprecated`.

## Index

| ADR | Status | Decision |
|---|---|---|
| [0001](0001-repository-harness.md) | Accepted | Adopt a repository harness with mechanical guardrails, without loop engineering |
| [0002](0002-antigravity-desktop-support.md) | Accepted | Support Antigravity Desktop profiles alongside CLI with default dual-target switching and --relaunch |
| [0003](0003-deepseek-harness-plugin.md) | Accepted | Ship a DeepSeek Harness plugin bundle that wraps the CLI and provides a Web GUI page |
| [0004](0004-antigravity-model-provider.md) | Accepted | Register the installed agy CLI as the `antigravity` DSH model provider with stream-json mapping and single-account credentials |
| [0005](0005-antigravity-provider-ux.md) | Accepted | Family-grouped quota, exact-slug efforts, file-based images, plugin activity cards, idle/update/retry hardening, and EN/ID copy |

## Template

Use [_template.md](_template.md).

## Related

- [Engineering guides](../engineering/README.md)
- [Execution plans](../exec-plans/README.md)
- [Harness](../harness.md)