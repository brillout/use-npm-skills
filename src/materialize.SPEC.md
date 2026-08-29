Creates and maintains the managed entries inside the skills directories — and guarantees that
nothing else in those directories is ever touched.

## User story

From the root `SPEC.md`:

- **Skills as dependencies** — each installed skill ends up as an entry agents can read.
- **Hands-off syncing** — entries follow the installed packages: refreshed when outdated,
  removed when their package is gone.
- **Trust and control** — the developer's own files in the skills directories are sacrosanct.

## Glossary

- **copy marker** — a file inside a managed copy (`.use-npm-skills-copy.json`) recording the
  source package and version; it is what marks the copy as managed, allowing later runs to
  refresh or remove it.

## Business logic — TL;DR

- **Linking** — one entry per skill per target skills directory, linking into
  `node_modules/`; correct entries are recognized and left alone, wrong ones replaced.
- **The copy fallback** — where links cannot be created, skills are copied instead, with a
  copy marker making the copies refreshable and removable.
- **Hands off everything unmanaged** — entries not created by `use-npm-skills` are never
  overwritten or deleted, only warned about.
- **Removing stale entries** — managed entries whose skill is no longer wanted are removed;
  this also runs (and is all that runs) when zero skill packages are installed.

## Business logic

### Linking

#### User story

Skills as dependencies (root `SPEC.md`).

#### Business logic

- Each target skills directory is created if missing, and gets one managed entry per skill:
  a link pointing at the skill's location inside `node_modules/`. On POSIX systems the links
  are relative; on Windows they are junctions — directory links that require no privilege but
  do require absolute targets, which is acceptable because managed entries never enter
  version control.
- An entry that already links to the right place is recognized and left untouched (re-runs
  are no-ops); a managed link pointing elsewhere is replaced.

### The copy fallback

#### User story

Skills as dependencies, Trust and control (root `SPEC.md`).

#### Business logic

- Where a link cannot be created (e.g. exotic file systems), the skill is copied into the
  skills directory instead, and the fallback is announced with the advice to re-run after
  updating skill packages (copies, unlike links, don't follow `node_modules/` on their own).
- A managed copy carries a copy marker recording the source package and version: a later run
  finding the same version treats the copy as current, a different version refreshes it.
  Copies are not converted back to links — on a system that needed copies once, retrying
  links on every run would churn.
- A copy that fails halfway is removed entirely rather than left behind.
- The `neverCopy` configuration replaces the fallback with a warning and a skip.

#### Rationale

- A partial copy without its marker would look like a developer-owned entry and — per the
  hands-off rule — never be touched again, silently shadowing the skill. Hence: no marker,
  no leftover.

### Hands off everything unmanaged

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

An entry that is neither a link nor a copy carrying the copy marker was not created by
`use-npm-skills` and is never overwritten or deleted — even when it occupies a managed
(`npm-`-prefixed) name. It is warned about and skipped; the developer decides whether to
remove it.

### Removing stale entries

#### User story

Hands-off syncing (root `SPEC.md`).

#### Business logic

- Managed-named entries whose skill is not in the current set — the package was uninstalled,
  excluded, or no longer usable as a skill — are removed from the target skills directories.
  Only what `use-npm-skills` itself creates is removed: links, and copies carrying the copy
  marker. Anything else gets a warning and stays.
- When zero skill packages are installed, this cleanup is the only thing that happens, and
  only inside skills directories that already exist — no directory is created (see
  `src/sync.SPEC.md` for the zero-side-effects rule).

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
