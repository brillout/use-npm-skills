The lifecycle entry point — `use-npm-skills`' own install script. Every skill package depends
on `use-npm-skills`, so installing a skill package makes the package manager install
`use-npm-skills` and, if it runs dependency install scripts at all, run this script.

## User story

From the root `SPEC.md`:

- **Hands-off syncing** — installing skill packages syncs without the developer running
  anything.
- **Trust and control** — a script running inside the developer's install must never break
  that install.

## Business logic — TL;DR

- **Sync during the install** — locates the project from where the developer invoked the
  package manager and runs a lifecycle sync (`package.json` is never modified).
- **Write the stamp** — records that the package manager does run dependency install
  scripts; explicit runs use this to decide whether the root postinstall hook is needed.
- **Never fail, never global** — every error is swallowed (printed, then ignored) and the
  script always exits successfully; global installs of `use-npm-skills` do nothing.

## Business logic

### Sync during the install

#### User story

Hands-off syncing (root `SPEC.md`).

#### Business logic

The project is located from the directory where the developer invoked the package manager
(the package manager runs the script elsewhere, but passes that directory along). If no
project can be located, nothing happens. Otherwise the project is synced as a lifecycle run —
skills directories are brought up to date, and `package.json` is never modified (see
`src/sync.SPEC.md`).

### Write the stamp

#### User story

Hands-off syncing (root `SPEC.md`).

#### Business logic

Before syncing, the script writes the stamp: a file inside the project's `node_modules/`
recording that the package manager runs dependency install scripts. Explicit runs compare the
stamp against the lockfile — a stamp that is absent or older than the lockfile means the last
install demonstrably did not run this script (pnpm and Bun block dependency scripts by
default), and that is when the root postinstall hook gets added instead (see
`src/repoFiles.SPEC.md`).

### Never fail, never global

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

- The script never exits with a failure: any error is printed and then ignored, because a
  failing dependency install script would fail the developer's whole install.
- Global installs of `use-npm-skills` do nothing — there is no project to operate on.

#### Rationale

- npm hides the output of dependency install scripts, so nothing about this script's behavior
  relies on its output being seen.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
