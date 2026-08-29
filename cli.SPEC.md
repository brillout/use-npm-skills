The command-line interface — the entry point for explicit runs (`npx use-npm-skills`): command
dispatch, and the error and exit-code policy.

## User story

From the root `SPEC.md`:

- **Skills as dependencies** / **Publishing skills** — the two commands.
- **Trust and control** — the exit-code policy: never fail a package manager install.

## Business logic — TL;DR

- **Commands** — no argument (or `sync`) syncs the project; `init` scaffolds a skill package;
  help and version options; anything else fails with the usage text.
- **Never fail an install** — deliberate errors always fail the run; unexpected errors fail
  it too, except for a sync that may have been started by a package manager install, which
  reports the error but exits successfully.

## Business logic

### Commands

#### User story

Skills as dependencies, Publishing skills (root `SPEC.md`).

#### Business logic

- No argument, or `sync`: sync the project (see `src/sync.SPEC.md`).
- `init`: scaffold a skill package in the current directory (see `src/init.SPEC.md`).
- `--help` / `-h` / `help`: print the usage text — the commands, the options, and a link to
  the documentation.
- `--version` / `-v`: print the version.
- Any other argument: an error naming the argument, plus the usage text; the run fails.

### Never fail an install

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

- Deliberate errors — a bad invocation or an unusable environment — are reported as a single
  message without a stack trace, and always fail the run (non-zero exit code).
- Unexpected errors are reported with their stack trace and fail the run — with one
  exception: a sync run that may have been started by a package manager install reports the
  error but exits successfully, saying why, so the developer's install is not broken.
- `init` has no such exception: it is never run by installs, so it always fails on errors.

#### Rationale

- A failing install script fails the developer's whole install. Whether the process was
  started by an install cannot always be told: the root postinstall hook runs
  `npx use-npm-skills`, and `npx` rewrites the script environment such that the spawned
  process looks exactly like a developer-typed `npx use-npm-skills`. Sync therefore errs on
  the side of exiting successfully whenever an install context cannot be ruled out.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
