Creates and maintains the managed entries inside the skills directories — and guarantees that
nothing else in those directories, and nothing the developer edited, is ever touched.

## User story

From the root `SPEC.md`:

- **Skills as dependencies** / **Skills in the repository** — each installed skill ends up as
  a committed directory agents can read on any checkout.
- **Hands-off syncing** — entries follow the installed packages: refreshed when outdated,
  removed when their package is gone.
- **Trust and control** — the developer's own files in the skills directories, and their
  edits to committed skill content, are sacrosanct.

## Business logic — TL;DR

- **Copying** — one managed entry per skill per target skills directory: a copy of the
  skill, carrying the entry marker; entries at the installed version are recognized and left
  alone, outdated ones refreshed.
- **Hands off everything unmanaged or hand-edited** — entries not created by
  `use-npm-skills` are never overwritten or deleted, and entries whose committed content the
  developer modified are never refreshed or removed; each case is warned about.
- **Removing stale entries** — managed entries whose skill is no longer wanted are removed;
  this also runs (and is all that runs) when zero skill packages are installed.
- **Migration from v0.1** — leftovers of the tool's former link-based mechanism are
  recognized and replaced or removed.

## Business logic

### Copying

#### User story

Skills as dependencies, Skills in the repository (root `SPEC.md`).

#### Business logic

- Each target skills directory is created if missing, and gets one managed entry per skill: a
  directory holding a copy of the skill's files. Nested `node_modules/` and `.git/`
  directories of the skill package are not copied.
- Every managed entry carries the entry marker recording the source package and version. A
  later run finding the entry at the installed package's version treats it as current
  (re-runs are no-ops); a different version refreshes the entry — a full replacement, not a
  merge.
- A copy that fails halfway is removed entirely rather than left behind.

#### Rationale

- A partial copy without its marker would look like a developer-owned entry and — per the
  hands-off rule — never be touched again, silently shadowing the skill. Hence: no marker,
  no leftover.

### Hands off everything unmanaged or hand-edited

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

- An entry that does not carry the entry marker was not created by `use-npm-skills` and is
  never overwritten or deleted — even when it occupies a managed (`npm-`-prefixed) name. It
  is warned about and skipped; the developer decides whether to remove it.
- A managed entry with uncommitted changes to its git-tracked content — the developer
  hand-edited committed skill files — is never refreshed or removed. The warning names the
  way out: revert the edits, or exclude the package.

### Removing stale entries

#### User story

Hands-off syncing (root `SPEC.md`).

#### Business logic

- Managed entries whose skill is not in the current set — the package was uninstalled,
  excluded, or no longer usable as a skill — are removed from the target skills directories.
  Only what `use-npm-skills` itself creates is removed: entries carrying the entry marker
  (and legacy links, see below). Anything else gets a warning and stays.
- When zero skill packages are installed, this cleanup is the only thing that happens, and
  only inside skills directories that already exist — no directory is created (see
  `src/sync.SPEC.md` for the zero-side-effects rule and the fresh-checkout protection).

### Migration from v0.1

#### User story

Hands-off syncing (root `SPEC.md`).

#### Business logic

`use-npm-skills` v0.1 materialized skills as links into `node_modules/` (kept out of version
control) instead of committed copies. Those leftovers are migrated on sight: a link occupying
a managed entry's spot is replaced by the committed copy, a stale link is removed, and the
former marker-file name is recognized so v0.1-era copies refresh cleanly.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
