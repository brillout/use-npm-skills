Answers, for every run, the three questions everything else builds on: what kind of run is
this, which project does it operate on, and what has the developer configured?

## User story

From the root `SPEC.md`:

- **Skills as dependencies** — a run must find the one project (in a monorepo: the workspace
  root) that skills belong to.
- **Trust and control** — install-started runs must be recognized so they can be held to
  stricter rules, and configuration must let the developer disable each automation.

## Business logic — TL;DR

- **Kind of run** — lifecycle vs explicit, plus CI, global installs, and Yarn PnP; also a
  weaker "may be part of an install" notion for the exit-code policy.
- **The project root** — the nearest ancestor directory with a lockfile; fallbacks for
  lockfile-less projects.
- **Configuration** — four optional options under `use-npm-skills` in the project root's
  `package.json`; configuration problems warn and fall back to the defaults, never abort.

## Business logic

### Kind of run

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

- Every run is classified as either a lifecycle run — started by a package manager as part of
  an install, recognized from the environment package managers give their install scripts (an
  install-time script event, an install command in progress, or pnpm's script indicator) — or
  an explicit run. Lifecycle runs never modify `package.json` and never fail the install.
- A weaker classification, "may be part of an install", additionally treats runs started
  through `npx` as possibly install-started. It exists solely for the never-fail-an-install
  exit policy (see `cli.SPEC.md`).
- Also detected: CI (the `CI` environment variable set to anything but `false`/`0`), global
  installs of `use-npm-skills`, and Yarn PnP (a PnP runtime file at the project root).
- The directory a run starts from: explicit runs start from the current working directory;
  lifecycle runs start from the directory where the developer invoked the package manager
  (package managers run their scripts elsewhere, but pass that directory along).

#### Rationale

- `npx` rewrites the script environment, so the root postinstall hook running
  `npx use-npm-skills` is indistinguishable from a developer typing the same command — hence
  the weaker "may be part of an install" classification.

### The project root

#### User story

Skills as dependencies (root `SPEC.md`).

#### Business logic

- The project root — the directory everything operates on — is the nearest ancestor of the
  start directory containing a lockfile (recognized: `package-lock.json`,
  `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`).
- For projects without any lockfile: the nearest ancestor with a `node_modules/` directory;
  failing that, the nearest with a `package.json`; failing that, there is no project (see
  `src/sync.SPEC.md` for how runs react).

#### Rationale

- In a workspace, the lockfile lives at the monorepo root, so the lockfile rule lands there
  by construction — which is where skills belong: skills apply repo-wide, no matter which
  workspace directory a run starts from.

### Configuration

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

- Configuration lives in the project root's `package.json`, under the `use-npm-skills` key.
  All options are optional:
  - `postinstall` (default `true`) — `false` disables postinstall automation: lifecycle runs
    do nothing, and explicit runs don't add the root postinstall hook. Explicit runs still
    sync.
  - `gitCommit` (default `true`) — `false` disables automated commits; changes are still
    made, but left uncommitted for the developer to review.
  - `skillsDirs` (default `.claude/skills` and `.agents/skills`) — the skills directories to
    sync into. Each entry must be a relative path inside the project; entries are normalized,
    and invalid ones are dropped with a warning.
  - `exclude` (default empty) — skill packages, by name, whose skills are skipped (and
    removed if previously synced).
- Configuration problems never abort a run: an unreadable `package.json`, a malformed
  `use-npm-skills` value, unknown options, and wrongly typed values each produce a warning,
  and the defaults are kept.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
