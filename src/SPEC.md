Implements the whole product: the `npx use-npm-skills` command and the sync [1] flow behind it, published as the `use-npm-skills` npm package (also usable as a library).

Sync runs as a pipeline; each step is one file:

1. Resolve the project root [2] — `resolveRoot.SPEC.md`
2. Enumerate the skills of the installed skill packages [3] — `enumerate.SPEC.md`
3. Determine the target skills directories [4] — `targets.SPEC.md`
4. Analyze the existing mirroring structure — `analyze.SPEC.md`
5. Materialize [5] each skill — `materialize.SPEC.md`
6. Prune orphaned skills — `prune.SPEC.md`

`sync.SPEC.md` describes the orchestration of these steps; `cli.SPEC.md` the command-line interface on top; `hooks.SPEC.md` the two commands a skill package's own lifecycle scripts run to install or remove that one package's skills. Supporting files: `config.SPEC.md` (the `.use-npm-skills.json` config file), `hash.SPEC.md` (skill content identity), `gitSymlinks.SPEC.md` (Windows: is Git symlink support available?), `index.SPEC.md` (library entry point), `types.SPEC.md` (shared vocabulary), `logger.SPEC.md` and `fsUtils.SPEC.md` (infrastructure).

## Glossary

[1] sync: the tool's one and only action — materialize the skills of all installed skill packages into the project's skills directories and prune the skills of packages that were removed.

[2] project root: the directory where skills are installed — the Git repository root (the nearest ancestor of the working directory containing a `.git` entry); outside a Git repository, the nearest ancestor containing a package-manager lockfile, or failing that the working directory itself.

[3] skill package: an installed npm package shipping one or more skills, each as a `skills/<name>/` directory — the `skills/` directory is the only marker.

[4] skills directory: a directory where AI agents look for skills (e.g. `.claude/skills/`, `.agents/skills/`); each skill in it is a subdirectory containing a `SKILL.md`.

[5] materialize: write a skill shipped by a skill package [3] into the project's skills directories as real, committed files.

## Business logic — TL;DR

- **The sync pipeline** - one deterministic pass: resolve root, enumerate, target, analyze, materialize, prune.
- **Package hooks** - `install-package` and `uninstall-package` run the same pipeline for a single package, from that package's own lifecycle scripts (`hooks.SPEC.md`).
- **Reported outcome per skill** - every skill ends the run with exactly one recorded outcome, and the exit code reflects whether local modifications blocked the sync.

## Business logic

### The sync pipeline

#### User story

The developer runs `npx use-npm-skills` after adding, updating, or removing skill packages and expects the skills directories to match the installed packages afterwards — without ever losing hand-written content.

#### Business logic

Sync [1] always runs the full pipeline above, in order, over the skills of all installed skill packages [3]. Running it twice in a row changes nothing the second time (it is idempotent). Steps 1–4 only read; steps 5–6 are the only ones that write.

### Reported outcome per skill

#### Problem

The user needs to see what the run did, and scripts (e.g. CI) need a machine-checkable signal that the skills directories are in sync.

#### Business logic

Every skill processed by a run ends with exactly one outcome: added, updated, up-to-date, forcibly overwritten, kept (overwrite declined), left untouched because modified locally, skipped (user-authored content in the way, or a skill-name collision), excluded by config, removed, or adopted as user-authored. The run exits with code 0 on success and non-zero when locally modified skills were found and left untouched, or when an error occurred.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
