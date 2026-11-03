# Development

This page is for building `agy-auth` from source and working on the repository. Consumer installation is covered in the [README](../README.md).

## Setup

- Go 1.24+
- Node.js 18+ for the npm shim/package
- Antigravity CLI installed for manual testing

```shell
git clone https://github.com/fikrilal/agy-auth.git
cd agy-auth
make verify
make build
```

## Install from source

```shell
make install          # installs ~/.local/bin/agy-auth
# or
make build            # builds ./bin/agy-auth
```

To install the local package through npm:

```shell
make npm-build
npm install -g .
```

The Go-only alternative:

```shell
go install github.com/fikrilal/agy-auth/cmd/agy-auth@latest
```

Make sure `$(go env GOPATH)/bin` is on your `PATH`.

## Verification

The repository harness is the canonical gate:

```shell
make verify       # fast: static checks, contracts, build, short tests
make verify-full  # race tests + current-target npm packaging
make verify-ci    # CI parity: fresh race tests + all-target npm packaging
make hooks        # opt-in pre-commit and commit-msg hooks
```

`make verify` is enough for most changes. See [docs/harness.md](harness.md) for the rules, contracts, profiles, and commit policy. For architecture, testing, and coding conventions, see [docs/engineering](engineering/README.md).

## DeepSeek Harness plugin

The plugin lives in [`dsh-plugin/`](../dsh-plugin/README.md). It has its own gate because the Go harness does not build or test JavaScript:

```shell
npm --prefix dsh-plugin install
npm --prefix dsh-plugin run typecheck
npm --prefix dsh-plugin test
npm --prefix dsh-plugin run build
```

`dsh-plugin/lib/` is generated (and ignored by git); rebuild before installing the local checkout into a Harness profile. Tests and manual GUI checks use `dsh-plugin/test/fake-agy-auth.mjs`, which speaks the real JSON envelope. See [the plugin guide](dsh-plugin.md) for installation and configuration.

## Packaging and release

`npm pack` cross-compiles all six platform binaries into `npm/vendor/`; the Node shim in `npm/bin/agy-auth.js` dispatches to the right one. The GitHub release workflow publishes the npm package using the `NPM_TOKEN` secret.

See [docs/release.md](release.md) for the release process and [CONTRIBUTING.md](../CONTRIBUTING.md) for pull-request expectations.

## Real-keyring test

The keyring integration test is opt-in because it writes to the real OS keyring:

```shell
AGY_AUTH_KEYRING_TEST=1 go test ./internal/agy -run TestKeyringRoundTrip -v
```

It uses a throwaway service name (`agy-auth-selftest`) and never touches the `gemini`/`antigravity` entry.
