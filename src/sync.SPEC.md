Orchestrates one sync run: resolves the project root, loads the config, enumerates the installed skill packages, determines and analyzes the skills directories, materializes every skill, prunes orphans, and returns a structured result (what happened per skill, all warnings, and the exit code). Both the command line (`cli.SPEC.md`) and library users (`index.SPEC.md`) go through it.

## Business logic — TL;DR

- **Pipeline order** - read-only steps first, then materialize, then prune; each step's spec carries its own rules.
- **Preconditions** - no lockfile or no `node_modules/` is a usage error; Yarn PnP is detected and reported as unsupported, doing nothing, exit 0.
- **Config exclusion** - packages listed in the config's `exclude` are reported as excluded and treated as not installed.
- **Result and exit code** - a summary line reports how many skills are in sync and where; exit code 1 if and only if locally modified skills were left untouched.

## Business logic

### Pipeline order

#### Problem

The steps depend on each other's outputs (e.g. mirroring decisions must be made before any file is written), and a partial or reordered run could destroy user content or leave directories half-synced.

#### Business logic

A run executes exactly: resolve project root (`resolveRoot.SPEC.md`) → load config (`config.SPEC.md`) → enumerate skill packages (`enumerate.SPEC.md`) → determine target skills directories (`targets.SPEC.md`) → analyze the existing structure (`analyze.SPEC.md`) → materialize each skill (`materialize.SPEC.md`) → prune orphans (`prune.SPEC.md`). With `--force`, the list of locally modified skills is computed and shown before any overwriting starts, so the user sees everything at stake up front.

### Preconditions

#### Problem

Without a lockfile there is no project root, and without `node_modules/` there is nothing to enumerate — the tool cannot guess what the user meant.

#### Business logic

No lockfile in the working directory or any ancestor is a usage error telling the user to run their package manager's install first. A project using Yarn Plug'n'Play (a `.pnp.cjs` or `.pnp.js` file at the project root) is unsupported: the run reports this, does nothing, and exits 0.

#### Rationale

Yarn PnP has no `node_modules/` directory to scan; supporting it is explicitly out of scope. Exiting 0 keeps the tool harmless in repositories where it can't work.

### Config exclusion

#### User story

The developer wants to keep a skill package installed (e.g. as a transitive requirement or to keep their locally edited copy of its skill) without the tool materializing it.

#### Business logic

Each installed skill package whose name is listed in the config file's `exclude` is reported as excluded and otherwise treated exactly as if it were not installed — its skill is not materialized, and an existing materialized copy is handled like that of any uninstalled package: removed if unmodified, kept as the user's own skill if locally edited (see `prune.SPEC.md`).

### Result and exit code

#### Problem

Users and scripts need to know what a run did without reading every log line.

#### Business logic

When no skill package is installed, the run says so and explains what makes a package a skill package. Otherwise it summarizes how many skills are in sync across which skills directories. The run's result carries the project root, the target skills directories, the mirroring analysis, one outcome per skill, and all warnings. Exit code: 1 if locally modified skills were found and left untouched, 0 otherwise.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
